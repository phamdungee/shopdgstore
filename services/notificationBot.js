const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_CHAT_ID
} = require('../config/env');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendOperationalAlert(message, options = {}) {
  const chatId = String(options.chatId || TELEGRAM_ADMIN_CHAT_ID || '').trim();
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    return { ok: false, skipped: true, reason: 'notification bot is not configured' };
  }

  const requestBody = {
    chat_id: chatId,
    text: String(message || '').slice(0, 4000),
    disable_web_page_preview: true
  };
  if (options.parseMode) requestBody.parse_mode = options.parseMode;

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(10000)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram returned HTTP ${response.status}`);
  }
  return { ok: true, messageId: payload.result?.message_id };
}

function formatSupportAlert(ticket) {
  return [
    '<b>DG Store - yêu cầu hỗ trợ mới</b>',
    `Mã: <code>${escapeHtml(ticket.id)}</code>`,
    `Loại: ${escapeHtml(ticket.type)}`,
    `Tiêu đề: ${escapeHtml(ticket.subject)}`,
    `Khách hàng: <code>${escapeHtml(ticket.user_id)}</code>`
  ].join('\n');
}

module.exports = {
  escapeHtml,
  formatSupportAlert,
  sendOperationalAlert
};
