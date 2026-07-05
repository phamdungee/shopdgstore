const CART_KEY = 'dgCart';
const API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');

let cart = [];
let checkoutTurnstileWidgetId = null;
let turnstileSiteKey = null;

async function loadTurnstileConfig() {
  try {
    const res = await fetch(`${API_BASE}/auth/config`);
    const data = await res.json();
    if (data.ok && data.cloudflareTurnstileSiteKey) {
      turnstileSiteKey = data.cloudflareTurnstileSiteKey;
    }
  } catch (err) {
    console.error('Failed to load Turnstile config:', err);
  }
}
loadTurnstileConfig();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatVnd(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

// showToast is loaded globally from common.js

function showCheckoutSuccessNotice(total) {
  const existed = document.getElementById('checkout-success-notice');
  if (existed) existed.remove();

  const notice = document.createElement('div');
  notice.id = 'checkout-success-notice';
  notice.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:3500',
    'display:grid',
    'place-items:center',
    'padding:18px',
    'background:rgba(15,23,42,.46)',
    'backdrop-filter:blur(8px)'
  ].join(';');
  notice.innerHTML = `
    <div class="sk-card" style="width:min(420px,100%); padding:22px; text-align:center; box-shadow:var(--shadow);">
      <div style="width:58px;height:58px;margin:0 auto 14px;display:grid;place-items:center;border-radius:50%;background:#dcfce7;color:var(--success);font-size:28px;">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <h2 style="margin:0 0 8px;font-size:22px;">Giao dịch thành công</h2>
      <p style="margin:0;color:var(--muted);line-height:1.6;">Đơn hàng đã được ghi nhận và trừ số dư tài khoản.</p>
      <div style="margin:16px 0;padding:12px;border-radius:var(--radius);background:var(--surface-soft);border:1px solid var(--line);">
        <span style="display:block;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;">Tổng thanh toán</span>
        <b style="display:block;margin-top:5px;color:var(--success);font-size:24px;">${formatVnd(total)}</b>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <a class="sk-btn sk-btn-primary" href="index.html#orders"><i class="fa-solid fa-receipt"></i> Xem đơn hàng</a>
        <button class="sk-btn" type="button" onclick="document.getElementById('checkout-success-notice')?.remove()">Đóng</button>
      </div>
    </div>
  `;
  document.body.appendChild(notice);
  if (window.replaceIcons) window.replaceIcons(notice);
}

function normalizeCart(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      productSlug: String(item.productSlug || item.slug || '').trim(),
      productName: String(item.productName || item.name || 'Sản phẩm').trim(),
      variantName: String(item.variantName || item.variant || 'Gói mặc định').trim(),
      quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
      unitPrice: Math.max(0, Math.floor(Number(item.unitPrice || item.price || 0))),
      image: item.image || '',
      icon: item.icon || 'fa-box'
    }))
    .filter(item => item.productSlug && item.unitPrice > 0);
}

function loadCart() {
  try {
    const stored = localStorage.getItem(CART_KEY);
    if (!stored) return [];
    return normalizeCart(JSON.parse(stored));
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function cartTotals() {
  return cart.reduce((totals, item) => {
    totals.items += 1;
    totals.quantity += item.quantity;
    totals.subtotal += item.unitPrice * item.quantity;
    return totals;
  }, { items: 0, quantity: 0, subtotal: 0 });
}

function cartMedia(item) {
  if (item.image) {
    const imageUrl = window.getAbsoluteImageUrl ? window.getAbsoluteImageUrl(item.image) : item.image;
    return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.productName)}" onerror="this.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid ${escapeHtml(item.icon)}' }))">`;
  }
  return `<i class="fa-solid ${escapeHtml(item.icon)}"></i>`;
}

