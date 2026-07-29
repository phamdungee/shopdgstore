const { RESEND_API_KEY, RESEND_FROM_EMAIL } = require('../config/env');

async function sendPasswordResetEmail({ email, resetUrl }) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) throw new Error('Resend is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Khôi phục tài khoản DG Store',
      html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu DG Store.</p><p><a href="${resetUrl}">Đặt lại mật khẩu</a></p><p>Liên kết chỉ dùng được một lần và sẽ sớm hết hạn. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>`,
      text: `Đặt lại mật khẩu DG Store: ${resetUrl}\nLiên kết chỉ dùng được một lần và sẽ sớm hết hạn.`
    }),
    signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Resend returned HTTP ${response.status}`);
  return payload;
}

module.exports = { sendPasswordResetEmail };
