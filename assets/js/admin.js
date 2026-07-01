// assets/js/admin.js
// Dashboard riêng cho tài khoản admin.

const ADMIN_API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
let adminUsers = [];
let adminLoginLogs = [];
const ADMIN_PRODUCT_CATEGORIES = [
  { value: 'netflix', label: 'Netflix / TV' },
  { value: 'ai', label: 'Trí tuệ nhân tạo (AI)' },
  { value: 'design', label: 'Thiết kế / Graphics' },
  { value: 'social', label: 'Tương tác MXH' },
  { value: 'shopee', label: 'Shopee' }
];

function adminToken() {
  return localStorage.getItem('token');
}

function formatAdminMoney(value) {
  const number = Number(value || 0);
  return `${(Number.isFinite(number) ? number : 0).toLocaleString('vi-VN')}đ`;
}

function formatAdminDate(value) {
  if (!value) return '---';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN');
}

function escapeAdminHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function adminImageSrc(value) {
  const image = String(value || '').trim();
  if (!image) return '';
  if (/^(https?:|\/)/i.test(image)) return image;
  return `/${image}`;
}

function safeAdminIconClass(value) {
  const icon = String(value || 'fa-box').trim();
  return /^fa-[a-z0-9-]+$/i.test(icon) ? icon : 'fa-box';
}

function numberOrEmpty(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function optionalInt(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
}

function optionalMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const number = parseFloat(raw);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseFloatOrZero(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function parseIntOrNull(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = parseInt(raw, 10);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function populateProductCategoryDropdown(selectedValue = '') {
  const select = document.getElementById('prodCat');
  if (!select) return;

  select.innerHTML = ADMIN_PRODUCT_CATEGORIES
    .map(category => `<option value="${escapeAdminHtml(category.value)}">${escapeAdminHtml(category.label)}</option>`)
    .join('');

  if (selectedValue && ADMIN_PRODUCT_CATEGORIES.some(category => category.value === selectedValue)) {
    select.value = selectedValue;
  }
}

function clearAdminSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('isLoggedIn');
}

function adminLogout() {
  clearAdminSession();
  window.location.href = 'login.html';
}

function hideAdminPreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  preloader.classList.add('opacity-0');
  setTimeout(() => preloader.remove(), 350);
}

async function adminFetch(path) {
  const token = adminToken();
  if (!token) {
    window.location.href = 'login.html';
    throw new Error('UNAUTHENTICATED');
  }

  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    if (res.status === 401) {
      clearAdminSession();
      window.location.href = 'login.html';
      throw new Error('UNAUTHENTICATED');
    }

    if (res.status === 403) {
      alert('Tài khoản này không có quyền admin.');
      window.location.href = 'index.html';
      throw new Error('FORBIDDEN');
    }

    throw new Error(data.message || 'Không tải được dữ liệu admin');
  }

  return data;
}

function renderAdminStats(stats) {
  document.getElementById('statTotalUsers').innerText = Number(stats.totalUsers || 0).toLocaleString('vi-VN');
  document.getElementById('statActiveUsers').innerText = Number(stats.activeUsers || 0).toLocaleString('vi-VN');
  document.getElementById('statAdminUsers').innerText = Number(stats.adminUsers || 0).toLocaleString('vi-VN');
  document.getElementById('statTotalBalance').innerText = formatAdminMoney(stats.totalBalance);
}