function renderCart() {
  const list = document.getElementById('cartList');
  const totals = cartTotals();

  const cartCount = document.getElementById('headerCartCount');
  if (cartCount) {
    cartCount.innerText = totals.items > 99 ? '99+' : String(totals.items);
    cartCount.classList.toggle('is-visible', totals.items > 0);
  }
  document.getElementById('summaryItems').innerText = totals.items.toLocaleString('vi-VN');
  document.getElementById('summaryQuantity').innerText = totals.quantity.toLocaleString('vi-VN');
  document.getElementById('summarySubtotal').innerText = formatVnd(totals.subtotal);
  document.getElementById('summaryTotal').innerText = formatVnd(totals.subtotal);

  if (!cart.length) {
    list.innerHTML = `
      <div class="sk-cart-empty">
        <i class="fa-solid fa-cart-shopping"></i>
        <b>Giỏ hàng đang trống</b>
        <span>Chọn sản phẩm và thêm vào giỏ để thanh toán bằng số dư tài khoản.</span>
        <a class="sk-btn sk-btn-primary" href="index.html#product"><i class="fa-solid fa-box-open"></i> Xem sản phẩm</a>
      </div>
    `;
    return;
  }

  list.innerHTML = cart.map((item, index) => `
    <article class="sk-cart-item">
      <div class="sk-cart-media">${cartMedia(item)}</div>
      <div class="sk-cart-info">
        <h3 title="${escapeHtml(item.productName)}">${escapeHtml(item.productName)}</h3>
        <p>${escapeHtml(item.variantName)} · ${formatVnd(item.unitPrice)} / gói</p>
        <span class="sk-cart-line-price">${formatVnd(item.unitPrice * item.quantity)}</span>
      </div>
      <div class="sk-cart-quantity">
        <button type="button" onclick="changeCartQuantity(${index}, -1)" aria-label="Giảm số lượng"><i class="fa-solid fa-minus"></i></button>
        <input type="number" min="1" value="${item.quantity}" onchange="setCartQuantity(${index}, this.value)" />
        <button type="button" onclick="changeCartQuantity(${index}, 1)" aria-label="Tăng số lượng"><i class="fa-solid fa-plus"></i></button>
      </div>
      <button class="sk-icon-btn sk-btn-danger" type="button" onclick="removeCartItem(${index})" aria-label="Xóa sản phẩm"><i class="fa-solid fa-trash"></i></button>
    </article>
  `).join('');
  if (window.replaceIcons) window.replaceIcons(list);
}

function changeCartQuantity(index, delta) {
  if (!cart[index]) return;
  cart[index].quantity = Math.max(1, cart[index].quantity + delta);
  saveCart();
  renderCart();
}

function setCartQuantity(index, value) {
  if (!cart[index]) return;
  cart[index].quantity = Math.max(1, Math.floor(Number(value || 1)));
  saveCart();
  renderCart();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
  showToast('Đã xóa sản phẩm khỏi giỏ hàng');
}

function clearCart() {
  if (!cart.length) return;
  if (!confirm('Xóa toàn bộ sản phẩm khỏi giỏ hàng?')) return;
  cart = [];
  saveCart();
  renderCart();
  showToast('Đã xóa giỏ hàng');
}

async function createOrder(item, turnstileToken) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    throw new Error('Vui lòng đăng nhập trước khi thanh toán');
  }

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      productSlug: item.productSlug,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      'cf-turnstile-response': turnstileToken
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    if (res.status === 401) {
      if (window.handleHeaderLogout) window.handleHeaderLogout();
      window.location.href = 'login.html';
    }
    throw new Error(data.message || `Không thanh toán được ${item.productName}`);
  }

  if (data.user) {
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('isLoggedIn', 'true');
  }

  return data.order;
}

function closeCheckoutModal() {
  document.getElementById('checkoutFlowModalBackdrop').classList.remove('is-visible');
}

