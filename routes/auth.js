const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const supabase = require('../config/supabase');
const { googleLogin, githubLogin } = require('../controllers/authController');
const { loginLimiter, registerLimiter } = require('../middlewares/rateLimitMiddleware');
const verifyTurnstile = require('../middlewares/turnstileMiddleware');

const {
  normalizeString,
  safeUser,
  createToken,
  writeLoginLog,
  findUserByUsernameOrEmail
} = require('../services/storeService');

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 12;
const authAttempts = new Map();

function authClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function authLimitKey(req, scope, identity = '') {
  return `${scope}:${authClientIp(req)}:${String(identity).toLowerCase().slice(0, 100)}`;
}

function isAuthRateLimited(req, scope, identity = '') {
  const now = Date.now();
  const key = authLimitKey(req, scope, identity);
  const entry = authAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > AUTH_MAX_ATTEMPTS;
}

function clearAuthRateLimit(req, scope, identity = '') {
  authAttempts.delete(authLimitKey(req, scope, identity));
}

router.post('/register', registerLimiter, verifyTurnstile, async (req, res) => {
  try {
    const username = normalizeString(req.body.username || req.body.uid);
    const email = normalizeString(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    const fullName = normalizeString(req.body.fullName || req.body.displayName || username);
    const phone = normalizeString(req.body.phone);

    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Vui lòng nhập username, email và mật khẩu' });
    }

    if (isAuthRateLimited(req, 'register', email || username)) {
      return res.status(429).json({ ok: false, message: 'Qua nhieu yeu cau dang ky, vui long thu lai sau' });
    }

    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
      return res.status(400).json({
        ok: false,
        message: 'Username chỉ dùng chữ, số, dấu gạch dưới, dấu chấm, gạch ngang và dài 3-50 ký tự'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Email không hợp lệ' });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('id, username, email')
      .or(`username.eq.${username},email.eq.${email}`)
      .limit(1);

    if (checkError) {
      console.error('Lỗi kiểm tra tài khoản:', checkError);
      return res.status(500).json({ ok: false, message: 'Lỗi kiểm tra tài khoản' });
    }

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ ok: false, message: 'Username hoặc email đã được sử dụng' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        phone: phone || null,
        full_name: fullName,
        password_hash: passwordHash,
        role: 'user',
        balance: 0,
        status: 'active',
        email_verified: true
      })
      .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
      .single();

    if (error) {
      console.error('Lỗi tạo tài khoản:', error);
      return res.status(500).json({ ok: false, message: 'Lỗi khi tạo tài khoản' });
    }

    return res.status(201).json({
      ok: true,
      message: 'Đăng ký thành công',
      user: safeUser(newUser)
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi đăng ký' });
  }
});

router.post('/login', loginLimiter, verifyTurnstile, async (req, res) => {
  const usernameOrEmail = normalizeString(req.body.usernameOrEmail || req.body.username || req.body.uid);
  const password = String(req.body.password || '');

  try {
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ ok: false, message: 'Vui lòng nhập tài khoản và mật khẩu' });
    }

    const invalidLoginMessage = 'Tai khoan hoac mat khau khong chinh xac';
    if (isAuthRateLimited(req, 'login', usernameOrEmail)) {
      await writeLoginLog({ usernameOrEmail, req, success: false, reason: 'Dang nhap bi chan do qua nhieu lan thu' });
      return res.status(429).json({ ok: false, message: 'Qua nhieu lan dang nhap that bai, vui long thu lai sau' });
    }

    const user = await findUserByUsernameOrEmail(usernameOrEmail);

    if (!user) {
      await writeLoginLog({ usernameOrEmail, req, success: false, reason: 'Tài khoản không tồn tại' });
      return res.status(401).json({ ok: false, message: invalidLoginMessage });
    }

    if (user.status !== 'active') {
      await writeLoginLog({
        userId: user.id,
        usernameOrEmail,
        req,
        success: false,
        reason: `Tài khoản không active: ${user.status}`
      });
      return res.status(403).json({ ok: false, message: 'Tài khoản đang bị khóa hoặc bị cấm' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await writeLoginLog({ userId: user.id, usernameOrEmail, req, success: false, reason: 'Sai mật khẩu' });
      return res.status(401).json({ ok: false, message: invalidLoginMessage });
    }

    clearAuthRateLimit(req, 'login', usernameOrEmail);

    const { data: updatedUser } = await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
      .single();

    await writeLoginLog({ userId: user.id, usernameOrEmail, req, success: true, reason: 'Đăng nhập thành công' });

    const finalUser = updatedUser || user;
    const token = createToken(finalUser);

    return res.json({
      ok: true,
      message: 'Đăng nhập thành công',
      token,
      user: safeUser(finalUser)
    });
  } catch (err) {
    console.error('Login error:', err);
    await writeLoginLog({ usernameOrEmail, req, success: false, reason: 'Lỗi server/database' });
    return res.status(500).json({ ok: false, message: 'Lỗi server khi đăng nhập' });
  }
});

router.post('/setup-admin', async (req, res) => {
  try {
    const setupKey = String(req.body.setupKey || '');
    const username = normalizeString(req.body.username || 'admin');
    const email = normalizeString(req.body.email || 'admin@dgstore.local').toLowerCase();
    const password = String(req.body.password || '');
    const fullName = normalizeString(req.body.fullName || 'Quản trị viên');

    if (isAuthRateLimited(req, 'setup-admin', username || email)) {
      return res.status(429).json({ ok: false, message: 'Qua nhieu yeu cau tao admin, vui long thu lai sau' });
    }

    if (!process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({ ok: false, message: 'Chưa cấu hình ADMIN_SETUP_KEY trong .env' });
    }

    if (setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({ ok: false, message: 'Sai setupKey' });
    }

    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Thiếu username, email hoặc password' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: admin, error } = await supabase
      .from('users')
      .insert({
        username,
        email,
        full_name: fullName,
        password_hash: passwordHash,
        role: 'admin',
        balance: 0,
        status: 'active',
        email_verified: true
      })
      .select('id, username, email, full_name, role, created_at')
      .single();

    if (error) {
      console.error('Setup admin error:', error);
      return res.status(500).json({
        ok: false,
        message: 'Không tạo được admin, có thể username/email đã tồn tại'
      });
    }

    return res.status(201).json({ ok: true, message: 'Tạo admin thành công', user: admin });
  } catch (err) {
    console.error('Setup admin server error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi tạo admin' });
  }
});

router.post('/logout', (req, res) => {
  return res.json({ ok: true, message: 'Đăng xuất thành công' });
});

router.get('/auth/config', (req, res) => {
  return res.json({
    ok: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    cloudflareTurnstileSiteKey: process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'
  });
});

router.post('/auth/google', googleLogin);
router.post('/auth/github', githubLogin);

module.exports = router;
