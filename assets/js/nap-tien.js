// assets/js/nap-tien.js
// Quản lý tạo hóa đơn nạp VietQR động, đếm ngược đếm lùi và Polling kiểm tra trạng thái thanh toán.

const NAP_API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
const ACTIVE_DEPOSIT_BILL_KEY = 'dgActiveDepositBill';
const WEBSITE_NAME = document.querySelector('.sk-brand-title')?.innerText?.trim() || 'DG Store';
const PAYMENT_SUCCESS_CONFIG = {
  badge: 'Payment Verified',
  title: 'Nạp tiền thành công',
  subtitle: 'Giao dịch đã được xác nhận. Số dư của bạn đã được cập nhật vào tài khoản.',
  amountLabel: 'Số tiền đã cộng',
  fallbackAmount: 250000,
  fallbackTransactionId: 'DGSTORE-20260617-8931',
  methodLabel: 'Chuyển khoản ngân hàng',
  statusLabel: 'Hoàn tất'
};

let activePollingInterval = null;
let activeEventSource = null;
let activeCountdownInterval = null;
let activeBillId = null;
let activeBillSnapshot = null;
let successSparksAnimationId = null;

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.innerText = value;
}

function showToast(msg, isSuccess) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'sk-card';
  toast.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:280px;padding:13px 14px;font-size:13px;font-weight:800;pointer-events:auto;opacity:0;transform:translateY(8px);transition:.2s ease;';
  toast.innerHTML = isSuccess
    ? `<i class="fa-solid fa-circle-check" style="color:var(--success)"></i><span>${msg}</span>`
    : `<i class="fa-solid fa-circle-exclamation" style="color:var(--danger)"></i><span>${msg}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 50);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showConfirmDialog({ title, message, confirmText = 'Xác nhận', cancelText = 'Hủy' } = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('sk-custom-confirm');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sk-custom-confirm';
    overlay.className = 'sk-custom-confirm';
    overlay.innerHTML = `
      <div class="sk-confirm-panel">
        <div class="sk-confirm-icon">
          <i class="fa-solid fa-circle-question"></i>
        </div>
        <h3>${title || 'Xác nhận'}</h3>
        <p>${message || 'Bạn có chắc muốn tiếp tục?'}</p>
        <div class="sk-confirm-actions">
          <button type="button" class="sk-confirm-btn sk-confirm-btn-cancel" data-cancel>${cancelText}</button>
          <button type="button" class="sk-confirm-btn sk-confirm-btn-ok" data-confirm>${confirmText}</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup();
        resolve(false);
      }
      if (event.key === 'Enter') {
        cleanup();
        resolve(true);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup();
        resolve(false);
      }
    });

    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
  });
}

