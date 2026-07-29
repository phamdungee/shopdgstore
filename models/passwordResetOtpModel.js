const supabase = require('../config/supabase');

async function invalidateActiveOtps(email) {
  const { error } = await supabase
    .from('password_reset_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', email)
    .is('consumed_at', null);
  if (error) throw error;
}

async function createOtp(record) {
  const { data, error } = await supabase
    .from('password_reset_otps')
    .insert(record)
    .select('id, user_id, email, expires_at, attempts, verified, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function deleteOtp(id) {
  const { error } = await supabase.from('password_reset_otps').delete().eq('id', id);
  if (error) throw error;
}

async function findLatestByEmail(email) {
  const { data, error } = await supabase
    .from('password_reset_otps')
    .select('id, user_id, email, otp_hash, expires_at, attempts, verified, verified_at, locked_at, consumed_at, reset_token_hash, reset_token_expires_at, created_at')
    .eq('email', email)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recordFailedAttempt(id, maxAttempts) {
  const { data, error } = await supabase.rpc('record_password_reset_otp_failure', {
    p_otp_id: id,
    p_max_attempts: maxAttempts
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function markVerified({ id, tokenHash, tokenExpiresAt, maxAttempts }) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('password_reset_otps')
    .update({
      verified: true,
      verified_at: now,
      reset_token_hash: tokenHash,
      reset_token_expires_at: tokenExpiresAt
    })
    .eq('id', id)
    .eq('verified', false)
    .is('consumed_at', null)
    .lt('attempts', maxAttempts)
    .gt('expires_at', now)
    .select('id, user_id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findResetGrant(id) {
  const { data, error } = await supabase
    .from('password_reset_otps')
    .select('id, user_id, verified, consumed_at, reset_token_hash, reset_token_expires_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function completePasswordReset({ otpId, userId, passwordHash, tokenHash }) {
  const { data, error } = await supabase.rpc('complete_password_reset', {
    p_otp_id: otpId,
    p_user_id: String(userId),
    p_password_hash: passwordHash,
    p_token_hash: tokenHash
  });
  if (error) throw error;
  return data === true;
}

async function writeAuditLog(record) {
  const { error } = await supabase.from('password_reset_audit_logs').insert(record);
  if (error) throw error;
}

module.exports = {
  invalidateActiveOtps,
  createOtp,
  deleteOtp,
  findLatestByEmail,
  recordFailedAttempt,
  markVerified,
  findResetGrant,
  completePasswordReset,
  writeAuditLog
};
