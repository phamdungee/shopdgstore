
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const cassoRouter = express.Router();
const supabase = require('../config/supabase');
const cassoClient = require('../config/casso');
const { authMiddleware } = require('../middlewares/authMiddleware');
// Lưu trữ danh sách kết nối SSE đang hoạt động
const sseClients = new Map();

function broadcastDepositUpdate(transactionId, data) {
  const clients = sseClients.get(transactionId);
  if (clients && clients.size > 0) {
    const payload = `data: ${JSON.stringify({ ok: true, ...data })}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch (err) {
        console.error('Lỗi khi ghi dữ liệu SSE xuống client:', err.message);
      }
    }
  }
}
const {
  CASSO_API_KEY,
  CASSO_SECURE_TOKEN,
  DEPOSIT_BANK,
  DEPOSIT_MIN_AMOUNT,
  DEPOSIT_TTL_MS
} = require('../config/env');
const {
  normalizeString,
  safeUser,
  makePublicCode,
  makeRandomDepositMemo,
  depositContent,
  depositQrUrl,
  normalizeBankCreditAmount,
  cassoTransactionParams,
  getCassoRecords,
  depositExpiresAt,
  expireOldPendingDeposits,
  writeDepositWebhookLog,
  safeWalletTransaction,
  addUserBalance,
  writeWalletTransaction,
  extractDepositCodes,
  makeDepositMemo
} = require('../services/storeService');

const processedCassoIds = new Set();
const MAX_PROCESSED_CASSO_IDS = 2000;
let depositsTableAvailable = true;
const isVercel = process.env.VERCEL === '1';
const lastCheckMap = new Map();

function getCassoTransactionId(item = {}) {
  return normalizeString(
    item.id ||
    item.transactionId ||
    item.transaction_id ||
    item.tid ||
    item.ref ||
    item.code ||
    item.externalRef ||
    item.external_ref ||
    item.reference
  );
}

function rememberCassoId(externalRef) {
  if (!externalRef) return;
  processedCassoIds.add(externalRef);
  if (processedCassoIds.size > MAX_PROCESSED_CASSO_IDS) {
    const oldest = processedCassoIds.values().next().value;
    if (oldest) processedCassoIds.delete(oldest);
  }
}

function getCassoCacheKey(item = {}, externalRef = '', content = '', amount = 0) {
  if (externalRef) return externalRef;
  const postedAt = normalizeString(item.when || item.time || item.transactionDate || item.created_at || item.bookingDate);
  return `missing-ref:${amount}:${postedAt}:${content.slice(0, 120)}`;
}

async function hasPendingDepositInvoices() {
  if (depositsTableAvailable) {
    try {
      const { count, error } = await supabase
        .from('deposits')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (!error && Number(count || 0) > 0) return true;
      if (!error) depositsTableAvailable = true;
      depositsTableAvailable = false;
    } catch {
      depositsTableAvailable = false;
    }
  }

  const { count, error } = await supabase
    .from('wallet_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'deposit')
    .eq('status', 'pending');

  if (error) throw error;
  return Number(count || 0) > 0;
}

router.post('/confirm', authMiddleware, async (req, res) => {
  return res.status(410).json({
    ok: false,
    message: 'Endpoint xác nhận nạp tiền thủ công đã bị tắt. Hãy tạo hóa đơn VietQR và để webhook/Casso đối soát giao dịch ngân hàng.'
  });
});

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const amount = Math.max(0, Math.floor(Number(req.body.amount || 0)));

    if (amount < DEPOSIT_MIN_AMOUNT) {
      return res.status(400).json({ ok: false, message: 'Số tiền nạp tối thiểu là 10.000đ' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, balance')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy tài khoản' });
    }

    await expireOldPendingDeposits(userId);

    const { error: closePendingError } = await supabase
      .from('wallet_transactions')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('type', 'deposit')
      .eq('status', 'pending');

    if (closePendingError) {
      console.error('Close old pending deposits error:', closePendingError);
      return res.status(500).json({ ok: false, message: 'Khong the dong hoa don nap tien cu' });
    }

    const memo = makeRandomDepositMemo();
    const transactionCode = makePublicCode('DEP');

    const balanceBefore = Number(user.balance || 0);
    const balanceAfter = balanceBefore;

    const { data: transaction, error: transactionError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        transaction_code: transactionCode,
        type: 'deposit',
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        content: depositContent(memo),
        external_ref: null,
        status: 'pending'
      })
      .select('*')
      .single();

    if (transactionError || !transaction) {
      console.error('Create pending deposit error:', transactionError);
      return res.status(500).json({ ok: false, message: 'Không thể tạo hóa đơn nạp tiền' });
    }

    const qrUrl = depositQrUrl(amount, memo);

    // Kích hoạt tiến trình tự động quét giao dịch nền nếu không phải Vercel
    if (!isVercel) {
      startCassoAutoPolling();
    }

    return res.status(201).json({
      ok: true,
      message: 'Tạo hóa đơn nạp tiền thành công',
      bill: {
        id: transaction.id,
        memo,
        amount,
        bank: DEPOSIT_BANK,
        qrUrl,
        createdAt: transaction.created_at,
        expiresAt: depositExpiresAt(transaction.created_at),
        expiresInSeconds: Math.floor(DEPOSIT_TTL_MS / 1000)
      }
    });
  } catch (err) {
    console.error('Create deposit bill error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi tạo hóa đơn nạp tiền' });
  }
});

router.get('/status/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.userId;

    const { data: transaction, error } = await supabase
      .from('wallet_transactions')
      .select('id, transaction_code, status, amount, balance_after, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !transaction) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy hóa đơn' });
    }

    const expired = transaction.status === 'pending' && Date.now() > new Date(transaction.created_at).getTime() + DEPOSIT_TTL_MS;
    if (expired) {
      const { data: expiredTx } = await supabase
        .from('wallet_transactions')
        .update({ status: 'expired' })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('id, transaction_code, status, amount, balance_after, created_at')
        .single();

      if (expiredTx) transaction.status = expiredTx.status;
    }

    // Không thực hiện quét đồng bộ ở đây nữa để tránh gây tải. 
    // Trạng thái hóa đơn đã được cập nhật tự động qua Webhook hoặc đồng bộ thủ công.

    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    return res.json({
      ok: true,
      status: transaction.status,
      transactionCode: transaction.transaction_code,
      amount: Number(transaction.amount || 0),
      newBalance: user ? Number(user.balance || 0) : transaction.balance_after,
      expiresAt: depositExpiresAt(transaction.created_at)
    });
  } catch (err) {
    console.error('Get deposit status error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi kiểm tra hóa đơn' });
  }
});

router.get('/status/:id/live', async (req, res) => {
  const id = req.params.id;
  const token = req.query.token;

  if (!token) {
    return res.status(401).json({ ok: false, message: 'Missing token' });
  }

  let userId;
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../config/env');
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
  } catch (err) {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }

  try {
    const { data: transaction, error } = await supabase
      .from('wallet_transactions')
      .select('id, status, amount, balance_after, transaction_code')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !transaction) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy hóa đơn' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Gửi trạng thái hiện tại ngay khi mở kết nối
    res.write(`data: ${JSON.stringify({
      ok: true,
      status: transaction.status,
      transactionId: transaction.id,
      amount: transaction.amount,
      newBalance: transaction.balance_after,
      transactionCode: transaction.transaction_code
    })}\n\n`);

    // Lưu kết nối vào Map
    if (!sseClients.has(id)) {
      sseClients.set(id, new Set());
    }
    sseClients.get(id).add(res);

    // Gửi heartbeat/ping định kỳ để giữ kết nối sống (Nginx, Cloudflare)
    const keepAliveTimer = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      const clients = sseClients.get(id);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          sseClients.delete(id);
        }
      }
    });
  } catch (err) {
    console.error('SSE live status error:', err);
    res.end();
  }
});

router.post('/cancel/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.userId;

    const { data: transaction, error: fetchError } = await supabase
      .from('wallet_transactions')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !transaction) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy hóa đơn hoặc hóa đơn không thuộc tài khoản của bạn' });
    }

    if (transaction.status === 'paid' || transaction.status === 'completed') {
      return res.status(400).json({ ok: false, message: 'Hóa đơn đã được thanh toán thành công, không thể hủy bỏ' });
    }

    if (transaction.status === 'cancelled') {
      return res.json({
        ok: true,
        message: 'Hủy hóa đơn thành công'
      });
    }

    const { error: updateError } = await supabase
      .from('wallet_transactions')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (updateError) {
      console.error('Cancel deposit update error:', updateError);
      return res.status(500).json({ ok: false, message: 'Không thể cập nhật trạng thái hủy hóa đơn' });
    }

    // Thông báo cho client qua SSE
    broadcastDepositUpdate(id, {
      status: 'cancelled',
      transactionId: id
    });

    return res.json({
      ok: true,
      message: 'Hủy hóa đơn thành công'
    });
  } catch (err) {
    console.error('Cancel deposit error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi hủy hóa đơn' });
  }
});

const processTransactionsList = async (transactionsList) => {
  let processedCount = 0;

  for (let item of transactionsList) {
    const content = normalizeString(item.description || item.content || item.memo || item.desc);
    const externalRef = getCassoTransactionId(item);
    const amount = normalizeBankCreditAmount(item);
    const cassoCacheKey = getCassoCacheKey(item, externalRef, content, amount);
    const baseLog = { externalRef, amount, content, raw: item };

    if (processedCassoIds.has(cassoCacheKey)) {
      continue;
    }

    if (!externalRef || !content || amount < DEPOSIT_MIN_AMOUNT) {
      writeDepositWebhookLog({
        ...baseLog,
        status: 'ignored',
        reason: 'missing_external_ref_content_or_min_amount'
      });
      rememberCassoId(cassoCacheKey);
      continue;
    }

    // Extract candidate 10-character deposit codes from Casso description, reference, or ref.
    const textToSearch = `${content} ${normalizeString(item.reference || item.ref || item.transactionId || '')}`;
    const depositCodes = extractDepositCodes(textToSearch);

    if (!depositCodes.length) {
      writeDepositWebhookLog({
        ...baseLog,
        status: 'ignored',
        reason: 'deposit_code_not_found'
      });
      rememberCassoId(cassoCacheKey);
      continue;
    }

    const logWithMemo = { ...baseLog, codes: depositCodes };

    // Search pending transaction matching memo
    let pendingTx = null;
    try {
      const { data: foundTxs, error: findError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('type', 'deposit')
        .in('status', ['pending', 'expired', 'cancelled'])
        .in('content', depositCodes)
        .order('created_at', { ascending: true })
        .limit(1);

      if (findError) {
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'error',
          reason: 'find_pending_order_failed',
          error: findError.message
        });
        console.error('Error searching for pending dynamic bill:', findError.message);
        continue;
      }

      if (!findError && foundTxs && foundTxs.length > 0) {
        pendingTx = foundTxs[0];
      }
    } catch (err) {
      writeDepositWebhookLog({
        ...logWithMemo,
        status: 'error',
        reason: 'find_pending_order_failed',
        error: err.message
      });
      console.error('Error searching for pending dynamic bill:', err.message);
    }

    let user = null;
    let balanceBefore = 0;
    let balanceAfter = 0;

    if (pendingTx) {
      const requiredAmount = Number(pendingTx.amount || 0);
      if (amount < requiredAmount) {
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'ignored',
          reason: 'amount_too_low',
          requiredAmount,
          receivedAmount: amount,
          orderId: pendingTx.id,
          matchedCode: pendingTx.content,
          userId: pendingTx.user_id
        });
        rememberCassoId(cassoCacheKey);
        continue;
      }

      const { data: existed, error: existedError } = await supabase
        .from('wallet_transactions')
        .select('id, status')
        .eq('external_ref', externalRef)
        .limit(1);

      if (existedError) {
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'error',
          reason: 'duplicate_check_failed',
          orderId: pendingTx.id,
          error: existedError.message
        });
        console.error('Database query error checking existed transaction:', existedError);
        continue;
      }

      if (existed && existed.length > 0) {
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'ignored',
          reason: 'transaction_already_processed',
          orderId: pendingTx.id,
          matchedCode: pendingTx.content,
          existingTransactionId: existed[0].id,
          existingStatus: existed[0].status
        });
        rememberCassoId(cassoCacheKey);
        continue;
      }

      const originalStatus = pendingTx.status;
      const { data: claimedTx, error: claimError } = await supabase
        .from('wallet_transactions')
        .update({
          status: 'processing',
          external_ref: externalRef
        })
        .eq('id', pendingTx.id)
        .is('external_ref', null)
        .in('status', ['pending', 'expired', 'cancelled'])
        .select('*')
        .single();

      if (claimError || !claimedTx) {
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'ignored',
          reason: 'order_not_pending_or_already_claimed',
          orderId: pendingTx.id,
          matchedCode: pendingTx.content,
          error: claimError?.message || null
        });
        if (!claimError) rememberCassoId(cassoCacheKey);
        continue;
      }

      pendingTx = claimedTx;

      // Dynamic bill payment
      const { data: dbUser, error: dbUserErr } = await supabase
        .from('users')
        .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
        .eq('id', pendingTx.user_id)
        .single();

      if (dbUserErr || !dbUser) {
        await supabase
          .from('wallet_transactions')
          .update({ status: originalStatus, external_ref: null })
          .eq('id', pendingTx.id)
          .eq('status', 'processing')
          .eq('external_ref', externalRef);
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'error',
          reason: 'user_not_found',
          orderId: pendingTx.id,
          userId: pendingTx.user_id,
          error: dbUserErr?.message || null
        });
        console.error(`❌ User for pending transaction ${pendingTx.id} not found.`);
        continue;
      }

      user = dbUser;
      balanceBefore = Number(user.balance || 0);
      const actualAmount = amount > 0 ? amount : Number(pendingTx.amount || 0);
      balanceAfter = balanceBefore + actualAmount;

      // Update balance
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ balance: balanceAfter })
        .eq('id', user.id)
        .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
        .single();

      if (updateError || !updatedUser) {
        await supabase
          .from('wallet_transactions')
          .update({ status: originalStatus, external_ref: null })
          .eq('id', pendingTx.id)
          .eq('status', 'processing')
          .eq('external_ref', externalRef);
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'error',
          reason: 'balance_update_failed',
          orderId: pendingTx.id,
          userId: user.id,
          error: updateError?.message || null
        });
        console.error('❌ Failed to update user balance for dynamic bill:', updateError);
        continue;
      }

      // Complete transaction record
      const { data: updTx, error: updTxErr } = await supabase
        .from('wallet_transactions')
        .update({
          status: 'paid',
          amount: actualAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          external_ref: externalRef
        })
        .eq('id', pendingTx.id)
        .eq('status', 'processing')
        .eq('external_ref', externalRef)
        .select('*')
        .single();

      if (updTxErr || !updTx) {
        console.error('❌ Failed to complete wallet transaction record:', updTxErr);
        // Rollback balance
        await supabase.from('users').update({ balance: balanceBefore }).eq('id', user.id);
        await supabase
          .from('wallet_transactions')
          .update({ status: originalStatus, external_ref: null })
          .eq('id', pendingTx.id)
          .eq('status', 'processing')
          .eq('external_ref', externalRef);
        writeDepositWebhookLog({
          ...logWithMemo,
          status: 'error',
          reason: 'order_mark_success_failed',
          orderId: pendingTx.id,
          userId: user.id,
          error: updTxErr?.message || null
        });
        continue;
      }

      writeDepositWebhookLog({
        ...logWithMemo,
        status: 'success',
        reason: 'credited',
        orderId: pendingTx.id,
        matchedCode: pendingTx.content,
        userId: user.id,
        requiredAmount: Number(pendingTx.amount || 0),
        creditedAmount: actualAmount,
        balanceBefore,
        balanceAfter
      });
      processedCount++;
      rememberCassoId(cassoCacheKey);
      
      // Bắn event để thông báo realtime qua SSE
      broadcastDepositUpdate(pendingTx.id, {
        status: 'paid',
        transactionId: pendingTx.id,
        amount: actualAmount,
        newBalance: balanceAfter,
        transactionCode: externalRef
      });

      console.log(`✅ Successfully processed dynamic deposit bill of ${actualAmount}đ for User ${user.username}`);
    } else {
      writeDepositWebhookLog({
        ...logWithMemo,
        status: 'ignored',
        reason: 'pending_order_not_found'
      });
      rememberCassoId(cassoCacheKey);
      continue;

      // Fixed memo fallback (compatibility with user.id memo)
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
        .limit(10000);

      if (userError) {
        console.error('❌ Error listing users for fixed memo check:', userError);
        continue;
      }

      const matchedUsers = (users || []).filter(item => makeDepositMemo(item.id) === depositMemo);
      const matchedUser = matchedUsers.length === 1 ? matchedUsers[0] : null;

      if (!matchedUser) {
        console.log(`⚠️ No matched user found for fixed memo: ${depositMemo}`);
        continue;
      }

      user = matchedUser;
      balanceBefore = Number(user.balance || 0);
      balanceAfter = balanceBefore + amount;
      const transactionCode = makePublicCode('DEP');

      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ balance: balanceAfter })
        .eq('id', user.id)
        .select('id, username, email, phone, full_name, role, balance, status, email_verified, avatar_url, created_at, last_login_at')
        .single();

      if (updateError || !updatedUser) {
        console.error('❌ Failed to update user balance for fixed memo:', updateError);
        continue;
      }

      const { data: insTx, error: insTxErr } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: user.id,
          transaction_code: transactionCode,
          type: 'deposit',
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          content: `Nạp tiền qua VietQR cố định - Mã nạp: ${depositMemo} (Tự động đối soát)`,
          external_ref: externalRef,
          status: 'paid'
        })
        .select('*')
        .single();

      if (insTxErr || !insTx) {
        console.error('❌ Failed to insert wallet transaction for fixed memo:', insTxErr);
        // Rollback balance
        await supabase.from('users').update({ balance: balanceBefore }).eq('id', user.id);
        continue;
      }

      processedCount++;
      console.log(`✅ Successfully processed fixed deposit of ${amount}đ for User ${user.username}`);
    }
  }

  return processedCount;
};

async function checkCassoSyncOnVercel(userId, transactionId) {
  const now = Date.now();
  const lastCheck = lastCheckMap.get(transactionId) || 0;
  
  if (now - lastCheck < 15000) {
    console.log(`[Vercel Sync] Skip checking Casso for tx ${transactionId} (rate-limited, last check was ${Math.round((now - lastCheck) / 1000)}s ago)`);
    return;
  }
  lastCheckMap.set(transactionId, now);

  if (!CASSO_API_KEY) {
    console.warn('[Vercel Sync] CASSO_API_KEY is not configured');
    return;
  }
  const accountNumber = DEPOSIT_BANK.account;

  console.log(`[Vercel Sync] Triggering casso sync for account ${accountNumber}...`);
  try {
    try {
      await cassoClient.post('/sync', {
        bank_acc_id: accountNumber
      });
    } catch (syncErr) {
      console.warn('[Vercel Sync] Casso immediate sync API trigger failed (rate limits likely):', syncErr.message);
    }

    // Chờ 1.5 giây để ngân hàng đồng bộ dữ liệu tới Casso
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('[Vercel Sync] Fetching recent transactions from Casso...');
    const cassoRes = await cassoClient.get('/transactions', {
      params: cassoTransactionParams()
    });

    const records = getCassoRecords(cassoRes.data).slice(0, 10);
    console.log(`[Vercel Sync] Fetched ${records.length} records. Processing...`);
    if (records.length > 0) {
      const processedCount = await processTransactionsList(records);
      if (processedCount > 0) {
        console.log(`[Vercel Sync] Processed and matched ${processedCount} transactions.`);
      }
    }
  } catch (err) {
    console.error('[Vercel Sync] Error in synchronous check:', err.message);
  }
}

// Tiến trình tự động quét giao dịch nền Casso khi có hóa đơn đang chờ
let cassoPollInterval = null;

const startCassoAutoPolling = () => {
  // Đã vô hiệu hóa tiến trình tự động quét giao dịch Casso (15s/lần) theo yêu cầu.
  // Hệ thống sẽ dựa trên Casso Webhook hoặc người dùng kích hoạt đồng bộ thủ công qua API.
};

const SECURITY_CONFIG = {
  // Chỉ bypass khi có flag rõ ràng
  bypassLocal: process.env.BYPASS_WEBHOOK_SECURITY === 'true' && process.env.NODE_ENV === 'development',
  
  // Casso IP ranges (cần cập nhật IP thực tế)
  allowedIPs: process.env.CASSO_ALLOWED_IPS ? process.env.CASSO_ALLOWED_IPS.split(',').map(ip => ip.trim()) : [],
  
  // Thời gian cho phép chênh lệch (giây)
  timestampTolerance: 300,
  
  // Thời gian sống của nonce (ms)
  nonceTTL: 86400000
};

const usedNonces = new Set();
const nonceTimestamps = new Map();

function validateNonce(nonce) {
  if (!nonce) return false;
  
  // Kiểm tra nonce đã được sử dụng chưa
  if (usedNonces.has(nonce)) return false;
  
  // Lưu nonce với timestamp
  usedNonces.add(nonce);
  nonceTimestamps.set(nonce, Date.now());
  
  // Cleanup mỗi 100 lần cập nhật
  if (nonceTimestamps.size % 100 === 0) {
    const now = Date.now();
    for (const [key, timestamp] of nonceTimestamps) {
      if (now - timestamp > SECURITY_CONFIG.nonceTTL) {
        usedNonces.delete(key);
        nonceTimestamps.delete(key);
      }
    }
  }
  
  return true;
}

function validateWebhookTimestamp(req) {
  const timestamp = req.headers['x-casso-timestamp'] || req.headers['casso-timestamp'] || req.header('x-casso-timestamp') || req.header('casso-timestamp');
  if (!timestamp) return true; // Không có timestamp = không kiểm tra
  
  const now = Date.now();
  const diff = Math.abs(now - parseInt(timestamp, 10));
  return diff < (SECURITY_CONFIG.timestampTolerance * 1000);
}

function verifyWebhookSignature(req, body) {
  const signature = req.headers['x-casso-signature'] || req.headers['casso-signature'] || req.header('x-casso-signature') || req.header('casso-signature');
  if (!signature) return false;
  
  const expected = crypto
    .createHmac('sha256', CASSO_SECURE_TOKEN)
    .update(JSON.stringify(body))
    .digest('hex');
  
  try {
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (err) {
    return false;
  }
}

// Hàm kiểm tra tổng hợp
function validateWebhookRequest(req, body) {
  const isDevelopment = SECURITY_CONFIG.bypassLocal;
  
  // 1. Kiểm tra secure-token (bắt buộc)
  const token = req.headers['secure-token'] || req.headers['x-api-key'] || req.header('secure-token') || req.header('x-api-key');
  if (!token || token !== CASSO_SECURE_TOKEN) {
    if (isDevelopment) {
      console.warn('⚠️ Bypassing secure-token check in development');
    } else {
      return { valid: false, reason: 'invalid_token' };
    }
  }

  // 2. Kiểm tra các header tùy chọn (không bắt buộc vì Casso có thể không gửi)
  const signature = req.headers['x-casso-signature'] || req.headers['casso-signature'] || req.header('x-casso-signature') || req.header('casso-signature');
  if (signature && !verifyWebhookSignature(req, body)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  const timestamp = req.headers['x-casso-timestamp'] || req.headers['casso-timestamp'] || req.header('x-casso-timestamp') || req.header('casso-timestamp');
  if (timestamp && !validateWebhookTimestamp(req)) {
    return { valid: false, reason: 'invalid_timestamp' };
  }

  const nonce = req.headers['x-casso-nonce'] || req.headers['casso-nonce'] || req.header('x-casso-nonce') || req.header('casso-nonce');
  if (nonce && !validateNonce(nonce)) {
    return { valid: false, reason: 'invalid_nonce' };
  }

  // 3. Kiểm tra IP (nếu có cấu hình)
  if (SECURITY_CONFIG.allowedIPs.length > 0) {
    const ip = req.ip || req.connection.remoteAddress;
    if (!SECURITY_CONFIG.allowedIPs.includes(ip)) {
      if (isDevelopment) {
        console.warn(`⚠️ Bypassing IP check in development: ${ip}`);
      } else {
        return { valid: false, reason: 'invalid_ip' };
      }
    }
  }

  return { valid: true };
}

// Webhook handler với idempotency
const processedWebhooks = new Set();
const handleCassoWebhook = async (req, res) => {
  const requestId = crypto.randomUUID();
  const webhookId = req.headers['x-casso-webhook-id'] || req.headers['casso-webhook-id'] || req.header('x-casso-webhook-id') || req.header('casso-webhook-id') || requestId;
  console.log(`[Webhook ${requestId}] Received`);
  
  // Kiểm tra webhook đã được xử lý chưa
  if (processedWebhooks.has(webhookId)) {
    console.log(`[Webhook ${requestId}] ⚠️ Duplicate webhook: ${webhookId}`);
    return res.status(200).json({
      code: 200,
      message: 'already_processed',
      data: { webhookId }
    });
  }
  
  try {
    if (!CASSO_SECURE_TOKEN) {
      writeDepositWebhookLog({
        requestId,
        status: 'rejected',
        reason: 'missing_casso_secure_token',
        source: 'casso'
      });
      return res.status(503).json({
        code: 503,
        message: 'Casso webhook secure token is not configured'
      });
    }

    // Log request info (ẩn sensitive data)
    console.log(`[Webhook ${requestId}] Headers:`, {
      'secure-token': (req.headers['secure-token'] || req.header('secure-token')) ? 'present' : 'missing',
      'user-agent': req.headers['user-agent'] || req.header('user-agent'),
      ip: req.ip || req.connection.remoteAddress
    });

    // Kiểm tra bảo mật
    const isDevelopment = SECURITY_CONFIG.bypassLocal;
    const securityCheck = validateWebhookRequest(req, req.body);
    
    if (!securityCheck.valid && !isDevelopment) {
      writeDepositWebhookLog({
        requestId,
        status: 'rejected',
        reason: securityCheck.reason,
        source: 'casso',
        ip: req.ip || req.connection.remoteAddress
      });
      
      return res.status(401).json({
        code: 401,
        message: `Webhook validation failed: ${securityCheck.reason}`
      });
    }

    if (!securityCheck.valid && isDevelopment) {
      console.warn(`[Webhook ${requestId}] ⚠️ Bypassing security check (${securityCheck.reason}) in development mode`);
    }

    let transactionsList = getCassoRecords(req.body);
    if (!transactionsList.length && req.body && Array.isArray(req.body.data)) {
      transactionsList = req.body.data;
    } else if (!transactionsList.length && req.body && req.body.data && typeof req.body.data === 'object') {
      transactionsList = [req.body.data];
    } else if (!transactionsList.length && req.body) {
      transactionsList = [req.body];
    }

    const processedCount = await processTransactionsList(transactionsList);

    // Đánh dấu đã xử lý
    processedWebhooks.add(webhookId);
    
    // Cleanup sau 24h
    setTimeout(() => processedWebhooks.delete(webhookId), 86400000);

    console.log(`[Webhook ${requestId}] ✅ Processed successfully: ${processedCount} transactions`);
    return res.status(200).json({
      code: 200,
      message: 'success',
      data: { processedCount, webhookId }
    });
  } catch (error) {
    console.error(`[Webhook ${requestId}] ❌ Error:`, error);
    return res.status(500).json({
      code: 500,
      error: 'Something went wrong, please try again!'
    });
  }
};

// Đăng ký webhook và các route tích hợp
cassoRouter.post('/api/webhooks/casso', handleCassoWebhook);
cassoRouter.post('/webhook/handler-bank-transfer', handleCassoWebhook);
cassoRouter.post('/webhook', handleCassoWebhook);
router.post('/webhook', handleCassoWebhook);

cassoRouter.post('/register-webhook', async (req, res, next) => {
  try {
    if (!CASSO_API_KEY) {
      return res.status(400).json({ code: 400, message: 'Thiếu CASSO_API_KEY trong cấu hình .env' });
    }
    if (!CASSO_SECURE_TOKEN) {
      return res.status(400).json({ code: 400, message: 'Thiếu CASSO_SECURE_TOKEN hoặc DEPOSIT_WEBHOOK_SECRET trong cấu hình .env' });
    }

    const host = req.protocol + '://' + req.get('host');
    const webhookUrl = `${host}/webhook/handler-bank-transfer`;

    console.log(`🔄 Registering Casso Webhook for URL: ${webhookUrl}`);

    // Xóa webhook cũ
    try {
      await cassoClient.delete(`/webhooks`, {
        params: { webhook: webhookUrl }
      });
      console.log('🗑️ Deleted old webhook');
    } catch (err) {
      console.log('ℹ️ No old webhook found or failed to delete:', err.message);
    }

    // Tạo webhook mới
    const webhookRes = await cassoClient.post('/webhooks', {
      webhook: webhookUrl,
      secure_token: CASSO_SECURE_TOKEN,
      income_only: true
    });

    // Lấy thông tin user
    const userRes = await cassoClient.get('/userInfo');

    return res.status(200).json({
      code: 200,
      message: 'success',
      data: {
        webhook: webhookRes.data,
        userInfo: userRes.data
      }
    });
  } catch (error) {
    console.error('❌ Register webhook error:', error.response?.data || error.message);
    return res.status(500).json({
      code: 500,
      error: error.response?.data || error.message || 'Something went wrong, please try again!'
    });
  }
});

cassoRouter.post('/users-paid', async (req, res, next) => {
  try {
    const { accountNumber } = req.body;
    if (!accountNumber) {
      return res.status(404).json({
        code: 404,
        message: 'Not found Account number'
      });
    }

    if (!CASSO_API_KEY) {
      return res.status(400).json({ code: 400, message: 'Thiếu CASSO_API_KEY trong cấu hình .env' });
    }

    console.log(`🔄 Requesting immediate sync to Casso for account: ${accountNumber}`);
    const syncRes = await cassoClient.post('/sync', {
      bank_acc_id: accountNumber
    });

    return res.status(200).json({
      code: 200,
      message: 'success',
      data: syncRes.data
    });
  } catch (error) {
    console.error('❌ Sync transaction error:', error.response?.data || error.message);
    return res.status(500).json({
      code: 500,
      error: error.response?.data || error.message || 'Something went wrong, please try again!'
    });
  }
});

router.post('/sync-now', authMiddleware, async (req, res) => {
  try {
    if (!CASSO_API_KEY) {
      return res.status(200).json({
        ok: true,
        message: 'Hệ thống đang kiểm tra tự động qua webhook.'
      });
    }

    const hasPending = await hasPendingDepositInvoices();
    if (!hasPending) {
      return res.json({
        ok: true,
        message: 'Không có hóa đơn nạp tiền nào đang chờ thanh toán.'
      });
    }

    const accountNumber = DEPOSIT_BANK.account;
    console.log(`🔄 Client triggered sync now on account: ${accountNumber}`);

    // 1. Gửi yêu cầu đồng bộ tức thì lên Casso
    try {
      await cassoClient.post('/sync', {
        bank_acc_id: accountNumber
      });
      console.log('🔄 Triggered Casso sync request');
    } catch (syncErr) {
      console.warn('⚠️ Casso sync trigger failed/delayed:', syncErr.message);
    }

    // 2. Chờ 1.5 giây để Casso đồng bộ từ ngân hàng về hệ thống của họ
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 3. Lấy trực tiếp danh sách giao dịch từ Casso để đối soát thủ công (phòng trường hợp lỗi Webhook)
    console.log('🔍 Fetching transactions from Casso for manual credit sync...');
    const cassoRes = await cassoClient.get('/transactions', {
      params: cassoTransactionParams()
    });

    const records = getCassoRecords(cassoRes.data).slice(0, 10);
    console.log(`🔍 Fetched ${records.length} records from Casso. Processing...`);

    const processedCount = await processTransactionsList(records);
    console.log(`✅ Completed manual check. Processed ${processedCount} new transactions.`);

    return res.json({
      ok: true,
      message: processedCount > 0 
        ? `Đồng bộ thành công! Tìm thấy và xử lý ${processedCount} giao dịch mới.`
        : 'Yêu cầu đồng bộ đã gửi lên ngân hàng. Vui lòng đợi vài giây để hệ thống tự động xử lý.'
    });
  } catch (err) {
    console.error('Sync now error:', err.response?.data || err.message);
    return res.status(500).json({ ok: false, message: 'Lỗi server khi gửi yêu cầu đồng bộ' });
  }
});


module.exports = {
  router,
  cassoRouter,
  startCassoAutoPolling,
  handleCassoWebhook,
  processTransactionsList,
  verifyWebhookSignature,
  validateWebhookTimestamp,
  validateNonce,
  validateWebhookRequest,
  SECURITY_CONFIG
};