function showPaymentSuccessNotice(details = {}) {
  const existed = document.getElementById('payment-success-notice');
  if (existed) {
    stopSuccessSparks();
    existed.remove();
  }

  injectPaymentSuccessStyles();

  const transactionCode = normalizeTransactionCode(details.transactionCode, details.id || PAYMENT_SUCCESS_CONFIG.fallbackTransactionId);
  const amount = Number(details.amount || activeBillSnapshot?.amount || PAYMENT_SUCCESS_CONFIG.fallbackAmount);
  const paidAt = formatDepositDateTime(details.paidAt || new Date());
  const rows = [
    ['Mã giao dịch', transactionCode],
    ['Phương thức', PAYMENT_SUCCESS_CONFIG.methodLabel],
    ['Thời gian', paidAt],
    ['Trạng thái', `<span class="ps-status-badge">${PAYMENT_SUCCESS_CONFIG.statusLabel}</span>`]
  ];

  const notice = document.createElement('div');
  notice.id = 'payment-success-notice';
  notice.className = 'payment-success-shell';
  notice.innerHTML = `
    <div class="ps-grid-layer"></div>
    <div class="ps-glow ps-glow-one"></div>
    <div class="ps-glow ps-glow-two"></div>
    <canvas class="ps-sparks-canvas" aria-hidden="true"></canvas>
    <article class="ps-receipt-card" role="dialog" aria-modal="true" aria-labelledby="psSuccessTitle">
      <div class="ps-receipt-inner">
        <div class="ps-card-top">
          <span class="ps-pill">${PAYMENT_SUCCESS_CONFIG.badge}</span>
          <div class="ps-check-wrap" aria-hidden="true">
            <svg viewBox="0 0 64 64" class="ps-check-svg">
              <circle cx="32" cy="32" r="26"></circle>
              <path d="M20 33.5 28.2 41 45 23"></path>
            </svg>
          </div>
          <h2 id="psSuccessTitle">${PAYMENT_SUCCESS_CONFIG.title}</h2>
          <p>${PAYMENT_SUCCESS_CONFIG.subtitle}</p>
        </div>

        <div class="ps-amount-box">
          <span>${PAYMENT_SUCCESS_CONFIG.amountLabel}</span>
          <strong>+${formatVnd(amount)}</strong>
        </div>

        <div class="ps-ticket-divider" aria-hidden="true"></div>

        <div class="ps-detail-list">
          ${rows.map(([label, value], index) => `
            <div class="ps-detail-row" style="--row-delay:${index * 90}ms">
              <span>${label}</span>
              <b>${value}</b>
            </div>
          `).join('')}
        </div>

        <div class="ps-actions">
          <a class="ps-primary-action" href="index.html"><i class="fa-solid fa-house" style="margin-right: 6px;"></i>Về trang chủ</a>
          <button class="ps-copy-action" type="button" data-transaction-code="${escapeAttribute(transactionCode)}"><i class="fa-solid fa-copy" style="margin-right: 6px;"></i><span class="btn-text">Sao chép mã</span></button>
        </div>
      </div>
    </article>
  `;
  document.body.appendChild(notice);

  const closeOnEscape = event => {
    if (event.key === 'Escape') {
      stopSuccessSparks();
      notice.remove();
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  document.addEventListener('keydown', closeOnEscape);

  const copyButton = notice.querySelector('.ps-copy-action');
  if (copyButton) {
    const btnText = copyButton.querySelector('.btn-text');
    const btnIcon = copyButton.querySelector('i');
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copyButton.dataset.transactionCode || transactionCode);
        if (btnText) btnText.textContent = 'Đã sao chép';
        if (btnIcon) btnIcon.className = 'fa-solid fa-check';
        copyButton.classList.add('is-copied');
        setTimeout(() => {
          if (btnText) btnText.textContent = 'Sao chép mã';
          if (btnIcon) btnIcon.className = 'fa-solid fa-copy';
          copyButton.classList.remove('is-copied');
        }, 1400);
      } catch {
        showToast('Không thể sao chép mã giao dịch', false);
      }
    });
  }

  startSuccessSparks(notice.querySelector('.ps-sparks-canvas'));
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function injectPaymentSuccessStyles() {
  if (document.getElementById('payment-success-styles')) return;

  const style = document.createElement('style');
  style.id = 'payment-success-styles';
  style.textContent = `
    .payment-success-shell {
      position: fixed;
      top: 72px;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 950;
      display: grid;
      place-items: center;
      overflow: hidden;
      padding: 24px;
      background:
        radial-gradient(circle at 15% 12%, rgba(99, 102, 241, .15), transparent 40%),
        radial-gradient(circle at 85% 88%, rgba(16, 185, 129, .1), transparent 40%),
        rgba(10, 14, 26, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .ps-grid-layer {
      position: absolute;
      inset: -80px;
      opacity: .18;
      background-image:
        linear-gradient(rgba(99, 102, 241, .12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, .12) 1px, transparent 1px);
      background-size: 44px 44px;
      animation: psGridDrift 24s linear infinite;
      z-index: 0;
    }
    .ps-glow {
      position: absolute;
      width: min(42vw, 360px);
      aspect-ratio: 1;
      border-radius: 999px;
      filter: blur(36px);
      opacity: .42;
      z-index: 0;
      pointer-events: none;
    }
    .ps-glow-one {
      left: -110px;
      top: -120px;
      background: rgba(99, 102, 241, .35);
    }
    .ps-glow-two {
      right: -120px;
      bottom: -140px;
      background: rgba(16, 185, 129, .25);
    }
    .ps-sparks-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      pointer-events: none;
    }
    .ps-receipt-card {
      position: relative;
      z-index: 3;
      width: min(478px, calc(100vw - 32px));
      border-radius: 30px;
      border: 1px solid rgba(99, 102, 241, 0.25);
      background: rgba(17, 24, 39, 0.65);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.15);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      animation: psCardEnter .72s cubic-bezier(.22, 1, .36, 1) both;
      color: var(--text-bright);
      overflow: visible;
    }
    .ps-receipt-inner {
      position: relative;
      overflow: hidden;
      border-radius: 30px;
      padding: 28px;
    }
    .ps-card-top {
      display: grid;
      justify-items: center;
      text-align: center;
      gap: 12px;
    }
    .ps-pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 12px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--success);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .ps-check-wrap {
      width: 78px;
      height: 78px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.1);
      box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.2), 0 16px 38px rgba(16, 185, 129, 0.15);
      animation: psCheckBreath 2.4s ease-in-out infinite;
    }
    .ps-check-svg {
      width: 54px;
      height: 54px;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .ps-check-svg circle {
      stroke: rgba(16, 185, 129, 0.25);
      stroke-width: 3;
    }
    .ps-check-svg path {
      stroke: var(--success);
      stroke-width: 5;
      stroke-dasharray: 42;
      stroke-dashoffset: 42;
      animation: psStrokeCheck .76s ease .35s forwards;
    }
    .ps-card-top h2 {
      margin: 2px 0 0;
      color: var(--text-bright);
      font-size: clamp(26px, 5vw, 34px);
      line-height: 1.05;
      font-weight: 950;
      letter-spacing: 0;
    }
    .ps-card-top p {
      max-width: 360px;
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
      font-weight: 650;
    }
    .ps-amount-box {
      display: grid;
      gap: 6px;
      margin: 22px 0 24px;
      padding: 18px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(17, 24, 39, 0.4);
      text-align: center;
    }
    .ps-amount-box span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .ps-amount-box strong {
      color: #10b981;
      font-size: clamp(32px, 8vw, 46px);
      line-height: 1;
      font-weight: 950;
      letter-spacing: -0.02em;
      text-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
    }
    .ps-ticket-divider {
      position: relative;
      height: 1px;
      margin: 0 -28px 22px;
      border-top: 1px dashed rgba(255, 255, 255, 0.15);
    }
    .ps-ticket-divider::before,
    .ps-ticket-divider::after {
      content: "";
      position: absolute;
      top: 50%;
      width: 38px;
      height: 38px;
      border-radius: 999px;
      background: #0a0e1a;
      border: 1px solid rgba(99, 102, 241, 0.2);
      transform: translateY(-50%);
      box-shadow: inset 0 8px 18px rgba(0, 0, 0, 0.3);
    }
    .ps-ticket-divider::before { left: -19px; }
    .ps-ticket-divider::after { right: -19px; }
    .ps-detail-list {
      display: grid;
      gap: 10px;
    }
    .ps-detail-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 48px;
      padding: 11px 13px;
      border-radius: var(--radius);
      background: rgba(17, 24, 39, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.05);
      opacity: 0;
      transform: translateY(18px);
      animation: psRowEnter .52s ease forwards;
      animation-delay: calc(.42s + var(--row-delay));
    }
    .ps-detail-row span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 850;
    }
    .ps-detail-row b {
      color: var(--text-bright);
      font-size: 13px;
      font-weight: 900;
      text-align: right;
      overflow-wrap: anywhere;
    }
    .ps-status-badge {
      display: inline-flex;
      align-items: center;
      min-height: 25px;
      padding: 0 10px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.25);
      font-size: 11px;
      font-weight: 950;
    }
    .ps-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 22px;
    }
    .ps-primary-action,
    .ps-copy-action {
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      border: 0;
      cursor: pointer;
      text-decoration: none;
      font-size: 14px;
      font-weight: 950;
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease, color .18s ease;
    }
    .ps-primary-action {
      color: #fff;
      background: var(--brand-gradient);
      box-shadow: 0 8px 24px var(--brand-glow);
    }
    .ps-copy-action {
      color: var(--text-bright);
      background: rgba(17, 24, 39, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .ps-copy-action.is-copied {
      color: var(--success);
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.25);
    }
    .ps-primary-action:hover,
    .ps-copy-action:hover {
      transform: translateY(-1px);
    }
    @keyframes psGridDrift {
      from { transform: translate3d(0, 0, 0); }
      to { transform: translate3d(44px, 44px, 0); }
    }
    @keyframes psCardEnter {
      from { opacity: 0; transform: translateY(38px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes psRowEnter {
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes psStrokeCheck {
      to { stroke-dashoffset: 0; }
    }
    @keyframes psCheckBreath {
      0%, 100% { transform: scale(1); box-shadow: inset 0 0 0 1px rgba(16, 185, 129, .15), 0 16px 38px rgba(16, 185, 129, .1); }
      50% { transform: scale(1.035); box-shadow: inset 0 0 0 1px rgba(16, 185, 129, .25), 0 20px 48px rgba(16, 185, 129, .15); }
    }
    @media (max-width: 768px) {
      .payment-success-shell {
        top: 70px;
        right: 0;
        bottom: 70px;
        left: 0;
      }
    }
    @media (max-width: 520px) {
      .payment-success-shell { padding: 14px; }
      .ps-receipt-inner { padding: 22px; }
      .ps-actions { grid-template-columns: 1fr; }
      .ps-detail-row { align-items: flex-start; flex-direction: column; gap: 4px; }
      .ps-detail-row b { text-align: left; }
      .ps-ticket-divider { margin-left: -22px; margin-right: -22px; }
    }
  `;
  document.head.appendChild(style);
}