function resetModalFlow(item) {
  const totals = item.unitPrice * item.quantity;
  
  document.getElementById('modalProductTitle').innerText = item.productName;
  document.getElementById('modalVariantTitle').innerText = `${item.variantName} (x${item.quantity})`;
  document.getElementById('modalTotalPrice').innerText = formatVnd(totals);

  // Buttons
  const btnConfirm = document.getElementById('btnConfirmCheckout');
  const btnCancel = document.getElementById('btnCancelCheckout');
  
  if (turnstileSiteKey) {
    btnConfirm.disabled = true; // Wait for Turnstile to verify
  } else {
    btnConfirm.disabled = false;
  }
  
  btnConfirm.style.display = 'inline-flex';
  btnConfirm.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Xác nhận & Thanh toán';
  btnCancel.disabled = false;
  btnCancel.innerText = 'Hủy bỏ';
  document.getElementById('modalFooterActions').style.display = 'flex';

  // Nodes
  document.getElementById('nodeClient').className = 'sk-flow-node is-active';
  document.getElementById('nodeServer').className = 'sk-flow-node';
  document.getElementById('nodeProvider').className = 'sk-flow-node';
  document.getElementById('providerNodeLabel').innerText = 'Nhà cung cấp';

  // Lines
  document.getElementById('lineFill1').style.width = '0%';
  document.getElementById('lineFill1').className = 'sk-flow-line-fill';
  document.getElementById('lineClientServer').className = 'sk-flow-line';

  document.getElementById('lineFill2').style.width = '0%';
  document.getElementById('lineFill2').className = 'sk-flow-line-fill';
  document.getElementById('lineServerProvider').className = 'sk-flow-line';

  // Stage rows
  document.getElementById('stageRow1').className = 'sk-flow-stage-row is-active';
  document.getElementById('stageDesc1').innerText = 'Chuẩn bị gửi yêu cầu đặt hàng lên server trung gian...';
  document.getElementById('stageTime1').innerText = '';

  document.getElementById('stageRow2').className = 'sk-flow-stage-row';
  document.getElementById('stageDesc2').innerText = 'Đang chờ xử lý yêu cầu...';
  document.getElementById('stageTime2').innerText = '';

  document.getElementById('stageRow3').className = 'sk-flow-stage-row';
  document.getElementById('stageDesc3').innerText = 'Chờ giai đoạn trước hoàn thành...';
  document.getElementById('stageTime3').innerText = '';

  // Result boxes
  document.getElementById('deliveryResultBox').style.display = 'none';
  document.getElementById('deliveryResultText').value = '';
  document.getElementById('errorResultBox').style.display = 'none';
  document.getElementById('errorDetailText').innerText = '';

  // Reset and render Turnstile widget
  const container = document.getElementById('checkout-turnstile');
  if (container) {
    container.innerHTML = ''; // Clear previous widget
    if (turnstileSiteKey) {
      const renderWhenReady = () => {
        if (window.turnstile) {
          const placeholder = document.createElement('div');
          container.appendChild(placeholder);
          checkoutTurnstileWidgetId = turnstile.render(placeholder, {
            sitekey: turnstileSiteKey,
            theme: 'dark',
            callback: function() {
              const btnConfirm = document.getElementById('btnConfirmCheckout');
              if (btnConfirm) btnConfirm.disabled = false;
            },
            'expired-callback': function() {
              const btnConfirm = document.getElementById('btnConfirmCheckout');
              if (btnConfirm) btnConfirm.disabled = true;
            },
            'error-callback': function() {
              const btnConfirm = document.getElementById('btnConfirmCheckout');
              if (btnConfirm) btnConfirm.disabled = true;
            }
          });
        } else {
          setTimeout(renderWhenReady, 100);
        }
      };
      renderWhenReady();
    } else {
      checkoutTurnstileWidgetId = null;
    }
  }

  if (window.replaceIcons) window.replaceIcons(document.getElementById('checkoutFlowModalBackdrop'));
}

function getTimeNow() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function copyDeliveryResult() {
  const text = document.getElementById('deliveryResultText').value;
  if (!text) return;
  const btn = event?.target?.closest?.('button') || document.querySelector('#deliveryResultBox button');
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const oldHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã sao chép!';
      if (window.replaceIcons) window.replaceIcons(btn);
      setTimeout(() => { btn.innerHTML = oldHTML; if (window.replaceIcons) window.replaceIcons(btn); }, 2000);
    }
  });
}

