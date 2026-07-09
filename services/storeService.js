
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const supabase = require('../config/supabase');
const {
  JWT_SECRET,
  DEPOSIT_CODE_SECRET,
  DEPOSIT_BANK,
  DEPOSIT_MEMO_PREFIX,
  DEPOSIT_TTL_MS
} = require('../config/env');
const { sendTelegram } = require('../routes/tracking');

function normalizeString(value) {
  return String(value || '').trim();
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    fullName: user.full_name,
    role: user.role,
    balance: Number(user.balance || 0),
    avatarUrl: user.avatar_url,
    status: user.status,
    emailVerified: user.email_verified,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at
  };
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || null;
}

async function writeLoginLog({ userId = null, usernameOrEmail = null, req, success, reason = null }) {
  try {
    await supabase.from('login_logs').insert({
      user_id: userId,
      username_or_email: usernameOrEmail,
      ip_address: getClientIp(req),
      user_agent: req.headers['user-agent'] || null,
      success,
      reason
    });
  } catch (err) {
    console.error('⚠️ Không ghi được login_logs:', err.message);
  }
}





function makePublicCode(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}${time}${random}`;
}

function makeDepositMemo(userId) {
  const digest = crypto
    .createHmac('sha256', DEPOSIT_CODE_SECRET)
    .update(String(userId))
    .digest();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = 0;
  let bits = 0;
  let code = '';

  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && code.length < 8) {
      code += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (code.length >= 8) break;
  }

  return `${DEPOSIT_MEMO_PREFIX}${code}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDepositMemo(content) {
  const match = String(content || '').toUpperCase().match(new RegExp(`${escapeRegExp(DEPOSIT_MEMO_PREFIX)}[A-Z2-9]{8}`));
  return match ? match[0] : '';
}

function extractDepositCodes(content) {
  const matches = String(content || '').toUpperCase().match(/[A-Z0-9]{10}/g) || [];
  return [...new Set(matches)];
}

function makeRandomDepositMemo() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${DEPOSIT_MEMO_PREFIX}${code}`;
}

function depositContent(memo) {
  return String(memo || '').toUpperCase();
}

function depositQrUrl(amount, memo) {
  return `https://img.vietqr.io/image/${DEPOSIT_BANK.bin}-${DEPOSIT_BANK.account}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(DEPOSIT_BANK.owner)}`;
}

function normalizeBankCreditAmount(item) {
  const candidates = [
    item.creditAmount,
    item.transferAmount,
    item.amount,
    item.value,
    item.money,
    item.credit
  ];

  for (const value of candidates) {
    const amount = Math.floor(Number(value || 0));
    if (amount > 0) return amount;
  }

  return 0;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cassoTransactionParams() {
  const now = new Date();
  return {
    fromDate: formatDateOnly(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate: formatDateOnly(now),
    pageSize: 10,
    sort: 'DESC'
  };
}

function getCassoRecords(payload) {
  return payload?.data?.records || payload?.records || [];
}

function depositExpiresAt(createdAt = new Date()) {
  return new Date(new Date(createdAt).getTime() + DEPOSIT_TTL_MS).toISOString();
}

async function expireOldPendingDeposits(userId = null) {
  const cutoff = new Date(Date.now() - DEPOSIT_TTL_MS).toISOString();
  let query = supabase
    .from('wallet_transactions')
    .update({ status: 'expired' })
    .eq('type', 'deposit')
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  if (userId) query = query.eq('user_id', userId);

  const { error } = await query;
  if (error) throw error;
}

function writeDepositWebhookLog(entry) {
  const payload = {
    time: new Date().toISOString(),
    ...entry
  };

  const isVercel = process.env.VERCEL === '1';
  if (isVercel) {
    console.log('[Webhook Log]', JSON.stringify(payload));
    return;
  }

  try {
    const fs = require('fs');
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'deposit-webhooks.jsonl'),
      `${JSON.stringify(payload)}\n`,
      'utf8'
    );
  } catch (err) {
    console.error('Cannot write deposit webhook log:', err.message);
  }
}

function safeOrder(order) {
  return {
    id: order.id,
    code: order.order_code,
    productSlug: order.product_slug,
    productName: order.product_name,
    variantName: order.variant_name,
    quantity: Number(order.quantity || 0),
    unitPrice: Number(order.unit_price || 0),
    totalPrice: Number(order.total_price || 0),
    status: order.status,
    deliveryText: order.delivery_text,
    deliveryJson: order.delivery_json || null,
    responseData: order.response_data || null,
    costAmount: Number(order.cost_amount || 0),
    profit: Number(order.profit || 0),
    createdAt: order.created_at
  };
}