function startSuccessSparks(canvas) {
  stopSuccessSparks();
  if (!canvas) return;

  const context = canvas.getContext('2d');
  const shell = canvas.closest('.payment-success-shell') || document.documentElement;
  const particles = [];
  let stageWidth = 0;
  let stageHeight = 0;
  let particleCount = 0;

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    const rect = shell.getBoundingClientRect();
    stageWidth = Math.max(1, rect.width);
    stageHeight = Math.max(1, rect.height);
    canvas.width = Math.floor(stageWidth * ratio);
    canvas.height = Math.floor(stageHeight * ratio);
    canvas.style.width = `${stageWidth}px`;
    canvas.style.height = `${stageHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const nextCount = Math.min(64, Math.max(30, Math.floor(stageWidth / 22)));
    particleCount = nextCount;
    while (particles.length < particleCount) particles.push(makeParticle(true));
    particles.length = particleCount;
  };

  const makeParticle = (initial = false) => ({
    x: Math.random() * stageWidth,
    y: initial ? Math.random() * stageHeight : -20 - Math.random() * 80,
    radius: 1 + Math.random() * 2.4,
    speed: .25 + Math.random() * .75,
    drift: -.18 + Math.random() * .36,
    alpha: .12 + Math.random() * .26
  });

  resize();

  const draw = () => {
    context.clearRect(0, 0, stageWidth, stageHeight);
    for (const particle of particles) {
      particle.y += particle.speed;
      particle.x += particle.drift;

      if (particle.y > stageHeight + 12) {
        Object.assign(particle, makeParticle(false));
      }
      if (particle.x < -10) particle.x = stageWidth + 10;
      if (particle.x > stageWidth + 10) particle.x = -10;

      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(37, 99, 235, ${particle.alpha})`;
      context.fill();
    }
    successSparksAnimationId = requestAnimationFrame(draw);
  };

  window.addEventListener('resize', resize, { passive: true });
  canvas._cleanupSparks = () => window.removeEventListener('resize', resize);
  draw();
}