function renderAdminUsers() {
  const query = (document.getElementById('adminUserSearch')?.value || '').trim().toLowerCase();
  const table = document.getElementById('adminUsersTable');
  if (!table) return;

  const list = adminUsers.filter(user => {
    const haystack = `${user.username || ''} ${user.email || ''} ${user.fullName || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  table.innerHTML = list.map(user => {
    const avatarLetter = (user.username || 'U').charAt(0).toUpperCase();
    const roleClass = user.role === 'admin' ? 'admin' : 'user';
    const statusClass = user.status === 'active' ? 'active' : 'locked';
    
    return `
      <tr>
        <td style="display:flex; align-items:center; gap:10px; border-bottom:0">
          <div class="user-avatar-circle">${escapeAdminHtml(avatarLetter)}</div>
          <div>
            <b>${escapeAdminHtml(user.username || 'user')}</b>
            <div style="font-size:11px; color:var(--muted)">${escapeAdminHtml(user.fullName || 'Chưa cập nhật')}</div>
          </div>
        </td>
        <td>${escapeAdminHtml(user.email || '---')}</td>
        <td><span class="badge-role ${roleClass}">${escapeAdminHtml(user.role || 'user')}</span></td>
        <td><span class="badge-status ${statusClass}">${user.status === 'active' ? 'Hoạt động' : 'Bị khóa'}</span></td>
        <td class="sk-price"><b>${formatAdminMoney(user.balance)}</b></td>
        <td>${formatAdminDate(user.createdAt)}</td>
        <td>${formatAdminDate(user.lastLoginAt)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7">Không có tài khoản phù hợp.</td></tr>';
}

function renderOverviewUsers() {
  const table = document.getElementById('overviewUsersTable');
  if (!table) return;

  // Show top 5 recent users
  const list = adminUsers.slice(0, 5);

  table.innerHTML = list.map(user => {
    const avatarLetter = (user.username || 'U').charAt(0).toUpperCase();
    const roleClass = user.role === 'admin' ? 'admin' : 'user';
    const statusClass = user.status === 'active' ? 'active' : 'locked';

    return `
      <tr>
        <td style="display:flex; align-items:center; gap:8px; border-bottom:0">
          <div class="user-avatar-circle" style="width:28px; height:28px; font-size:11px">${escapeAdminHtml(avatarLetter)}</div>
          <div>
            <b style="font-size:13px">${escapeAdminHtml(user.username || 'user')}</b>
          </div>
        </td>
        <td><span class="badge-role ${roleClass}">${escapeAdminHtml(user.role || 'user')}</span></td>
        <td><span class="badge-status ${statusClass}">${user.status === 'active' ? 'Hoạt động' : 'Bị khóa'}</span></td>
        <td class="sk-price"><b>${formatAdminMoney(user.balance)}</b></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4">Chưa có thành viên nào.</td></tr>';
}

function renderAdminLoginLogs() {
  const table = document.getElementById('adminLoginLogsTable');
  const overviewTable = document.getElementById('overviewLoginLogsTable');
  
  if (table) {
    table.innerHTML = adminLoginLogs.map(log => `
      <tr>
        <td><b>${escapeAdminHtml(log.username_or_email || '---')}</b></td>
        <td><code>${escapeAdminHtml(log.ip_address || '---')}</code></td>
        <td><span class="sk-badge${log.success ? '' : ' sk-badge-accent'}" style="background:${log.success ? '#f0fdf4' : '#fef2f2'}; color:${log.success ? '#16a34a' : '#dc2626'}; border:1px solid ${log.success ? '#bbf7d0' : '#fee2e2'}">${log.success ? 'Thành công' : 'Thất bại'}</span></td>
        <td>${escapeAdminHtml(log.reason || '---')}</td>
        <td>${formatAdminDate(log.created_at)}</td>
      </tr>
    `).join('') || '<tr><td colspan="5">Chưa có nhật ký đăng nhập.</td></tr>';
  }
  
  if (overviewTable) {
    overviewTable.innerHTML = adminLoginLogs.slice(0, 5).map(log => `
      <tr>
        <td><b>${escapeAdminHtml(log.username_or_email || '---')}</b></td>
        <td><code>${escapeAdminHtml(log.ip_address || '---')}</code></td>
        <td><span class="sk-badge${log.success ? '' : ' sk-badge-accent'}" style="background:${log.success ? '#f0fdf4' : '#fef2f2'}; color:${log.success ? '#16a34a' : '#dc2626'}; border:1px solid ${log.success ? '#bbf7d0' : '#fee2e2'}">${log.success ? 'Thành công' : 'Thất bại'}</span></td>
        <td>${formatAdminDate(log.created_at)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">Chưa có nhật ký đăng nhập.</td></tr>';
  }
}

let adminProducts = [];

function adminProductIconFallback(iconClass = 'fa-box') {
  return `<div style="width:40px; height:40px; display:flex; align-items:center; justify-content:center; background:var(--surface-soft); border-radius:6px; border:1px solid var(--line)"><i class="fa-solid ${escapeAdminHtml(safeAdminIconClass(iconClass))}"></i></div>`;
}

function bindAdminProductTable(table) {
  table.querySelectorAll('[data-product-action]').forEach(button => {
    button.addEventListener('click', () => {
      const productId = button.dataset.productId;
      if (!productId) return;
      if (button.dataset.productAction === 'edit') editProduct(productId);
      if (button.dataset.productAction === 'delete') deleteProduct(productId);
    });
  });

  table.querySelectorAll('img[data-fallback-icon]').forEach(image => {
    image.addEventListener('error', () => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = adminProductIconFallback(image.dataset.fallbackIcon);
      image.replaceWith(wrapper.firstElementChild);
    }, { once: true });
  });
}

function renderAdminProducts() {
  const query = (document.getElementById('adminProductSearch')?.value || '').trim().toLowerCase();
  const table = document.getElementById('adminProductsTable');
  if (!table) return;

  const list = adminProducts.filter(prod => {
    const haystack = `${prod.name || ''} ${prod.slug || ''} ${prod.cat || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  const parsePrice = (p) => {
    if (p === undefined || p === null) return 0;
    if (typeof p === 'number') return p;
    return Number(String(p).replace(/[^\d]/g, '')) || 0;
  };

  // Calculate stats
  const totalProducts = adminProducts.length;
  let apiLinkedCount = 0;
  let outOfStockCount = 0;
  let totalMarginSum = 0;
  let marginCount = 0;

  adminProducts.forEach(prod => {
    const isApiProduct = prod.vendor_id || (Array.isArray(prod.variants) && prod.variants.some(v => v.vendor_product_code || v.provider_service_id));
    if (isApiProduct) apiLinkedCount++;

    const isOutOfStock = prod.stock === 0 || (Array.isArray(prod.variants) && prod.variants.some(v => v.stock === 0));
    if (isOutOfStock) outOfStockCount++;

    const cost = Number(prod.cost_price || 0);
    const sale = parsePrice(prod.price);

    if (Array.isArray(prod.variants) && prod.variants.length > 0) {
      prod.variants.forEach(v => {
        const vCost = Number(v.cost_price || v.costPrice || 0);
        const vSale = parsePrice(v.price);
        if (vSale > 0 && vCost > 0) {
          const vProfit = vSale - vCost;
          const vMargin = (vProfit / vSale) * 100;
          totalMarginSum += vMargin;
          marginCount++;
        }
      });
    } else if (sale > 0 && cost > 0) {
      const profit = sale - cost;
      const margin = (profit / sale) * 100;
      totalMarginSum += margin;
      marginCount++;
    }
  });

  const avgMargin = marginCount > 0 ? Math.round(totalMarginSum / marginCount) : 0;

  // Update summary DOM nodes
  const statTotal = document.getElementById('prodStatTotal');
  const statApi = document.getElementById('prodStatApi');
  const statOutOfStock = document.getElementById('prodStatOutOfStock');
  const statMargin = document.getElementById('prodStatMargin');

  if (statTotal) statTotal.innerText = totalProducts.toLocaleString('vi-VN');
  if (statApi) statApi.innerText = apiLinkedCount.toLocaleString('vi-VN');
  if (statOutOfStock) statOutOfStock.innerText = outOfStockCount.toLocaleString('vi-VN');
  if (statMargin) statMargin.innerText = `${avgMargin}%`;

  table.innerHTML = list.map(prod => {
    const variants = Array.isArray(prod.variants) ? prod.variants : [];
    const iconClass = safeAdminIconClass(prod.icon);
    
    // Parse base prices for margin calculation
    const baseSale = parsePrice(prod.price);
    const baseCost = Number(prod.cost_price || 0);
    const baseProfit = baseSale - baseCost;
    const baseMargin = baseSale > 0 && baseCost > 0 ? Math.round((baseProfit / baseSale) * 100) : 0;

    const variantsSummary = variants.map(v => {
      const apiCode = v.vendor_product_code || v.provider_service_id || '';
      const costPrice = v.cost_price ?? v.costPrice;
      const stock = v.stock;
      const vPrice = parsePrice(v.price);
      const vCost = parsePrice(costPrice);
      const vProfit = vPrice - vCost;
      const vMargin = vPrice > 0 && vCost > 0 ? Math.round((vProfit / vPrice) * 100) : 0;

      return `
        <div class="sk-prod-variant-pill">
          <span class="v-title" title="${escapeAdminHtml(v.name)}">${escapeAdminHtml(v.name)}</span>
          <div class="v-details">
            <span>Giá: <b>${formatAdminMoney(v.price)}</b></span>
            ${vMargin > 0 ? `<span class="sk-prod-margin-tag">+${vMargin}%</span>` : ''}
          </div>
          <div class="v-details" style="font-size: 9px; opacity: 0.85;">
            <span>Vốn: ${vCost > 0 ? formatAdminMoney(vCost) : '---'}</span>
            <span>Kho: ${stock === null || stock === undefined || stock === '' ? '∞' : escapeAdminHtml(stock)}</span>
          </div>
          ${apiCode ? `<div class="v-details" style="font-size: 8px; color: var(--brand-light); border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 2px; margin-top: 2px;">ID API: ${escapeAdminHtml(apiCode)}</div>` : ''}
        </div>
      `;
    }).join('') || '<span style="color:var(--muted); font-style: italic; font-size: 11px;">Chưa cấu hình gói dịch vụ</span>';

    const profitMarginHtml = baseMargin > 0
      ? `<span class="sk-prod-margin-tag" style="font-size: 11px; display: block; margin-top: 2px;">Lợi nhuận: +${baseMargin}%</span>`
      : '';

    const imageSrc = adminImageSrc(prod.image);
    const imgHtml = imageSrc
      ? `<img src="${escapeAdminHtml(imageSrc)}" alt="${escapeAdminHtml(prod.name || 'Sản phẩm')}" data-fallback-icon="${escapeAdminHtml(iconClass)}" class="sk-prod-avatar"/>`
      : adminProductIconFallback(iconClass).replace(/style="[^"]*"/, 'class="sk-prod-avatar"');

    const isApiConnected = prod.vendor_id || variants.some(v => v.vendor_product_code || v.provider_service_id);

    return `
      <div class="sk-product-admin-card" data-product-id="${escapeAdminHtml(prod.id)}">
        <div style="display: flex; align-items: center; justify-content: center;">
          ${imgHtml}
        </div>
        <div class="sk-prod-info">
          <h3 class="sk-prod-title">${escapeAdminHtml(prod.name)}</h3>
          <div class="sk-prod-meta-badges">
            <code class="sk-prod-badge-code">${escapeAdminHtml(prod.slug)}</code>
            <span class="sk-prod-badge-cat sk-badge ${escapeAdminHtml(prod.cat)}">${escapeAdminHtml(prod.cat)}</span>
            <span style="font-size: 12px; color: var(--muted);" title="Biểu tượng định dạng"><i class="fa-solid ${escapeAdminHtml(iconClass)}"></i></span>
          </div>
        </div>
        <div class="sk-prod-pricing">
          <div class="sk-prod-price-row">
            <span>Giá bán:</span>
            <b>${formatAdminMoney(prod.price)}</b>
          </div>
          <div class="sk-prod-price-row">
            <span>Giá vốn:</span>
            <span>${baseCost > 0 ? formatAdminMoney(baseCost) : '---'}</span>
          </div>
          ${profitMarginHtml}
        </div>
        <div class="sk-prod-vendor">
          <div class="sk-prod-vendor-item">
            <span>Fulfillment:</span>
            <b>${isApiConnected ? '<span style="color:var(--brand-light)">API Auto ⚡</span>' : 'Kho nội bộ 📦'}</b>
          </div>
          <div class="sk-prod-vendor-item">
            <span>Mã Vendor:</span>
            <b>${escapeAdminHtml(prod.vendor_id || '---')}</b>
          </div>
          <div class="sk-prod-vendor-item">
            <span>Kho hàng:</span>
            <b>${prod.stock === null || prod.stock === undefined || prod.stock === '' ? 'Không giới hạn' : escapeAdminHtml(prod.stock)}</b>
          </div>
        </div>
        <div class="sk-prod-variants-box">
          ${variantsSummary}
        </div>
        <div class="sk-prod-actions">
          <button class="sk-btn sk-btn-soft" type="button" data-product-action="edit" data-product-id="${escapeAdminHtml(prod.id)}"><i class="fa-solid fa-pen"></i> Sửa</button>
          <button class="sk-btn sk-btn-danger" type="button" style="background:#fef2f2; color:#dc2626; border-color:#fee2e2" data-product-action="delete" data-product-id="${escapeAdminHtml(prod.id)}"><i class="fa-solid fa-trash"></i> Xóa</button>
        </div>
      </div>
    `;
  }).join('') || '<div style="text-align: center; padding: 32px; color: var(--muted);"><i class="fa-solid fa-folder-open" style="font-size: 24px; display: block; margin-bottom: 8px;"></i> Không có sản phẩm nào.</div>';

  bindAdminProductTable(table);
}

async function loadAdminProducts() {
  try {
    const data = await adminFetch('/products');
    adminProducts = data.products || [];
    renderAdminProducts();
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function switchAdminTab(tabId) {
  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.style.display = 'none';
  });
  
  // Show target section
  const target = document.getElementById(tabId + '-section');
  if (target) target.style.display = 'block';
  
  // Update menu active class
  document.querySelectorAll('.sk-admin-nav a').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === `#${tabId}`);
  });

  if (tabId === 'warehouse') {
    loadWarehouseData();
  } else if (tabId === 'vendors') {
    loadVendorsData();
  }
}

function handleHashChange() {
  const hash = window.location.hash.slice(1) || 'overview';
  if (['overview', 'users', 'products', 'warehouse', 'vendors', 'security', 'announcement'].includes(hash)) {
    switchAdminTab(hash);
  }
}

window.addEventListener('hashchange', handleHashChange);

function openProductModal(prodId = '') {
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const title = document.getElementById('modalTitle');
  const container = document.getElementById('variantsContainer');
  
  form.reset();
  container.innerHTML = '';
  populateProductCategoryDropdown();
  
  // Populate images dropdown dynamically
  const select = document.getElementById('prodImageSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Chọn ảnh sẵn có --</option>' + 
      adminImages.map(img => `<option value="${escapeAdminHtml(img)}">${escapeAdminHtml(img.split('/').pop())}</option>`).join('');
  }
  
  if (prodId) {
    title.innerText = 'Chỉnh sửa sản phẩm';
    const prod = adminProducts.find(p => String(p.id) === String(prodId));
    if (!prod) return;
    
    document.getElementById('prodId').value = prod.id;
    document.getElementById('prodName').value = prod.name;
    document.getElementById('prodSlug').value = prod.slug;
    populateProductCategoryDropdown(prod.cat);
    document.getElementById('prodIcon').value = prod.icon || 'fa-box';
    {
      const rateValue = numberOrEmpty(prod.rate);
      document.getElementById('prodRate').value = rateValue === '' ? 5.0 : rateValue;
    }
    document.getElementById('prodImage').value = prod.image || '';
    document.getElementById('prodPrice').value = numberOrEmpty(prod.price);
    document.getElementById('prodDesc').value = prod.desc || '';
    document.getElementById('prodLongDesc').value = prod.long_desc || '';
    document.getElementById('prodDeliveryType').value = prod.delivery_type || 'hybrid';
    document.getElementById('prodFallbackMode').value = prod.fallback_mode || 'api_when_out_of_stock';
    
    if (select && prod.image) {
      select.value = prod.image;
    }
    
    if (prod.variants && prod.variants.length > 0) {
      prod.variants.forEach(v => addVariantRow(v));
    } else {
      addVariantRow();
    }
  } else {
    title.innerText = 'Thêm sản phẩm mới';
    document.getElementById('prodId').value = '';
    populateProductCategoryDropdown('netflix');
    addVariantRow();
  }
  
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function onImageSelectChange() {
  const select = document.getElementById('prodImageSelect');
  const input = document.getElementById('prodImage');
  if (select && input && select.value) {
    input.value = select.value;
  }
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function addVariantRow(variant = {}) {
  const container = document.getElementById('variantsContainer');
  const data = variant && typeof variant === 'object' ? variant : {
    name: variant,
    price: arguments[1]
  };
  const apiCode = data.vendor_product_code || data.provider_service_id || '';
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input class="sk-input var-name" required placeholder="Tên gói (Ví dụ: 1 tháng)" value="${escapeAdminHtml(data.name || '')}"/>
    <input class="sk-input var-price" type="number" min="0" step="1" required placeholder="Giá bán" value="${numberOrEmpty(data.price)}"/>
    <input class="sk-input var-code" placeholder="Mã API gói" value="${escapeAdminHtml(apiCode)}"/>
    <input class="sk-input var-cost" type="number" min="0" step="1" placeholder="Giá vốn" value="${numberOrEmpty(data.cost_price ?? data.costPrice)}"/>
    <span class="var-stock-display" style="padding: 10px; font-size:13px; font-weight:800; color:var(--brand-light)">${numberOrEmpty(data.stock || 0)}</span>
    <button type="button" class="sk-icon-btn" style="color:var(--danger); border:0; background:transparent" onclick="this.parentElement.remove()" aria-label="Xóa"><i class="fa-solid fa-trash-can"></i></button>
  `;
  container.appendChild(row);
}

function getVariantsData() {
  const container = document.getElementById('variantsContainer');
  const rows = container.querySelectorAll('.variant-row');
  const variants = [];
  
  rows.forEach(row => {
    const name = row.querySelector('.var-name').value.trim();
    const price = parseFloatOrZero(row.querySelector('.var-price').value);
    const apiCode = row.querySelector('.var-code').value.trim();
    const costPrice = parseFloatOrZero(row.querySelector('.var-cost').value);
    
    if (name && price >= 0) {
      variants.push({
        name,
        price,
        vendor_product_code: apiCode,
        cost_price: costPrice
      });
    }
  });
  
  return variants;
}

async function saveProduct(event) {
  event.preventDefault();
  const token = adminToken();
  if (!token) return;

  const id = document.getElementById('prodId').value;
  const cat = document.getElementById('prodCat').value;
  const icon = document.getElementById('prodIcon').value.trim();
  const slug = document.getElementById('prodSlug').value.trim();
  const name = document.getElementById('prodName').value.trim();
  const rate = parseFloatOrZero(document.getElementById('prodRate').value);
  const image = document.getElementById('prodImage').value.trim();
  const price = parseFloatOrZero(document.getElementById('prodPrice').value);
  const desc = document.getElementById('prodDesc').value.trim();
  const longDesc = document.getElementById('prodLongDesc').value.trim();
  const deliveryType = document.getElementById('prodDeliveryType').value;
  const fallbackMode = document.getElementById('prodFallbackMode').value;
  const variants = getVariantsData();

  const body = {
    cat,
    icon,
    slug,
    name,
    desc,
    long_desc: longDesc,
    image,
    rate,
    price,
    delivery_type: deliveryType,
    fallback_mode: fallbackMode,
    variants
  };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/admin/products/${id}` : '/admin/products';

  try {
    const res = await fetch(`${ADMIN_API_BASE}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || 'Không thể lưu sản phẩm');
    }

    alert(id ? 'Cập nhật sản phẩm thành công!' : 'Thêm sản phẩm thành công!');
    closeProductModal();
    loadAdminProducts();
  } catch (err) {
    alert(err.message);
  }
}

async function editProduct(prodId) {
  openProductModal(prodId);
}

async function deleteProduct(prodId) {
  if (!confirm('Bạn có chắc chắn muốn xóa sản phẩm này? Thao tác này không thể hoàn tác.')) return;
  const token = adminToken();
  if (!token) return;

  try {
    const res = await fetch(`${ADMIN_API_BASE}/admin/products/${prodId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || 'Không xóa được sản phẩm');
    }

    alert('Đã xóa sản phẩm thành công!');
    loadAdminProducts();
  } catch (err) {
    alert(err.message);
  }
}

let adminImages = [];

async function loadAdminImages() {
  try {
    const data = await adminFetch('/admin/images');
    adminImages = data.images || [];
  } catch (err) {
    console.error('Error loading images:', err);
  }
}

async function loadAdminDashboard() {
  try {
    const me = await adminFetch('/me');
    if (me.user?.role !== 'admin') {
      alert('Tài khoản này không có quyền admin.');
      window.location.href = 'index.html';
      return;
    }

    document.getElementById('adminName').innerText = me.user.fullName || me.user.username || 'Admin';
    const data = await adminFetch('/admin/dashboard');
    adminUsers = data.users || [];
    adminLoginLogs = data.loginLogs || [];
    renderAdminStats(data.stats || {});
    renderAdminUsers();
    renderOverviewUsers();
    renderAdminLoginLogs();
    
    // Load products list
    await loadAdminProducts();
    // Load images list
    await loadAdminImages();
    // Load system announcement configuration
    await loadAnnouncement();
    
    // Setup tab views based on current URL hash
    handleHashChange();
  } catch (err) {
    console.error(err);
    if (!['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) alert(err.message);
  } finally {
    hideAdminPreloader();
  }
}

async function loadAnnouncement() {
  try {
    const res = await fetch(`${ADMIN_API_BASE}/admin/announcement/public`);
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.announcement) {
      document.getElementById('announceTitle').value = data.announcement.title || '';
      document.getElementById('announceContent').value = data.announcement.content || '';
      document.getElementById('announceActive').checked = !!data.announcement.active;
    }
  } catch (err) {
    console.error('Error loading announcement:', err);
  }
}

async function saveAnnouncement() {
  const token = adminToken();
  if (!token) return;

  const title = document.getElementById('announceTitle').value.trim();
  const content = document.getElementById('announceContent').value.trim();
  const active = document.getElementById('announceActive').checked;

  try {
    const res = await fetch(`${ADMIN_API_BASE}/admin/announcement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title, content, active })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || 'Không thể lưu thông báo');
    }

    alert('Đã lưu thông báo thành công!');
  } catch (err) {
    alert(err.message);
  }
}

// ==========================================
// NEW FEATURES: INVENTORY & VENDORS CONTROLLER
// ==========================================

let allVendors = [];

async function loadWarehouseData() {
  try {
    const res = await adminFetch('/admin/dashboard-stats');
    if (res.ok && res.stats) {
      document.getElementById('whStatAvailable').innerText = res.stats.totalStock;
      document.getElementById('whStatReserved').innerText = res.stats.reserved;
      document.getElementById('whStatActiveBatches').innerText = res.stats.totalVendors; // Mock or count batches
      document.getElementById('whStatLowWarning').innerText = res.stats.lowStock ? res.stats.lowStock.length : 0;
    }
  } catch (err) {
    console.error('Stats load warning:', err.message);
  }
  
  // Populate filter dropdowns
  populateWarehouseFilterDropdowns();
  loadInventoryItems();
  loadInventoryBatches();
  loadInventoryHistories();
}

function switchWarehouseSubTab(tab) {
  document.querySelectorAll('.wh-subtab-view').forEach(view => view.style.display = 'none');
  document.getElementById(`wh-${tab}-subtab`).style.display = 'block';
  
  // Active class update
  const btnContainer = document.querySelector('#warehouse-section div[style*="border-bottom"]');
  if (btnContainer) {
    btnContainer.querySelectorAll('.sk-btn').forEach((btn, index) => {
      const active = (tab === 'items' && index === 0) || (tab === 'batches' && index === 1) || (tab === 'history' && index === 2);
      btn.classList.toggle('active', active);
    });
  }
}

function switchVendorsSubTab(tab) {
  document.querySelectorAll('.vd-subtab-view').forEach(view => view.style.display = 'none');
  document.getElementById(`vd-${tab}-subtab`).style.display = 'block';
  
  const btnContainer = document.querySelector('#vendors-section div[style*="border-bottom"]');
  if (btnContainer) {
    btnContainer.querySelectorAll('.sk-btn').forEach((btn, index) => {
      const active = (tab === 'list' && index === 0) || (tab === 'mapping' && index === 1) || (tab === 'logs' && index === 2);
      btn.classList.toggle('active', active);
    });
  }
}

function populateWarehouseFilterDropdowns() {
  const prodSelect = document.getElementById('whFilterProduct');
  if (!prodSelect) return;
  
  prodSelect.innerHTML = '<option value="">-- Tất cả sản phẩm --</option>' +
    adminProducts.map(p => `<option value="${p.id}">${escapeAdminHtml(p.name)}</option>`).join('');
  
  onWhFilterProductChange();
}

function onWhFilterProductChange() {
  const prodId = document.getElementById('whFilterProduct').value;
  const varSelect = document.getElementById('whFilterVariant');
  if (!varSelect) return;

  if (!prodId) {
    varSelect.innerHTML = '<option value="">-- Tất cả gói --</option>';
    loadInventoryItems();
    return;
  }

  const prod = adminProducts.find(p => p.id === prodId);
  const variants = prod ? prod.variants : [];
  
  varSelect.innerHTML = '<option value="">-- Tất cả gói --</option>' +
    variants.map(v => `<option value="${v.id}">${escapeAdminHtml(v.name)}</option>`).join('');
  
  loadInventoryItems();
}

async function loadInventoryItems() {
  const prodId = document.getElementById('whFilterProduct')?.value || '';
  const varId = document.getElementById('whFilterVariant')?.value || '';
  const query = (document.getElementById('whItemSearch')?.value || '').trim().toLowerCase();
  
  const tbody = document.getElementById('whItemsTable');
  if (!tbody) return;
  
  try {
    const res = await adminFetch(`/admin/inventory/items?product_id=${prodId}&variant_id=${varId}`);
    const items = res.items || [];
    
    const filtered = items.filter(item => {
      const rawContent = JSON.stringify(item.content).toLowerCase();
      return rawContent.includes(query) || String(item.serial || '').toLowerCase().includes(query);
    });

    tbody.innerHTML = filtered.map(item => {
      let contentStr = '';
      if (item.content?.email) {
        contentStr = `Email: ${escapeAdminHtml(item.content.email)} | Pass: ${escapeAdminHtml(item.content.password)}`;
      } else if (item.content?.key) {
        contentStr = `Key: ${escapeAdminHtml(item.content.key)}`;
      } else {
        contentStr = JSON.stringify(item.content);
      }

      return `
        <tr>
          <td><b>${escapeAdminHtml(item.products?.name || 'Sản phẩm')}</b><br><span style="font-size:11px; color:var(--muted)">${escapeAdminHtml(item.product_variants?.name || 'Gói')}</span></td>
          <td><code>${contentStr}</code></td>
          <td><span class="badge-status ${item.status}">${escapeAdminHtml(item.status)}</span></td>
          <td>${formatAdminMoney(item.cost_price)}</td>
          <td>${item.sold_order_id ? `<span style="font-size:11px">Order UUID: ${item.sold_order_id.slice(0,8)}...</span>` : '---'}</td>
          <td>${formatAdminDate(item.created_at)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6">Không tìm thấy tài khoản nào trong kho.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger)">Lỗi: ${escapeAdminHtml(err.message)}</td></tr>`;
  }
}

async function loadInventoryBatches() {
  const tbody = document.getElementById('whBatchesTable');
  if (!tbody) return;
  try {
    const res = await adminFetch('/admin/inventory/batches');
    tbody.innerHTML = (res.batches || []).map(b => `
      <tr>
        <td>${b.id}</td>
        <td><b>${escapeAdminHtml(b.name)}</b></td>
        <td>${escapeAdminHtml(b.products?.name)} - <span style="font-size:11px; color:var(--muted)">${escapeAdminHtml(b.product_variants?.name)}</span></td>
        <td>${formatAdminMoney(b.import_price)}</td>
        <td>${escapeAdminHtml(b.supplier || '---')}</td>
        <td>${escapeAdminHtml(b.note || '---')}</td>
        <td>${formatAdminDate(b.created_at)}</td>
      </tr>
    `).join('') || '<tr><td colspan="7">Chưa có đợt nhập kho nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Lỗi tải đợt nhập kho</td></tr>`;
  }
}

async function loadInventoryHistories() {
  const tbody = document.getElementById('whHistoryTable');
  if (!tbody) return;
  try {
    const res = await adminFetch('/admin/inventory/histories');
    tbody.innerHTML = (res.histories || []).map(h => `
      <tr>
        <td>${h.id}</td>
        <td><span class="sk-badge">${escapeAdminHtml(h.action.toUpperCase())}</span></td>
        <td><b>${escapeAdminHtml(h.product_name)}</b><br><span style="font-size:11px; color:var(--muted)">${escapeAdminHtml(h.variant_name)}</span></td>
        <td><code>${escapeAdminHtml(h.status_before || '---')}</code></td>
        <td><code>${escapeAdminHtml(h.status_after || '---')}</code></td>
        <td><code style="font-size:11px;">${JSON.stringify(h.content_snapshot || {})}</code></td>
        <td>${formatAdminDate(h.created_at)}</td>
      </tr>
    `).join('') || '<tr><td colspan="7">Chưa có nhật ký hoạt động nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Lỗi tải lịch sử kho</td></tr>`;
  }
}

// Vendors View loaders
async function loadVendorsData() {
  await loadVendorsList();
  await loadVendorMappings();
  await loadApiLogs();
}

async function loadVendorsList() {
  const tbody = document.getElementById('vdListTable');
  if (!tbody) return;
  try {
    const res = await adminFetch('/admin/vendors');
    allVendors = res.vendors || [];
    tbody.innerHTML = allVendors.map(v => {
      const syncStatusText = v.sync_status ? ` (${v.sync_status})` : '';
      const syncTimeStr = v.last_sync_at ? formatAdminDate(v.last_sync_at) : 'Chưa';
      return `
        <tr>
          <td>${v.id}</td>
          <td>
            <b>${escapeAdminHtml(v.name)}</b>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">
              <span>Số dư: <b style="color:var(--brand-light)">${formatAdminMoney(v.cached_balance)}</b></span> |
              <span>Catalog: <b>${v.catalog_count || 0}</b></span>
            </div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">
              <span>Đồng bộ: ${syncTimeStr}${syncStatusText}</span>
            </div>
          </td>
          <td>
            <code>${escapeAdminHtml(v.api_url)}</code>
            <br>
            <span style="font-size:11px; color:var(--muted)">Adapter: ${escapeAdminHtml(v.adapter_key)}</span>
          </td>
          <td>${v.response_time_ms ? `<span class="sk-badge">${v.response_time_ms}ms</span>` : '---'}</td>
          <td><span class="badge-status ${v.status === 'active' ? 'active' : 'locked'}">${escapeAdminHtml(v.status)}</span></td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="sk-btn sk-btn-soft" style="padding:4px 8px; font-size:11px;" onclick="testVendorApi(${v.id}, this)"><i class="fa-solid fa-signal"></i> Ping</button>
              <button class="sk-btn sk-btn-soft" style="padding:4px 8px; font-size:11px;" onclick="syncVendorCatalog(${v.id}, this)"><i class="fa-solid fa-rotate"></i> Đồng bộ</button>
              <button class="sk-btn sk-btn-danger" style="padding:4px 8px; font-size:11px;" onclick="resetCircuitBreaker(${v.id})"><i class="fa-solid fa-plug-circle-check"></i> Reset CB</button>
              <button class="sk-btn sk-btn-soft" style="padding:4px 8px; font-size:11px;" onclick="openVendorModal(${v.id})"><i class="fa-solid fa-pen"></i> Sửa</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6">Chưa cấu hình nhà cung cấp nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Lỗi tải nhà cung cấp</td></tr>`;
  }
}

async function testVendorApi(id, btn) {
  let oldHtml = '';
  if (btn) {
    oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
  }

  try {
    const token = adminToken();
    const res = await fetch(`${ADMIN_API_BASE}/admin/vendors/test/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.ok && data.success) {
      alert(`Kết nối OK!\nLatency: ${data.latency}ms\nBalance: ${formatAdminMoney(data.balance)}`);
    } else {
      alert(`Lỗi kết nối: ${data.message || 'Vendor offline'}`);
    }
    await loadVendorsData();
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}

async function syncVendorCatalog(id, btn) {
  let oldHtml = '';
  if (btn) {
    oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
  }

  try {
    const token = adminToken();
    const res = await fetch(`${ADMIN_API_BASE}/admin/vendors/sync/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      const s = data.summary;
      alert(`✔ Đồng bộ thành công!\n\n` +
            `▪ Nhà cung cấp: ${s.vendor}\n` +
            `▪ Tổng số dịch vụ: ${s.total}\n` +
            `▪ +${s.new} dịch vụ mới\n` +
            `▪ ~${s.updated} dịch vụ cập nhật\n` +
            `▪ -${s.disabled} dịch vụ ngừng bán\n` +
            `▪ Số dư tài khoản: ${formatAdminMoney(s.balance)}\n` +
            `▪ Latency: ${s.latency}ms`);

      const mapVendorSelect = document.getElementById('mapVendorSelect');
      if (mapVendorSelect && Number(mapVendorSelect.value) === Number(id)) {
        await onMapVendorSelectChange();
      }

      await loadVendorsData();
    } else {
      alert(`Đồng bộ thất bại: ${data.message || 'Lỗi không xác định'}`);
      await loadVendorsData();
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
    await loadVendorsData();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}

async function resetCircuitBreaker(id) {
  try {
    const token = adminToken();
    const res = await fetch(`${ADMIN_API_BASE}/admin/vendors/reset-circuit/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok) {
      alert(data.message);
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

async function loadVendorMappings() {
  const tbody = document.getElementById('vdMappingTable');
  if (!tbody) return;
  try {
    const res = await adminFetch('/admin/vendor-products');
    tbody.innerHTML = (res.mappings || []).map(m => `
      <tr>
        <td><b>${escapeAdminHtml(m.products?.name)}</b><br><span style="font-size:11px; color:var(--muted)">${escapeAdminHtml(m.product_variants?.name)}</span></td>
        <td><b>${escapeAdminHtml(m.vendors?.name)}</b></td>
        <td><code>${escapeAdminHtml(m.vendor_product_code)}</code></td>
        <td><span class="sk-badge">${m.priority}</span></td>
        <td>
          <button class="sk-btn sk-btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteMapping(${m.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5">Chưa cấu hình API Priority Mapping nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Lỗi tải mappings</td></tr>`;
  }
}

async function deleteMapping(id) {
  if (!confirm('Xóa mapping này?')) return;
  try {
    const token = adminToken();
    const res = await fetch(`${ADMIN_API_BASE}/admin/vendor-products/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      alert('Đã xóa thành công');
      loadVendorMappings();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function loadApiLogs() {
  const tbody = document.getElementById('vdLogsTable');
  if (!tbody) return;
  try {
    const res = await adminFetch('/admin/api-logs');
    tbody.innerHTML = (res.logs || []).map(log => {
      const statusClass = log.success ? 'active' : 'locked';
      return `
        <tr>
          <td>${log.id.slice(0, 8)}...</td>
          <td><b>${escapeAdminHtml(log.store_orders?.order_code || '---')}</b></td>
          <td>${escapeAdminHtml(log.vendors?.name || '---')}</td>
          <td><code>${log.http_status || '---'}</code></td>
          <td>${log.response_time_ms ? `${log.response_time_ms}ms` : '---'}</td>
          <td><span class="badge-status ${statusClass}">${log.success ? 'Thành công' : 'Thất bại'}</span></td>
          <td><small>${escapeAdminHtml(log.error_message || '---')}</small></td>
          <td>${formatAdminDate(log.created_at)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="8">Chưa có log kết nối API nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">Lỗi tải logs</td></tr>`;
  }
}

// Dynamic cascading dropdowns for products
function loadDropdownProducts(prodSelectId) {
  const select = document.getElementById(prodSelectId);
  if (!select) return;
  select.innerHTML = '<option value="">-- Chọn sản phẩm --</option>' +
    adminProducts.map(p => `<option value="${p.id}">${escapeAdminHtml(p.name)}</option>`).join('');
}

function onImportProductSelectChange() {
  const prodId = document.getElementById('importProdSelect').value;
  const varSelect = document.getElementById('importVarSelect');
  if (!varSelect) return;
  
  if (!prodId) {
    varSelect.innerHTML = '<option value="">-- Chọn phân loại --</option>';
    return;
  }
  const prod = adminProducts.find(p => p.id === prodId);
  const variants = prod ? prod.variants : [];
  varSelect.innerHTML = '<option value="">-- Chọn phân loại --</option>' +
    variants.map(v => `<option value="${v.id}">${escapeAdminHtml(v.name)}</option>`).join('');
}

function onMapProductSelectChange() {
  const prodId = document.getElementById('mapProdSelect').value;
  const varSelect = document.getElementById('mapVarSelect');
  if (!varSelect) return;
  
  if (!prodId) {
    varSelect.innerHTML = '<option value="">-- Chọn gói --</option>';
    return;
  }
  const prod = adminProducts.find(p => p.id === prodId);
  const variants = prod ? prod.variants : [];
  varSelect.innerHTML = '<option value="">-- Chọn gói --</option>' +
    variants.map(v => `<option value="${v.id}">${escapeAdminHtml(v.name)}</option>`).join('');
}

async function onMapVendorSelectChange(previousCodeToSelect = null) {
  const vendorId = document.getElementById('mapVendorSelect').value;
  const codeSelect = document.getElementById('mapVendorProductCode');
  if (!codeSelect) return;

  const warningElId = 'mapCodeWarning';
  let warningEl = document.getElementById(warningElId);
  if (warningEl) warningEl.remove();

  if (!vendorId) {
    codeSelect.innerHTML = '<option value="">-- Chọn API code NCC --</option>';
    return;
  }

  const targetCode = previousCodeToSelect || codeSelect.value;

  try {
    const res = await adminFetch(`/admin/vendors/catalog/${vendorId}`);
    const catalog = res.catalog || [];
    
    let html = catalog.map(c => `
      <option value="${escapeAdminHtml(c.service_code)}">
        ${escapeAdminHtml(c.service_name || c.name || c.service_code)} (${formatAdminMoney(c.price)})
      </option>
    `).join('');

    if (!html) {
      html = '<option value="">-- Chưa có sản phẩm đồng bộ --</option>';
    } else {
      html = '<option value="">-- Chọn API code NCC --</option>' + html;
    }

    codeSelect.innerHTML = html;

    if (targetCode) {
      const optionExists = Array.from(codeSelect.options).some(opt => opt.value === targetCode);
      if (optionExists) {
        codeSelect.value = targetCode;
      } else {
        const disabledOpt = document.createElement('option');
        disabledOpt.value = targetCode;
        disabledOpt.text = `[CẢNH BÁO] ${targetCode} (Đã bị NCC xóa)`;
        disabledOpt.disabled = true;
        disabledOpt.selected = true;
        codeSelect.appendChild(disabledOpt);

        const warn = document.createElement('div');
        warn.id = warningElId;
        warn.style.color = 'var(--danger)';
        warn.style.fontSize = '12px';
        warn.style.fontWeight = '700';
        warn.style.marginTop = '4px';
        warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Dịch vụ này không còn tồn tại ở Vendor.';
        codeSelect.parentElement.appendChild(warn);
      }
    }
  } catch (err) {
    codeSelect.innerHTML = '<option value="">-- Lỗi tải danh mục --</option>';
  }
}

// Drag & drop TXT/CSV uploads
function setupImportDragDrop() {
  const dropzone = document.getElementById('importFileDropzone');
  const fileInput = document.getElementById('importFileInput');
  const txtArea = document.getElementById('importContentRaw');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--brand-light)';
    dropzone.style.background = 'rgba(99, 102, 241, 0.05)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
    dropzone.style.background = 'rgba(0,0,0,0.1)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
    dropzone.style.background = 'rgba(0,0,0,0.1)';
    
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleImportFile(file);
  });
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const txtArea = document.getElementById('importContentRaw');
    if (txtArea) {
      txtArea.value = content;
      triggerImportPreview();
    }
  };
  reader.readAsText(file);
}

// Import Stock preview validator
async function triggerImportPreview() {
  const content = document.getElementById('importContentRaw').value.trim();
  const previewCard = document.getElementById('importPreviewCard');
  const btn = document.getElementById('btnSubmitImport');
  
  if (!content) {
    if (previewCard) previewCard.style.display = 'none';
    if (btn) btn.disabled = true;
    return;
  }

  try {
    const token = adminToken();
    const res = await fetch(`${ADMIN_API_BASE}/admin/inventory/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ content_raw: content })
    });
    
    const data = await res.json();
    if (data.ok && data.report) {
      if (previewCard) previewCard.style.display = 'block';
      document.getElementById('previewTotal').innerText = data.report.totalLines;
      document.getElementById('previewValid').innerText = data.report.valid.length;
      document.getElementById('previewDupDb').innerText = data.report.duplicateInDbCount;
      document.getElementById('previewDupFile').innerText = data.report.duplicateInFileCount;

      if (btn) btn.disabled = data.report.valid.length === 0;
    }
  } catch (err) {
    console.error('Preview error:', err);
  }
}

// Modals toggling
function openImportStockModal() {
  const modal = document.getElementById('importStockModal');
  document.getElementById('importStockForm').reset();
  document.getElementById('importPreviewCard').style.display = 'none';
  document.getElementById('btnSubmitImport').disabled = true;
  
  loadDropdownProducts('importProdSelect');
  onImportProductSelectChange();
  setupImportDragDrop();
  
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeImportStockModal() {
  document.getElementById('importStockModal').classList.add('opacity-0', 'pointer-events-none');
}

async function submitImportStock(event) {
  event.preventDefault();
  const token = adminToken();
  if (!token) return;

  const product_id = document.getElementById('importProdSelect').value;
  const variant_id = document.getElementById('importVarSelect').value;
  const content_raw = document.getElementById('importContentRaw').value;
  const batch_name = document.getElementById('importBatchName').value.trim();
  const supplier = document.getElementById('importSupplier').value.trim();
  const import_price = parseFloatOrZero(document.getElementById('importPrice').value);
  const note = document.getElementById('importNote').value.trim();
  const duplicate_policy = document.querySelector('input[name="importDupPolicy"]:checked')?.value || 'skip';

  try {
    const res = await fetch(`${ADMIN_API_BASE}/admin/inventory/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ product_id, variant_id, content_raw, batch_name, supplier, note, import_price, duplicate_policy })
    });
    
    const data = await res.json();
    if (res.ok) {
      alert(`Ghi nhận nhập kho thành công!\n✓ Thành công: ${data.report?.successCount || 0}\n✗ Bỏ qua: ${data.report?.duplicateCount || 0}`);
      closeImportStockModal();
      loadWarehouseData();
    } else {
      throw new Error(data.message || 'Lỗi nhập hàng');
    }
  } catch (err) {
    alert(err.message);
  }
}

function openVendorModal(id = '') {
  const modal = document.getElementById('vendorModal');
  document.getElementById('vendorForm').reset();
  document.getElementById('vendorId').value = id;
  
  if (id) {
    document.getElementById('vendorModalTitle').innerText = 'Chỉnh sửa nhà cung cấp';
    const v = allVendors.find(item => Number(item.id) === Number(id));
    if (v) {
      document.getElementById('vendorName').value = v.name || '';
      document.getElementById('vendorApiUrl').value = v.api_url || '';
      document.getElementById('vendorApiKey').value = v.api_key || '';
      document.getElementById('vendorAdapterKey').value = v.adapter_key || 'botmmo';
      document.getElementById('vendorStatus').value = v.status || 'active';
    }
  } else {
    document.getElementById('vendorModalTitle').innerText = 'Thêm nhà cung cấp API';
  }
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeVendorModal() {
  document.getElementById('vendorModal').classList.add('opacity-0', 'pointer-events-none');
}

async function saveVendor(e) {
  e.preventDefault();
  const token = adminToken();
  if (!token) return;

  const id = document.getElementById('vendorId').value;
  const name = document.getElementById('vendorName').value.trim();
  const api_url = document.getElementById('vendorApiUrl').value.trim();
  const api_key = document.getElementById('vendorApiKey').value.trim();
  const adapter_key = document.getElementById('vendorAdapterKey').value;
  const status = document.getElementById('vendorStatus').value;

  const method = id ? 'PUT' : 'POST';
  const url = id ? `/admin/vendors/${id}` : '/admin/vendors';

  try {
    const res = await fetch(`${ADMIN_API_BASE}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, api_url, api_key, adapter_key, status })
    });
    if (res.ok) {
      alert('Đã lưu thành công');
      closeVendorModal();
      loadVendorsList();
    }
  } catch (err) {
    alert(err.message);
  }
}

function openMappingModal() {
  const modal = document.getElementById('mappingModal');
  document.getElementById('mappingForm').reset();
  
  loadDropdownProducts('mapProdSelect');
  onMapProductSelectChange();
  
  const vSelect = document.getElementById('mapVendorSelect');
  if (vSelect) {
    vSelect.innerHTML = '<option value="">-- Chọn nhà cung cấp --</option>' +
      allVendors.map(v => `<option value="${v.id}">${escapeAdminHtml(v.name)}</option>`).join('');
  }
  
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeMappingModal() {
  document.getElementById('mappingModal').classList.add('opacity-0', 'pointer-events-none');
}

async function saveMapping(e) {
  e.preventDefault();
  const token = adminToken();
  if (!token) return;

  const vendor_id = document.getElementById('mapVendorSelect').value;
  const product_id = document.getElementById('mapProdSelect').value;
  const variant_id = document.getElementById('mapVarSelect').value;
  const vendor_product_code = document.getElementById('mapVendorProductCode').value;
  const priority = document.getElementById('mapPriority').value;
  const enabled = document.getElementById('mapEnabled').checked;

  try {
    const res = await fetch(`${ADMIN_API_BASE}/admin/vendor-products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ vendor_id, product_id, variant_id, vendor_product_code, priority, enabled })
    });
    if (res.ok) {
      alert('Đã cấu hình mapping thành công');
      closeMappingModal();
      loadVendorMappings();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function uploadProductImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const btn = event.target.previousElementSibling;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

  const formData = new FormData();
  formData.append('image', file);

  try {
    const token = adminToken();
    const res = await fetch(`${ADMIN_API_BASE}/upload?folder=products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || 'Lỗi tải ảnh lên');
    }

    // Set URL into the text input
    document.getElementById('prodImage').value = data.url;
    
    // Add to library dropdown if possible
    const select = document.getElementById('prodImageSelect');
    if (select) {
      const opt = document.createElement('option');
      opt.value = data.url;
      opt.text = `[Mới tải lên] ${data.url.split('/').pop()}`;
      select.appendChild(opt);
      select.value = data.url;
    }

    alert('Tải ảnh lên thành công!');
  } catch (err) {
    console.error('Upload product image error:', err);
    alert(err.message || 'Lỗi kết nối khi tải ảnh lên');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    event.target.value = ''; // Reset file input
  }
}

document.addEventListener('DOMContentLoaded', loadAdminDashboard);
