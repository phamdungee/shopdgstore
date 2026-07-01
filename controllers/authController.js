const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');
const { createToken, writeLoginLog, safeUser } = require('../services/storeService');
const { verifyGoogleToken } = require('../services/googleAuth');
const { verifyGithubCode } = require('../services/githubAuth');
const { verifyFacebookToken } = require('../services/facebookAuth');

async function handleOAuthSuccess(req, res, { email, name, picture, provider }) {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, status, email_verified, avatar_url, balance')
      .eq('email', email);

    if (error) {
      console.error(`${provider} OAuth database error:`, error);
      return res.status(500).json({ ok: false, message: 'Database error' });
    }

    let user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      // Create new user. Since password_hash column is NOT NULL in database schema,
      // we generate a secure hashed random placeholder password.
      const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username: email.split('@')[0] + '_' + Math.floor(Math.random() * 10000),
          email: email,
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
        console.error(`${provider} OAuth insert error:`, insertError);
        return res.status(500).json({ ok: false, message: 'Could not create account', error: insertError.message });
      }
      user = newUser;
    } else {
      if (user.status === 'banned') {
        return res.status(403).json({ ok: false, message: 'Tài khoản của bạn đã bị khoá.' });
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
      user: safeUser(user)
    });
  } catch (err) {
    console.error(`${provider} OAuth completion error:`, err);
    return res.status(500).json({ ok: false, message: 'Internal server error during login' });
  }
}

async function googleLogin(req, res) {
  try {
    const { credential, accessToken } = req.body;
    if (!credential && !accessToken) {
      return res.status(400).json({ ok: false, message: 'Missing Google credential or accessToken' });
    }
    const profile = await verifyGoogleToken(credential || accessToken, !!accessToken);
    return handleOAuthSuccess(req, res, { ...profile, provider: 'Google' });
  } catch (err) {
    console.error('Google Login controller error:', err);
    return res.status(500).json({ ok: false, message: 'Google authentication failed', error: err.message });
  }
}

async function githubLogin(req, res) {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ ok: false, message: 'Missing GitHub authorization code' });
    }
    const profile = await verifyGithubCode(code);
    return handleOAuthSuccess(req, res, { ...profile, provider: 'GitHub' });
  } catch (err) {
    console.error('GitHub Login controller error:', err);
    return res.status(500).json({ ok: false, message: 'GitHub authentication failed', error: err.message });
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