function safeWalletTransaction(transaction) {
  return {
    id: transaction.id,
    code: transaction.transaction_code,
    type: transaction.type,
    amount: Number(transaction.amount || 0),
    balanceBefore: Number(transaction.balance_before || 0),
    balanceAfter: Number(transaction.balance_after || 0),
    content: transaction.content,
    status: transaction.status,
    externalRef: transaction.external_ref,
    createdAt: transaction.created_at
  };
}

const USER_PUBLIC_SELECT = 'id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at';
const ORDER_PUBLIC_SELECT = 'id, order_code, product_slug, product_name, variant_name, quantity, unit_price, total_price, status, delivery_text, delivery_json, response_data, cost_amount, profit, created_at';

async function deductUserBalance(userId, amount) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(USER_PUBLIC_SELECT)
      .eq('id', userId)
      .single();

    if (userError || !user) {
      const err = new Error('Không tìm thấy tài khoản');
      err.statusCode = 404;
      throw err;
    }

    const balanceBefore = Number(user.balance || 0);
    if (balanceBefore < amount) {
      const err = new Error('Số dư không đủ để mua sản phẩm');
      err.statusCode = 400;
      throw err;
    }

    const balanceAfter = balanceBefore - amount;
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ balance: balanceAfter })
      .eq('id', userId)
      .eq('balance', balanceBefore)
      .select(USER_PUBLIC_SELECT)
      .maybeSingle();

    if (updateError) {
      console.error('Purchase balance update error:', updateError);
      const err = new Error('Không trừ được số dư tài khoản');
      err.statusCode = 500;
      throw err;
    }

    if (updatedUser) {
      return { user: updatedUser, balanceBefore, balanceAfter };
    }
  }

  const err = new Error('Số dư vừa thay đổi, vui lòng thử lại');
  err.statusCode = 409;
  throw err;
}

async function addUserBalance(userId, amount) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(USER_PUBLIC_SELECT)
      .eq('id', userId)
      .single();

    if (userError || !user) throw userError || new Error('User not found');

    const balanceBefore = Number(user.balance || 0);
    const balanceAfter = balanceBefore + amount;
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ balance: balanceAfter })
      .eq('id', userId)
      .eq('balance', balanceBefore)
      .select(USER_PUBLIC_SELECT)
      .maybeSingle();

    if (updateError) throw updateError;
    if (updatedUser) return { user: updatedUser, balanceBefore, balanceAfter };
  }

  throw new Error('Không hoàn được số dư sau nhiều lần thử');
}

async function writeWalletTransaction(payload) {
  const { error } = await supabase
    .from('wallet_transactions')
    .insert(payload);

  if (error) {
    console.error('Create wallet transaction warning:', error);
  }
}