function stopSuccessSparks() {
  if (successSparksAnimationId) {
    cancelAnimationFrame(successSparksAnimationId);
    successSparksAnimationId = null;
  }
  const canvas = document.querySelector('.ps-sparks-canvas');
  if (canvas && typeof canvas._cleanupSparks === 'function') {
    canvas._cleanupSparks();
    canvas._cleanupSparks = null;
  }
}

function getNapToken() {
  return localStorage.getItem('token');
}

function formatVnd(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function formatVndFull(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')} VNĐ`;
}

function formatDepositDateTime(value = new Date()) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function normalizeTransactionCode(code, fallbackId) {
  return String(code || fallbackId || PAYMENT_SUCCESS_CONFIG.fallbackTransactionId).trim();
}

function getStoredBill() {
  try {
    const bill = JSON.parse(localStorage.getItem(ACTIVE_DEPOSIT_BILL_KEY) || 'null');
    return bill && bill.id ? bill : null;
  } catch {
    return null;
  }
}

function saveStoredBill(bill) {
  if (!bill?.id) return;
  localStorage.setItem(ACTIVE_DEPOSIT_BILL_KEY, JSON.stringify(bill));
}

function clearStoredBill() {
  localStorage.removeItem(ACTIVE_DEPOSIT_BILL_KEY);
}

function secondsUntil(expiresAt, fallbackSeconds = 600) {
  if (!expiresAt) return Number(fallbackSeconds || 600);
  const remain = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(0, remain);
}

// Preset Amounts Handler
function setPresetAmount(amount, button) {
  const input = document.getElementById('depositAmountInput');
  if (input) input.value = amount;

  // Toggle active class
  document.querySelectorAll('#presetAmountsGrid .sk-btn-soft').forEach(btn => {
    btn.classList.remove('active');
  });
  if (button) button.classList.add('active');
}

// 1. Tạo hóa đơn nạp VietQR động
async function createDepositBill() {
  const token = getNapToken();
  if (!token) {
    showToast('Vui lòng đăng nhập trước khi nạp tiền', false);
    setTimeout(() => window.location.href = 'login.html', 800);
    return;
  }

  const inputAmount = document.getElementById('depositAmountInput');
  const amount = Math.max(0, Math.floor(Number(inputAmount?.value || 0)));

  if (amount < 10000) {
    showToast('Số tiền nạp tối thiểu là 10.000đ', false);
    return;
  }

  const btn = document.getElementById('btnCreateDepositBill');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo hóa đơn...';

  try {
    const res = await fetch(`${NAP_API_BASE}/deposits/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ amount })
    });

    const data = await res.json().catch(() => ({}));

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-qrcode"></i> Tạo hóa đơn & mã QR thanh toán';

    if (!res.ok || data.ok === false || !data.bill) {
      if (res.status === 401) {
        if (window.handleHeaderLogout) window.handleHeaderLogout();
        window.location.href = 'login.html';
      }
      showToast(data.message || 'Không khởi tạo được hóa đơn', false);
      return;
    }

    // Hiển thị giao diện hóa đơn động
    renderActiveBill(data.bill, { persist: true });
    showToast('Đã khởi tạo hóa đơn thành công!', true);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-qrcode"></i> Tạo hóa đơn & mã QR thanh toán';
    showToast('Không kết nối được server nạp tiền', false);
  }
}

// 2. Hiển thị thông tin hóa đơn động và kích hoạt Polling / Đếm ngược
function renderActiveBill(bill, options = {}) {
  activeBillId = bill.id;
  activeBillSnapshot = bill;

  if (options.persist !== false) {
    saveStoredBill(bill);
  }

  // Ẩn form nhập tiền, hiện panel bill
  document.getElementById('deposit-form-panel').classList.add('sk-hidden');
  document.getElementById('deposit-active-panel').classList.remove('sk-hidden');

  // Ghi dữ liệu ngân hàng nhận
  setText('display-bank-name-text', bill.bank.name || '');
  setText('display-bank-tag', bill.bank.name || '');
  setText('record-bank', bill.bank.fullName || bill.bank.name || '');
  setText('record-owner', bill.bank.owner || '');
  setText('record-account', bill.bank.account || '');
  
  // Ghi mã nạp và số tiền
  setText('record-amount', formatVnd(bill.amount));
  setText('record-memo', bill.memo);
  setText('box-memo-left', bill.memo);

  const qrImg = document.getElementById('img-vietqr');
  if (qrImg) {
    qrImg.src = bill.qrUrl;
  }

  // Khởi tạo các trạng thái đếm ngược & polling
  resetLiveStatus();
  const remainSeconds = secondsUntil(bill.expiresAt, bill.expiresInSeconds || 600);
  if (remainSeconds <= 0) {
    handleBillExpired();
    return;
  }

  startBillCountdown(remainSeconds); // Tiếp tục thời gian còn lại, kể cả sau khi reload trang.
  startPaymentPolling(bill.id);
}

// Reset trạng thái thanh tiến trình & live
function resetLiveStatus() {
  const pulse = document.getElementById('liveStatusPulse');
  const text = document.getElementById('liveStatusText');

  if (pulse) {
    pulse.className = 'inline-block w-2 h-2 rounded-full bg-blue-500';
    pulse.style.animation = 'pulse 1.5s infinite';
  }
  if (text) {
    text.innerText = 'Đang chờ bạn quét QR hoặc chuyển khoản theo đúng thông tin bên dưới...';
    text.style.color = '#10b981';
  }
  setText('billCountdownTimer', '10:00');
}

function showDepositFormPanel() {
  document.getElementById('deposit-active-panel')?.classList.add('sk-hidden');
  document.getElementById('deposit-form-panel')?.classList.remove('sk-hidden');
  setText('box-memo-left', '------');
  setText('record-memo', '---');
  setText('record-bank', '---');
  setText('record-owner', '---');
  setText('record-account', '---');
  setText('record-amount', '0đ');
  setText('display-bank-name-text', 'Loading...');
  setText('display-bank-tag', '---');
}

// Hủy hóa đơn hiện tại để quay lại form nhập
async function cancelCurrentBill() {
  const isConfirmed = await showConfirmDialog({
    title: 'Xác nhận hủy hóa đơn',
    message: 'Bạn muốn hủy bỏ hóa đơn nạp tiền hiện tại?',
    confirmText: 'Xác nhận',
    cancelText: 'Hủy'
  });

  if (!isConfirmed) return;

  const billId = activeBillId;
  const token = getNapToken();

  if (billId && token) {
    try {
      const res = await fetch(`${NAP_API_BASE}/deposits/cancel/${billId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        showToast(data.message || 'Không thể hủy hóa đơn lúc này', false);
        return;
      }
    } catch (err) {
      console.error('Error calling cancel API:', err);
      showToast('Không thể kết nối tới máy chủ để hủy hóa đơn', false);
      return;
    }
  }

  // Chỉ sau khi API xác nhận hủy thành công mới dọn dẹp UI và quay lại form
  stopSuccessSparks();
  document.getElementById('payment-success-notice')?.remove();
  clearStoredBill();
  stopBillProcesses();
  showDepositFormPanel();
  showToast('Đã hủy hóa đơn nạp tiền', true);
}

// Dừng tất cả tiến trình nền
function stopBillProcesses() {
  if (activePollingInterval) {
    clearInterval(activePollingInterval);
    activePollingInterval = null;
  }
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  if (activeCountdownInterval) {
    clearInterval(activeCountdownInterval);
    activeCountdownInterval = null;
  }
  activeBillId = null;
  activeBillSnapshot = null;
}

// Đếm ngược hóa đơn
function startBillCountdown(seconds) {
  if (activeCountdownInterval) clearInterval(activeCountdownInterval);

  let remain = seconds;
  const updateCountdownLabel = () => {
    const min = Math.floor(remain / 60);
    const sec = remain % 60;
    const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    setText('billCountdownTimer', timeStr);
  };

  updateCountdownLabel();
  activeCountdownInterval = setInterval(() => {
    remain--;
    if (remain <= 0) {
      clearInterval(activeCountdownInterval);
      activeCountdownInterval = null;

      // Hóa đơn hết hạn
      handleBillExpired();
      return;
    }

    updateCountdownLabel();
  }, 1000);
}

function handleBillExpired() {
  clearStoredBill();

  // Dừng polling/events
  if (activePollingInterval) {
    clearInterval(activePollingInterval);
    activePollingInterval = null;
  }
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  if (activeCountdownInterval) {
    clearInterval(activeCountdownInterval);
    activeCountdownInterval = null;
  }

  const pulse = document.getElementById('liveStatusPulse');
  const text = document.getElementById('liveStatusText');

  if (pulse) {
    pulse.className = 'inline-block w-2 h-2 rounded-full bg-red-500';
    pulse.style.animation = 'none';
  }
  if (text) {
    text.innerText = 'Hóa đơn đã hết hạn chuyển khoản. Vui lòng hủy để tạo hóa đơn mới.';
    text.style.color = '#7f1d1d';
  }
  activeBillId = null;
  activeBillSnapshot = null;
  showDepositFormPanel();
  showToast('Hóa đơn nạp tiền đã hết hạn!', false);
}

// 3. Nhận thông báo trạng thái thanh toán tự động (Realtime qua Webhook -> SSE)
function startPaymentPolling(billId) {
  if (activePollingInterval) {
    clearInterval(activePollingInterval);
    activePollingInterval = null;
  }
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  const token = getNapToken();
  if (!token) return;

  // Sử dụng Server-Sent Events (SSE) để nhận cập nhật tức thì khi Webhook bắn về
  if (typeof EventSource !== 'undefined') {
    const url = `${NAP_API_BASE}/deposits/status/${billId}/live?token=${encodeURIComponent(token)}`;
    activeEventSource = new EventSource(url);

    activeEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.ok && ['paid', 'completed'].includes(data.status)) {
          if (activeEventSource) {
            activeEventSource.close();
            activeEventSource = null;
          }
          if (activeCountdownInterval) {
            clearInterval(activeCountdownInterval);
            activeCountdownInterval = null;
          }

          handlePaymentSuccess({
            id: billId,
            transactionCode: data.transactionCode,
            amount: data.amount,
            newBalance: data.newBalance,
            paidAt: new Date()
          });
        } else if (data.ok && ['expired', 'cancelled'].includes(data.status)) {
          if (activeEventSource) {
            activeEventSource.close();
            activeEventSource = null;
          }
          if (activeCountdownInterval) {
            clearInterval(activeCountdownInterval);
            activeCountdownInterval = null;
          }
          handleBillExpired();
        }
      } catch (err) {
        console.error('Lỗi phân tích dữ liệu Live Status:', err);
      }
    };

    activeEventSource.onerror = (err) => {
      console.warn('Kết nối EventSource bị ngắt, đang tự động kết nối lại...', err);
    };
  } else {
    // Fallback sang Polling truyền thống mỗi 3 giây nếu trình duyệt không hỗ trợ SSE (cực kỳ hiếm)
    console.log('Fallback to polling mode');
    activePollingInterval = setInterval(async () => {
      if (activeBillId !== billId) {
        clearInterval(activePollingInterval);
        return;
      }

      try {
        const res = await fetch(`${NAP_API_BASE}/deposits/status/${billId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok && ['paid', 'completed'].includes(data.status)) {
          clearInterval(activePollingInterval);
          activePollingInterval = null;
          if (activeCountdownInterval) {
            clearInterval(activeCountdownInterval);
            activeCountdownInterval = null;
          }

          handlePaymentSuccess({
            id: billId,
            transactionCode: data.transactionCode,
            amount: data.amount,
            newBalance: data.newBalance,
            paidAt: new Date()
          });
        } else if (res.ok && data.ok && ['expired', 'cancelled'].includes(data.status)) {
          clearInterval(activePollingInterval);
          activePollingInterval = null;
          if (activeCountdownInterval) {
            clearInterval(activeCountdownInterval);
            activeCountdownInterval = null;
          }
          handleBillExpired();
        }
      } catch (err) {
        console.log('Error polling bill status:', err);
      }
    }, 3000);
  }
}

function handlePaymentSuccess(details = {}) {
  clearStoredBill();

  const newBalance = Number(details.newBalance || 0);

  // Hiển thị thông báo ở góc trên bên phải
  const amount = Number(details.amount || activeBillSnapshot?.amount || 0);
  showToast(`Đã nạp thành công ${formatVnd(amount)}`, true);

  // Cập nhật thông tin user trong local storage
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || '{}');
    user.balance = newBalance;
    localStorage.setItem('user', JSON.stringify(user));
    syncUserDataUI(user);
  } catch (e) {}

  activeBillId = null;
  activeBillSnapshot = null;

  // Quay lại giao diện form nạp tiền
  showDepositFormPanel();
}

function triggerConfetti() {
  const container = document.body;
  if (!container) return;

  for (let i = 0; i < 40; i++) {
    const particle = document.createElement('div');
    particle.innerText = ['🎉', '✨', '💰', '💵', '⚡'][Math.floor(Math.random() * 5)];
    particle.style.position = 'fixed';
    particle.style.left = '50%';
    particle.style.top = '40%';
    particle.style.fontSize = `${Math.random() * 20 + 20}px`;
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '3000';
    particle.style.transition = 'all 1.2s cubic-bezier(0.25, 1, 0.5, 1)';
    particle.style.transform = 'translate(-50%, -50%)';
    container.appendChild(particle);

    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 400 + 150;
    const x = Math.cos(angle) * velocity;
    const y = Math.sin(angle) * velocity;

    setTimeout(() => {
      particle.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0)`;
      particle.style.opacity = '0';
      setTimeout(() => particle.remove(), 1200);
    }, 50);
  }
}

// Sao chép dữ liệu thông thường
function copyData(elementId, labelName) {
  const text = document.getElementById(elementId)?.innerText.trim();
  if (!text || text === '------' || text === '---') return;

  navigator.clipboard.writeText(text).then(() => {
    showToast(`Đã sao chép ${labelName} vào khay nhớ tạm!`, true);
  });
}

// Đồng bộ thông tin người dùng lên giao diện
function syncUserDataUI(user) {
  if (!user) return;
  document.querySelectorAll('.dynamic-sync-username').forEach(el => {
    el.innerText = user.username || 'user';
  });
  document.querySelectorAll('.dynamic-sync-balance').forEach(el => {
    el.innerText = formatVnd(user.balance);
  });
  const avatar = document.querySelector('.sk-user-mini .sk-avatar');
  if (avatar && user.username) {
    const displayName = user.fullName || user.username;
    avatar.innerText = displayName.trim().charAt(0).toUpperCase();
  }
}

function restoreActiveDepositBill() {
  const bill = getStoredBill();
  if (!bill) return;

  const remainSeconds = secondsUntil(bill.expiresAt, bill.expiresInSeconds || 600);
  if (remainSeconds <= 0) {
    clearStoredBill();
    showDepositFormPanel();
    return;
  }

  renderActiveBill({
    ...bill,
    expiresInSeconds: remainSeconds
  }, { persist: false, restored: true });
}

// Khởi tạo trang
async function initNapPage() {
  const token = getNapToken();
  if (!token) {
    showToast('Vui lòng đăng nhập trước khi nạp tiền', false);
    setTimeout(() => window.location.href = 'login.html', 800);
    return;
  }

  try {
    const res = await fetch(`${NAP_API_BASE}/deposit-info`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false || !data.user || !data.bank) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('isLoggedIn');
      showToast('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại', false);
      setTimeout(() => window.location.href = 'login.html', 800);
      return;
    }

    // Hiển thị logo/tên ngân hàng mặc định
    setText('display-bank-name-text', data.bank.name || '');
    const bankImg = document.querySelector('.sk-bank-logo');
    if (bankImg && data.bank.name) {
      bankImg.alt = data.bank.name;
    }

    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('isLoggedIn', 'true');

    // Đồng bộ lên UI
    syncUserDataUI(data.user);
    restoreActiveDepositBill();
  } catch (err) {
    console.error(err);
    showToast('Không kết nối được server đăng nhập', false);
  }
}

function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('isLoggedIn');
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  initNapPage();
});