function triggerConfetti() {
  const container = document.getElementById('checkoutFlowModalBackdrop');
  if (!container) return;

  const emojis = ['🎉', '✨', '⚡', '💎', '🔥', '🎊', '💜'];
  for (let i = 0; i < 40; i++) {
    const particle = document.createElement('div');
    particle.innerText = emojis[Math.floor(Math.random() * emojis.length)];
    particle.style.cssText = `
      position:absolute; left:50%; top:45%;
      font-size:${Math.random() * 18 + 14}px;
      pointer-events:none; z-index:3000;
      transition: all ${0.6 + Math.random() * 0.5}s cubic-bezier(0.25, 1, 0.5, 1);
      transform: translate(-50%, -50%);
    `;
    container.appendChild(particle);

    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 280 + 80;
    const x = Math.cos(angle) * velocity;
    const y = Math.sin(angle) * velocity - 50;

    requestAnimationFrame(() => {
      particle.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0) rotate(${Math.random() * 360}deg)`;
      particle.style.opacity = '0';
      setTimeout(() => particle.remove(), 1200);
    });
  }
}

async function checkoutCart() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  if (!cart.length) {
    showToast('Giỏ hàng đang trống', false);
    return;
  }

  const totals = cartTotals();
  if (!confirm(`Thanh toán ${totals.quantity} sản phẩm với tổng ${formatVnd(totals.subtotal)}?`)) return;

  const checkoutItems = [...cart];
  cart = [];
  saveCart();
  renderCart();

  let currentIndex = 0;

  async function processNextItem() {
    if (currentIndex >= checkoutItems.length) {
      showToast('Hoàn tất toàn bộ giỏ hàng!');
      return;
    }

    const item = checkoutItems[currentIndex];
    resetModalFlow(item);
    document.getElementById('checkoutFlowModalBackdrop').classList.add('is-visible');

    const btnConfirm = document.getElementById('btnConfirmCheckout');
    const btnCancel = document.getElementById('btnCancelCheckout');

    btnConfirm.onclick = async () => {
      btnConfirm.disabled = true;
      btnCancel.disabled = true;
      btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
      if (window.replaceIcons) window.replaceIcons(btnConfirm);

      const turnstileToken = checkoutTurnstileWidgetId !== null ? turnstile.getResponse(checkoutTurnstileWidgetId) : '';
      if (turnstileSiteKey && !turnstileToken) {
        showToast('Vui lòng hoàn thành xác thực chống bot (Turnstile).', false);
        btnConfirm.disabled = true; // Wait for them to solve it
        btnCancel.disabled = false;
        btnConfirm.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Xác nhận & Thanh toán';
        if (window.replaceIcons) window.replaceIcons(btnConfirm);
        return;
      }

      // --- STAGE 1: CLIENT SEND REQUEST ---
      document.getElementById('stageDesc1').innerText = 'Đang gửi yêu cầu và thanh toán bằng số dư ví...';
      document.getElementById('lineClientServer').classList.add('is-active');
      document.getElementById('lineFill1').style.width = '100%';

      await new Promise(resolve => setTimeout(resolve, 1000));

      document.getElementById('nodeClient').className = 'sk-flow-node is-success';
      document.getElementById('nodeServer').className = 'sk-flow-node is-active';
      document.getElementById('stageRow1').className = 'sk-flow-stage-row is-success';
      document.getElementById('stageDesc1').innerText = 'Hoàn thành — Đã gửi request đặt hàng từ Web/Client.';
      document.getElementById('stageTime1').innerText = getTimeNow();

      // --- STAGE 2: SERVER PROCESSING ---
      document.getElementById('stageRow2').className = 'sk-flow-stage-row is-active';
      document.getElementById('stageDesc2').innerText = 'Server đang phân tích gói hàng, trừ số dư và kiểm tra kho...';

      let orderResponse = null;
      let orderError = null;

      try {
        orderResponse = await createOrder(item, turnstileToken);
      } catch (err) {
        orderError = err;
      }

      // Pulse flow line between Server and Provider
      document.getElementById('lineServerProvider').classList.add('is-active');
      document.getElementById('lineFill2').style.width = '100%';

      await new Promise(resolve => setTimeout(resolve, 1000));

      if (orderError) {
        if (checkoutTurnstileWidgetId !== null) {
          try {
            turnstile.reset(checkoutTurnstileWidgetId);
          } catch (te) {}
        }
        // ── ERROR HANDLING ──
        document.getElementById('nodeServer').className = 'sk-flow-node is-error';
        document.getElementById('lineFill1').className = 'sk-flow-line-fill is-error';
        document.getElementById('lineFill2').className = 'sk-flow-line-fill is-error';
        document.getElementById('lineClientServer').className = 'sk-flow-line';
        document.getElementById('lineServerProvider').className = 'sk-flow-line';
        document.getElementById('stageRow2').className = 'sk-flow-stage-row is-error';
        document.getElementById('stageDesc2').innerText = 'Thất bại — Không thể xử lý đơn hàng tại server.';
        document.getElementById('stageTime2').innerText = getTimeNow();

        document.getElementById('nodeProvider').className = 'sk-flow-node is-skipped';
        document.getElementById('stageRow3').className = 'sk-flow-stage-row is-skipped';
        document.getElementById('stageDesc3').innerText = 'Bỏ qua — Giai đoạn trước thất bại.';

        const errorBox = document.getElementById('errorResultBox');
        const errorDetail = document.getElementById('errorDetailText');
        if (errorDetail) errorDetail.innerText = orderError.message || 'Lỗi không xác định';
        if (errorBox) errorBox.style.display = 'block';

        document.getElementById('modalFooterActions').style.display = 'none';

        const closeBtn = errorBox.querySelector('.sk-error-actions button');
        if (closeBtn) {
          if (currentIndex < checkoutItems.length - 1) {
            closeBtn.innerHTML = '<i class="fa-solid fa-forward"></i> Tiếp tục sản phẩm tiếp theo';
            closeBtn.className = 'sk-btn sk-btn-primary';
            closeBtn.onclick = () => {
              closeCheckoutModal();
              currentIndex++;
              processNextItem();
            };
          } else {
            closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Đóng';
            closeBtn.className = 'sk-btn';
            closeBtn.onclick = () => {
              closeCheckoutModal();
            };
          }
        }
        if (window.replaceIcons) window.replaceIcons(document.getElementById('checkoutFlowModalBackdrop'));
        return;
      }

      // ── SUCCESS FLOW ──
      const deliveryText = orderResponse.deliveryText || orderResponse.delivery_text || 'Đơn hàng hoàn tất.';

      document.getElementById('nodeServer').className = 'sk-flow-node is-success';
      document.getElementById('nodeProvider').className = 'sk-flow-node is-active';
      document.getElementById('stageRow2').className = 'sk-flow-stage-row is-success';
      document.getElementById('stageDesc2').innerText = 'Hoàn thành — Kết nối API đối tác/kho hàng thành công.';
      document.getElementById('stageTime2').innerText = getTimeNow();

      // --- STAGE 3: DATABASE SAVE & DELIVER ---
      document.getElementById('stageRow3').className = 'sk-flow-stage-row is-active';
      document.getElementById('stageDesc3').innerText = 'Đang cập nhật CSDL, lưu vết ví và kích hoạt trả hàng tự động...';

      await new Promise(resolve => setTimeout(resolve, 800));

      document.getElementById('nodeProvider').className = 'sk-flow-node is-success';
      document.getElementById('lineFill1').className = 'sk-flow-line-fill is-success';
      document.getElementById('lineFill2').className = 'sk-flow-line-fill is-success';
      document.getElementById('lineClientServer').className = 'sk-flow-line';
      document.getElementById('lineServerProvider').className = 'sk-flow-line';
      document.getElementById('stageRow3').className = 'sk-flow-stage-row is-success';
      document.getElementById('stageDesc3').innerText = 'Hoàn thành — CSDL cập nhật thành công. Đơn hàng kích hoạt!';
      document.getElementById('stageTime3').innerText = getTimeNow();

      // Render Result
      document.getElementById('deliveryResultText').value = deliveryText;
      const successBox = document.getElementById('deliveryResultBox');
      successBox.style.display = 'block';

      const historyLink = successBox.querySelector('.sk-delivery-actions a');
      if (historyLink) {
        if (currentIndex < checkoutItems.length - 1) {
          historyLink.innerHTML = '<i class="fa-solid fa-forward"></i> Tiếp theo';
          historyLink.href = 'javascript:void(0);';
          historyLink.onclick = () => {
            closeCheckoutModal();
            currentIndex++;
            processNextItem();
          };
        } else {
          historyLink.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Lịch sử đơn hàng';
          historyLink.href = '/index.html#orders';
          historyLink.onclick = null;
        }
      }

      document.getElementById('modalFooterActions').style.display = 'none';

      triggerConfetti();
      if (window.replaceIcons) window.replaceIcons(document.getElementById('checkoutFlowModalBackdrop'));
    };
  }

  processNextItem();
}

function syncCartCheckoutButton() {
  const btn = document.getElementById('btnCartCheckout');
  const token = localStorage.getItem('token');
  if (btn && !token) {
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Đăng nhập để thanh toán';
    if (window.replaceIcons) window.replaceIcons(btn);
  }
}

function hideCartPreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  preloader.classList.add('opacity-0');
  setTimeout(() => preloader.remove(), 400);
}

function initCartPage() {
  cart = loadCart();
  renderCart();
  syncCartCheckoutButton();
  hideCartPreloader();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCartPage);
} else {
  initCartPage();
}
