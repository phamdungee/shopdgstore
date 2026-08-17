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

function downloadDeliveryResult() {
  const text = document.getElementById('deliveryResultText').value;
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DGStore_DonHang_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetModalFlow(cartItems) {
  const totals = cartTotals();
  
  const countEl = document.getElementById('modalCartCount');
  if (countEl) countEl.innerText = cartItems.length;

  const totalQtyEl = document.getElementById('modalTotalQuantity');
  if (totalQtyEl) totalQtyEl.innerText = totals.quantity.toLocaleString('vi-VN');

  const totalPriceEl = document.getElementById('modalTotalPrice');
  if (totalPriceEl) totalPriceEl.innerText = formatVnd(totals.subtotal);

  // Render items list inside modal
  const itemsContainer = document.getElementById('modalCartItemsList');
  if (itemsContainer) {
    itemsContainer.innerHTML = cartItems.map(item => {
      const itemImg = item.image ? (window.getAbsoluteImageUrl ? window.getAbsoluteImageUrl(item.image) : item.image) : '';
      const imgHtml = itemImg
        ? `<img src="${escapeHtml(itemImg)}" alt="${escapeHtml(item.productName)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid ${escapeHtml(item.icon || 'fa-box-open')}' }))" />`
        : `<i class="fa-solid ${escapeHtml(item.icon || 'fa-box-open')}" style="color:var(--brand-light);font-size:15px;"></i>`;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div style="width: 32px; height: 32px; border-radius: 6px; overflow: hidden; background: rgba(0,0,0,0.3); display: grid; place-items: center; flex-shrink: 0;">
              ${imgHtml}
            </div>
            <div style="min-width: 0;">
              <div style="font-weight: 700; font-size: 13px; color: var(--text-bright); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.productName)}">${escapeHtml(item.productName)}</div>
              <div style="font-size: 11px; color: var(--muted);">${escapeHtml(item.variantName)} · <b style="color: #38bdf8;">x${item.quantity}</b></div>
            </div>
          </div>
          <div style="font-weight: 800; font-size: 13px; color: #10b981; white-space: nowrap;">${formatVnd(item.unitPrice * item.quantity)}</div>
        </div>
      `;
    }).join('');
  }

  // Main Card & Result Box visibility
  const mainCard = document.getElementById('checkoutMainCard');
  if (mainCard) mainCard.style.display = 'block';

  const deliveryBox = document.getElementById('deliveryResultBox');
  if (deliveryBox) deliveryBox.style.display = 'none';
  const deliveryText = document.getElementById('deliveryResultText');
  if (deliveryText) deliveryText.value = '';

  const errorBox = document.getElementById('errorResultBox');
  if (errorBox) errorBox.style.display = 'none';
  const errorDetail = document.getElementById('errorDetailText');
  if (errorDetail) errorDetail.innerText = '';
  const depBtn = document.getElementById('depositErrorBtn');
  if (depBtn) depBtn.style.display = 'none';
  const guideText = document.getElementById('errorGuideText');
  if (guideText) guideText.innerHTML = 'Vui lòng kiểm tra lại số dư hoặc liên hệ <b>Admin</b> để được hỗ trợ.';

  // Buttons
  const btnConfirm = document.getElementById('btnConfirmCheckout');
  const btnCancel = document.getElementById('btnCancelCheckout');
  
  if (btnConfirm) {
    btnConfirm.disabled = turnstileSiteKey ? true : false;
    btnConfirm.style.display = 'inline-flex';
    btnConfirm.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Xác nhận thanh toán';
  }
  if (btnCancel) {
    btnCancel.disabled = false;
    btnCancel.innerText = 'Hủy bỏ';
  }
  const modalFooter = document.getElementById('modalFooterActions');
  if (modalFooter) modalFooter.style.display = 'flex';

  // Reset and render Turnstile widget
  const container = document.getElementById('checkout-turnstile');
  if (container) {
    container.innerHTML = '';
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

  // Preserve cart - DO NOT CLEAR CART HERE!
  const itemsToCheckout = [...cart];
  resetModalFlow(itemsToCheckout);
  document.getElementById('checkoutFlowModalBackdrop').classList.add('is-visible');

  const btnConfirm = document.getElementById('btnConfirmCheckout');
  const btnCancel = document.getElementById('btnCancelCheckout');

  btnConfirm.onclick = async () => {
    btnConfirm.disabled = true;
    btnCancel.disabled = true;
    btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý thanh toán...';
    if (window.replaceIcons) window.replaceIcons(btnConfirm);

    const turnstileToken = checkoutTurnstileWidgetId !== null ? turnstile.getResponse(checkoutTurnstileWidgetId) : '';
    if (turnstileSiteKey && !turnstileToken) {
      showToast('Vui lòng hoàn thành xác thực chống bot (Turnstile).', false);
      btnConfirm.disabled = true;
      btnCancel.disabled = false;
      btnConfirm.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Xác nhận thanh toán';
      if (window.replaceIcons) window.replaceIcons(btnConfirm);
      return;
    }

    const successfulItems = [];
    const failedItems = [];
    const deliveryOutputs = [];

    // Process all items in batch
    for (const item of itemsToCheckout) {
      try {
        const orderResponse = await createOrder(item, turnstileToken);
        successfulItems.push(item);
        const text = orderResponse.deliveryText || orderResponse.delivery_text || 'Đơn hàng hoàn tất thành công!';
        deliveryOutputs.push({
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          deliveryText: text
        });
      } catch (err) {
        failedItems.push({
          item,
          error: err.message || 'Lỗi xử lý đơn hàng'
        });
      }
    }

    const mainCard = document.getElementById('checkoutMainCard');
    const footerActions = document.getElementById('modalFooterActions');

    // Remove ONLY successful items from cart
    if (successfulItems.length > 0) {
      cart = cart.filter(cartItem => {
        return !successfulItems.some(si => 
          si.productSlug === cartItem.productSlug && 
          si.variantName === cartItem.variantName
        );
      });
      saveCart();
      renderCart();
    }

    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Xác nhận thanh toán';
    }
    if (btnCancel) {
      btnCancel.disabled = false;
    }

    // Case 1: ALL FAILED
    if (successfulItems.length === 0) {
      if (checkoutTurnstileWidgetId !== null) {
        try { turnstile.reset(checkoutTurnstileWidgetId); } catch (te) {}
      }
      
      if (mainCard) mainCard.style.display = 'none';
      if (footerActions) footerActions.style.display = 'none';

      const errorBox = document.getElementById('errorResultBox');
      const errorDetail = document.getElementById('errorDetailText');
      const firstError = failedItems[0]?.error || 'Lỗi không xác định';
      if (errorDetail) errorDetail.innerText = firstError;
      if (errorBox) errorBox.style.display = 'block';

      const depBtn = document.getElementById('depositErrorBtn');
      const guideText = document.getElementById('errorGuideText');
      const isBalanceError = firstError.includes('Số dư không đủ') || firstError.toLowerCase().includes('không đủ số dư') || firstError.toLowerCase().includes('số dư của bạn không đủ');
      if (depBtn) {
        depBtn.style.display = isBalanceError ? 'inline-flex' : 'none';
      }
      if (guideText) {
        guideText.innerHTML = isBalanceError ? 'Vui lòng <b>nạp tiền</b> để tiếp tục thanh toán.' : 'Vui lòng liên hệ <b>Admin</b> để được hỗ trợ.';
      }

      if (window.replaceIcons) window.replaceIcons(document.getElementById('checkoutFlowModalBackdrop'));
      return;
    }

    // Case 2: ALL SUCCESS or PARTIAL SUCCESS
    if (mainCard) mainCard.style.display = 'none';
    if (footerActions) footerActions.style.display = 'none';

    // Show only the exact product payload returned by the server.
    let formattedResult = deliveryOutputs
      .map(out => out.deliveryText)
      .filter(Boolean)
      .join('\n');

    if (failedItems.length > 0) {
      if (formattedResult) formattedResult += '\n\n';
      formattedResult += 'Một số sản phẩm chưa thanh toán được (đã giữ trong giỏ hàng):\n';
      failedItems.forEach(fi => {
        formattedResult += `• ${fi.item.productName} (${fi.item.variantName}): ${fi.error}\n`;
      });
    }

    const deliveryTextArea = document.getElementById('deliveryResultText');
    if (deliveryTextArea) deliveryTextArea.value = formattedResult;

    const successBox = document.getElementById('deliveryResultBox');
    if (successBox) successBox.style.display = 'block';

    triggerConfetti();
    showToast(`Đã thanh toán thành công ${successfulItems.length} sản phẩm!`);
    if (window.replaceIcons) window.replaceIcons(document.getElementById('checkoutFlowModalBackdrop'));
  };
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
