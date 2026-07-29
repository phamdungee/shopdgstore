const express = require('express');
const supabase = require('../config/supabase');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { formatSupportAlert, sendOperationalAlert } = require('../services/notificationBot');

const router = express.Router();
const WARRANTY_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

async function findEligibleOrder(userId, orderId) {
  let { data, error } = await supabase.from('store_orders')
    .select('id, order_code, status, completed_at').eq('id', orderId).eq('user_id', userId).maybeSingle();
  if (error && (`${error.message || ''}`.includes('completed_at') || ['42703', 'PGRST204'].includes(error.code))) {
    const legacyResult = await supabase.from('store_orders')
      .select('id, order_code, status, created_at').eq('id', orderId).eq('user_id', userId).maybeSingle();
    data = legacyResult.data ? { ...legacyResult.data, completed_at: legacyResult.data.created_at } : null;
    error = legacyResult.error;
  }
  if (error) throw error;
  const completedAt = data?.completed_at ? new Date(data.completed_at).getTime() : 0;
  return { order: data, eligible: data?.status === 'completed' && completedAt > 0 && Date.now() - completedAt <= WARRANTY_WINDOW_MS };
}

router.get('/support/tickets', authMiddleware, async (req, res) => {
  const { data, error } = await supabase.from('support_tickets').select('id, order_id, type, subject, message, status, created_at, updated_at')
    .eq('user_id', String(req.user.userId)).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ ok: false, message: 'Không thể tải yêu cầu hỗ trợ.' });
  return res.json({ ok: true, tickets: data || [] });
});

router.get('/orders/:id/warranty-eligibility', authMiddleware, async (req, res) => {
  try {
    const result = await findEligibleOrder(req.user.userId, req.params.id);
    if (!result.order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
    const deadline = result.order.completed_at ? new Date(new Date(result.order.completed_at).getTime() + WARRANTY_WINDOW_MS).toISOString() : null;
    return res.json({ ok: true, eligible: result.eligible, deadline });
  } catch { return res.status(500).json({ ok: false, message: 'Không thể kiểm tra bảo hành.' }); }
});

router.post('/support/tickets', authMiddleware, async (req, res) => {
  try {
    const type = req.body.type === 'warranty' ? 'warranty' : 'support';
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    const orderId = req.body.orderId ? String(req.body.orderId) : null;
    if (subject.length < 3 || subject.length > 160 || message.length < 10 || message.length > 5000) {
      return res.status(400).json({ ok: false, message: 'Nội dung hỗ trợ không hợp lệ.' });
    }
    if (type === 'warranty') {
      if (!orderId) return res.status(400).json({ ok: false, message: 'Yêu cầu bảo hành phải gắn với đơn hàng.' });
      const result = await findEligibleOrder(req.user.userId, orderId);
      if (!result.order) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
      if (!result.eligible) return res.status(409).json({ ok: false, message: 'Thời hạn yêu cầu bảo hành 2 ngày đã kết thúc.' });
    }
    const { data, error } = await supabase.from('support_tickets').insert({
      user_id: String(req.user.userId), order_id: orderId, type, subject, message
    }).select('id, user_id, order_id, type, subject, message, status, created_at').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, message: 'Đơn hàng đã có yêu cầu bảo hành đang xử lý.' });
      throw error;
    }
    sendOperationalAlert(formatSupportAlert(data), { parseMode: 'HTML' }).catch(error => console.error('[Support bot]', error.message));
    return res.status(201).json({ ok: true, ticket: data });
  } catch (error) {
    console.error('[Support]', error.message);
    return res.status(500).json({ ok: false, message: 'Không thể tạo yêu cầu hỗ trợ.' });
  }
});

module.exports = router;
