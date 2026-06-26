const CART_KEY = 'dgCart';
const API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');

let cart = [];

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

async function createOrder(item) {
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
      unitPrice: item.unitPrice
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
  try {
    for (const item of checkoutItems) {
      await createOrder(item);
    }

    cart = [];
    saveCart();
    renderCart();
    showToast('Thanh toán giỏ hàng thành công');
    showCheckoutSuccessNotice(totals.subtotal);
  } catch (err) {
    showToast(err.message || 'Không thanh toán được giỏ hàng', false);
  }
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
  const token = localStorage.getItem('token');
  if (!token) {
    const shell = document.querySelector('.sk-shell');
    if (shell) shell.style.display = 'none';

    if (window.showToast) {
      window.showToast('Vui lòng đăng nhập để xem giỏ hàng!', false);
    } else {
      alert('Vui lòng đăng nhập để xem giỏ hàng!');
    }

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1000);
    return;
  }

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
