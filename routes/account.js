const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const supabase = require('../config/supabase');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { DEPOSIT_BANK, DEPOSIT_MIN_AMOUNT } = require('../config/env');
const {
  normalizeString,
  safeUser,
  makeDepositMemo,
  safeOrder,
  safeWalletTransaction,
  ORDER_PUBLIC_SELECT
} = require('../services/storeService');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, phone, full_name, role, balance, avatar_url, status, email_verified, created_at, last_login_at')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản' });
    }

    return res.json({ ok: true, user: safeUser(user) });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi lấy thông tin tài khoản' });
  }
});

router.get('/deposit-info', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, phone, full_name, role, balance, avatar_url, status, email_verified, created_at, last_login_at')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ ok: false, message: 'Khong tim thay tai khoan' });
    }

    return res.json({
      ok: true,
      minAmount: DEPOSIT_MIN_AMOUNT,
      memo: makeDepositMemo(user.id),
      bank: DEPOSIT_BANK,
      user: safeUser(user)
    });
  } catch (err) {
    console.error('Deposit info error:', err);
    return res.status(500).json({ ok: false, message: 'Loi server khi lay thong tin nap tien' });
  }
});

router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const fullName = normalizeString(req.body.fullName);
    const phone = normalizeString(req.body.phone);

    if (fullName && fullName.length > 100) {
      return res.status(400).json({ ok: false, message: 'Họ tên không được vượt quá 100 ký tự' });
    }

    if (phone && !/^[0-9+\-\s().]{8,20}$/.test(phone)) {
      return res.status(400).json({ ok: false, message: 'Số điện thoại không hợp lệ' });
    }

    const updateData = {
      full_name: fullName || null,
      phone: phone || null
    };

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.user.userId)
      .select('id, username, email, phone, full_name, role, balance, avatar_url, status, email_verified, created_at, last_login_at')
      .single();

    if (error || !user) {
      console.error('Update profile error:', error);
      return res.status(500).json({ ok: false, message: 'Không cập nhật được hồ sơ tài khoản' });
    }

    return res.json({
      ok: true,
      message: 'Cập nhật hồ sơ thành công',
      user: safeUser(user)
    });
  } catch (err) {
    console.error('Profile update server error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi cập nhật hồ sơ' });
  }
});

router.patch('/password', authMiddleware, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const confirmPassword = String(req.body.confirmPassword || '');

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ ok: false, message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, message: 'Xác nhận mật khẩu mới không khớp' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ ok: false, message: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, password_hash')
      .eq('id', req.user.userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ ok: false, message: 'Mật khẩu hiện tại không chính xác' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', req.user.userId);

    if (updateError) {
      console.error('Password update error:', updateError);
      return res.status(500).json({ ok: false, message: 'Không cập nhật được mật khẩu' });
    }

    return res.json({ ok: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error('Password update server error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi đổi mật khẩu' });
  }
});

router.get('/account/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data: orders, error: ordersError } = await supabase
      .from('store_orders')
      .select(ORDER_PUBLIC_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (ordersError) {
      console.error('Account orders query error:', ordersError);
      return res.status(500).json({ ok: false, message: 'Chưa đọc được bảng store_orders. Hãy chạy file database-history.sql trong Supabase.' });
    }

    const { data: transactions, error: transactionsError } = await supabase
      .from('wallet_transactions')
      .select('id, transaction_code, type, amount, balance_before, balance_after, content, status, external_ref, created_at')
      .eq('user_id', userId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(80);

    if (transactionsError) {
      console.error('Account wallet_transactions query error:', transactionsError);
      return res.status(500).json({ ok: false, message: 'Chưa đọc được bảng wallet_transactions. Hãy chạy file database-history.sql trong Supabase.' });
    }

    const stats = (transactions || []).reduce((acc, item) => {
      const amount = Number(item.amount || 0);
      if (item.type === 'deposit' && item.status === 'paid' && amount > 0) acc.totalDeposit += amount;
      return acc;
    }, { totalDeposit: 0, totalSpent: 0 });
    stats.totalSpent = (orders || [])
      .filter(order => order.status === 'completed')
      .reduce((sum, order) => sum + Number(order.total_price || 0), 0);

    return res.json({
      ok: true,
      orders: (orders || []).map(safeOrder),
      transactions: (transactions || []).map(safeWalletTransaction),
      stats
    });
  } catch (err) {
    console.error('Account history server error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi tải lịch sử tài khoản' });
  }
});

module.exports = router;
