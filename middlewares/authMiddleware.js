
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const supabase = require('../config/supabase');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, message: 'Chua dang nhap' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.userId) {
      return res.status(401).json({ ok: false, message: 'Token khong hop le' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, role, status')
      .eq('id', payload.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ ok: false, message: 'Tai khoan khong ton tai hoac token da het hieu luc' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ ok: false, message: 'Tai khoan dang bi khoa hoac bi cam' });
    }

    req.user = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    next();
  } catch {
    return res.status(401).json({ ok: false, message: 'Phien dang nhap da het han hoac khong hop le' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'Chi tai khoan admin moi duoc truy cap' });
  }
  next();
}

module.exports = {
  authMiddleware,
  adminMiddleware
};
