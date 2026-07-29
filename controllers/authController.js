const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');
const { createToken, writeLoginLog, safeUser } = require('../services/storeService');
const { verifyGoogleToken } = require('../services/googleAuth');
const { verifyGithubCode } = require('../services/githubAuth');
const { verifyFacebookToken } = require('../services/facebookAuth');
const crypto = require('crypto');

function oauthRequestId() {
  return crypto.randomBytes(5).toString('hex');
}

async function handleOAuthSuccess(req, res, { email, name, picture, provider, requestId }) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ ok: false, message: `${provider} không cung cấp email hợp lệ`, requestId });
    }

    const { data: userByEmail, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, status, email_verified, avatar_url, balance')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error) {
      console.error(`[OAuth ${requestId}] ${provider} database lookup error:`, error);
      return res.status(500).json({ ok: false, message: 'Không thể kiểm tra tài khoản trong cơ sở dữ liệu', requestId });
    }

    let user = userByEmail;

    if (!user) {
      // Create new user. Since password_hash column is NOT NULL in database schema,
      // we generate a secure hashed random placeholder password.
      const randomPassword = crypto.randomBytes(32).toString('base64url');
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      const usernameBase = normalizedEmail
        .split('@')[0]
        .replace(/[^a-zA-Z0-9_.-]/g, '_')
        .slice(0, 38) || 'oauth_user';
      const username = `${usernameBase}_${crypto.randomBytes(4).toString('hex')}`;

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username,
          email: normalizedEmail,
          full_name: name,
          avatar_url: picture,
          password_hash: passwordHash,
          email_verified: true,
          status: 'active',
          role: 'user',
          balance: 0
        })
        .select('id, username, email, full_name, role, status, email_verified, avatar_url, balance')
        .single();

      if (insertError) {
        console.error(`[OAuth ${requestId}] ${provider} account insert error:`, insertError);
        return res.status(500).json({ ok: false, message: 'Không thể tạo tài khoản đăng nhập xã hội', requestId });
      }
      user = newUser;
    } else {
      if (user.status !== 'active') {
        return res.status(403).json({ ok: false, message: 'Tài khoản đang bị khoá hoặc chưa được kích hoạt.', requestId });
      }
      // Update avatar if not set
      if (!user.avatar_url && picture) {
        await supabase.from('users').update({ avatar_url: picture }).eq('id', user.id);
        user.avatar_url = picture;
      }
    }

    const token = createToken(user);
    await writeLoginLog({ userId: user.id, usernameOrEmail: user.email, req, success: true, reason: `Đăng nhập ${provider}` });

    return res.json({
      ok: true,
      message: `Đăng nhập ${provider} thành công`,
      token,
      user: safeUser(user),
      requestId
    });
  } catch (err) {
    console.error(`[OAuth ${requestId}] ${provider} completion error:`, err);
    return res.status(500).json({ ok: false, message: 'Máy chủ gặp lỗi khi hoàn tất đăng nhập', requestId });
  }
}

async function googleLogin(req, res) {
  const requestId = oauthRequestId();
  try {
    const { credential, accessToken } = req.body;
    if (!credential && !accessToken) {
      return res.status(400).json({ ok: false, message: 'Missing Google credential or accessToken', requestId });
    }
    const profile = await verifyGoogleToken(credential || accessToken, !!accessToken);
    return handleOAuthSuccess(req, res, { ...profile, provider: 'Google', requestId });
  } catch (err) {
    console.error(`[OAuth ${requestId}] Google Login controller error:`, err);
    return res.status(401).json({ ok: false, message: 'Google authentication failed', error: err.message, requestId });
  }
}

async function githubLogin(req, res) {
  const requestId = oauthRequestId();
  try {
    const { code, redirectUri } = req.body;
    if (!code) {
      return res.status(400).json({ ok: false, message: 'Missing GitHub authorization code', requestId });
    }
    const profile = await verifyGithubCode(code, redirectUri);
    return handleOAuthSuccess(req, res, { ...profile, provider: 'GitHub', requestId });
  } catch (err) {
    console.error(`[OAuth ${requestId}] GitHub Login controller error:`, err);
    return res.status(401).json({ ok: false, message: 'GitHub authentication failed', error: err.message, requestId });
  }
}

async function facebookLogin(req, res) {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ ok: false, message: 'Missing Facebook accessToken' });
    }
    const profile = await verifyFacebookToken(accessToken);
    return handleOAuthSuccess(req, res, { ...profile, provider: 'Facebook' });
  } catch (err) {
    console.error('Facebook Login controller error:', err);
    return res.status(500).json({ ok: false, message: 'Facebook authentication failed', error: err.message });
  }
}

module.exports = {
  googleLogin,
  githubLogin,
  facebookLogin
};