function moneyValue(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function purchaseCostSnapshot(product, variant, quantity, totalPrice) {
  const unitCost = moneyValue(
    variant.cost_price ??
    variant.costPrice ??
    product.cost_price ??
    product.costPrice
  );
  const costAmount = unitCost * quantity;
  return {
    unitCost,
    costAmount,
    profit: totalPrice - costAmount
  };
}

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([_*`\[])/g, '\\$1');
}

function cleanBackticks(text) {
  if (!text) return '';
  return String(text).replace(/`/g, "'");
}

function stripAccents(text) {
  if (!text) return '';
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

async function notifyPurchaseFailure({ user, product, variantName, quantity, order, reason, responseData }) {
  const orderId = cleanBackticks(order ? (order.order_code || order.id || '-') : '-');
  const username = cleanBackticks(user ? user.username : '-');
  const userId = cleanBackticks(user ? user.id : '-');
  const productName = escapeMarkdown(product ? product.name : '-');
  const productSlug = cleanBackticks(product ? product.slug : '-');
  const variant = cleanBackticks(variantName || '-');
  const quantityVal = cleanBackticks(quantity || 0);

  const detail = {};
  const rawDetails = responseData?.responseData || responseData || {};
  
  let rawError = rawDetails.error || rawDetails.message;
  if (!rawError && rawDetails.response) {
    if (typeof rawDetails.response === 'string') {
      rawError = rawDetails.response;
    } else if (typeof rawDetails.response === 'object') {
      rawError = rawDetails.response.error || rawDetails.response.message || rawDetails.response.msg || rawDetails.response.desc || rawDetails.response.description || JSON.stringify(rawDetails.response);
    }
  }
  
  detail.error = rawError ? cleanBackticks(rawError).slice(0, 1000) : null;
  detail.adapterKey = cleanBackticks(rawDetails.adapterKey || '');
  detail.vendorId = cleanBackticks(rawDetails.vendorId || 'UNKNOWN');

  const error = {
    message: cleanBackticks(reason || 'Unknown error')
  };

  let extractedErrorReason = 'SYSTEM_ERROR';
  const fullErrorMsg = stripAccents(String(detail.error || error.message || '')).toLowerCase();
  
  if (fullErrorMsg.includes('balance') || fullErrorMsg.includes('so du') || fullErrorMsg.includes('het tien')) {
    extractedErrorReason = 'INSUFFICIENT_BALANCE';
  } else if (
    fullErrorMsg.includes('stock') ||
    fullErrorMsg.includes('het hang') ||
    fullErrorMsg.includes('khong du hang') ||
    fullErrorMsg.includes('kho noi bo') ||
    fullErrorMsg.includes('key') ||
    fullErrorMsg.includes('out of')
  ) {
    extractedErrorReason = 'OUT_OF_STOCK';
  } else if (fullErrorMsg.includes('khong du')) {
    extractedErrorReason = 'INSUFFICIENT_BALANCE';
  } else if (fullErrorMsg.includes('timeout') || fullErrorMsg.includes('network') || fullErrorMsg.includes('ket noi')) {
    extractedErrorReason = 'TIMEOUT_OR_NETWORK';
  } else if (responseData?.code) {
    extractedErrorReason = responseData.code;
  } else if (reason) {
    extractedErrorReason = reason
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || 'UNKNOWN_ERROR';
  }
  extractedErrorReason = escapeMarkdown(extractedErrorReason);

  const text = `🚨 🔴 *[DG STORE SYSTEM] FULFILLMENT FAILED*
──────────────────────────────
🔄 *TRẠNG THÁI:* Đã tự động hoàn tiền nội bộ!

📦 *THÔNG TIN ĐƠN HÀNG:*
▪️ Mã đơn: \`${orderId}\`
▪️ Khách hàng: \`${username}\`
▪️ ID User: \`${userId}\`

🛒 *CHI TIẾT SẢN PHẨM:*
▪️ Tên hàng: ${productName} (\`${productSlug}\`)
▪️ Phân loại: Gói \`${variant}\` | Số lượng: \`${quantityVal}\`

⚠️ *NGUYÊN NHÂN THẤT BẠI:*
▪️ Log: \`${detail.error || error.message}\`
▪️ Đối tác: \`${detail.adapterKey ? detail.adapterKey.toUpperCase() : 'UNKNOWN'}\` (ID: ${detail.vendorId})
▪️ Chi tiết lỗi: 🛑 *[${extractedErrorReason}] VÍ ĐẠI LÝ HẾT TIỀN / LỖI HỆ THỐNG!*

──────────────────────────────
💡 *ĐIỀU HƯỚNG:* Sếp vui lòng kiểm tra tài khoản và nạp thêm tiền cho đối tác để thông luồng đơn hàng!`;

  try {
    let adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) {
      try {
        const fs = require('fs');
        const botConfigPath = path.join(__dirname, '..', 'bottracking', 'bot-config.json');
        if (fs.existsSync(botConfigPath)) {
          const config = JSON.parse(fs.readFileSync(botConfigPath, 'utf8'));
          adminChatId = config.telegramChatId;
        }
      } catch (_) {}
    }
    if (!adminChatId) {
      adminChatId = process.env.TELEGRAM_CHAT_ID;
    }

    await sendTelegram(text, adminChatId, 'Markdown');
  } catch (err) {
    console.error('Telegram purchase failure alert warning:', err.message);
  }
}

async function findUserByUsernameOrEmail(usernameOrEmail) {
  const value = normalizeString(usernameOrEmail);

  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, phone, full_name, password_hash, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
    .or(`username.ilike.${value},email.ilike.${value}`)
    .limit(1);

  if (error) throw error;
  return data && data.length ? data[0] : null;
}


module.exports = {
  normalizeString,
  safeUser,
  createToken,
  getClientIp,
  writeLoginLog,
  makePublicCode,
  makeDepositMemo,
  escapeRegExp,
  extractDepositMemo,
  extractDepositCodes,
  makeRandomDepositMemo,
  depositContent,
  depositQrUrl,
  normalizeBankCreditAmount,
  formatDateOnly,
  cassoTransactionParams,
  getCassoRecords,
  depositExpiresAt,
  expireOldPendingDeposits,
  writeDepositWebhookLog,
  safeOrder,
  safeWalletTransaction,
  USER_PUBLIC_SELECT,
  ORDER_PUBLIC_SELECT,
  deductUserBalance,
  addUserBalance,
  writeWalletTransaction,
  moneyValue,
  purchaseCostSnapshot,
  notifyPurchaseFailure,
  findUserByUsernameOrEmail
};
