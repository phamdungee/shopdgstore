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
}

function handleHashChange() {
  const hash = window.location.hash.slice(1) || 'overview';
  if (['overview', 'users', 'products', 'security', 'announcement'].includes(hash)) {
    switchAdminTab(hash);
  }
}

window.addEventListener('hashchange', handleHashChange);

// Modal actions
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
    document.getElementById('prodVendorId').value = prod.vendor_id || '';
    document.getElementById('prodVendorProductCode').value = prod.vendor_product_code || '';
    document.getElementById('prodCostPrice').value = numberOrEmpty(prod.cost_price);
    document.getElementById('prodStock').value = numberOrEmpty(prod.stock);
    
    // Select image in dropdown if exists
    if (select && prod.image) {
      select.value = prod.image;
    }
    
    // Render variants
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
    price: arguments[1],
    provider_service_id: arguments[2]
  };
  const apiCode = data.vendor_product_code || data.provider_service_id || '';
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input class="sk-input var-name" required placeholder="Tên gói (Ví dụ: 1 tháng)" value="${escapeAdminHtml(data.name || '')}"/>
    <input class="sk-input var-price" type="number" min="0" step="1" required placeholder="Giá bán" value="${numberOrEmpty(data.price)}"/>
    <input class="sk-input var-code" placeholder="Mã API gói" value="${escapeAdminHtml(apiCode)}"/>
    <input class="sk-input var-cost" type="number" min="0" step="1" placeholder="Giá vốn" value="${numberOrEmpty(data.cost_price ?? data.costPrice)}"/>
    <input class="sk-input var-stock" type="number" min="0" step="1" placeholder="Kho" value="${numberOrEmpty(data.stock)}"/>
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
    const stock = parseIntOrNull(row.querySelector('.var-stock').value);
    
    if (name && price >= 0) {
      variants.push({
        name,
        price,
        vendor_product_code: apiCode,
        cost_price: costPrice,
        stock: stock === null ? 0 : stock
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
  const vendorId = parseIntOrNull(document.getElementById('prodVendorId').value);
  const vendorProductCode = document.getElementById('prodVendorProductCode').value.trim();
  const costPrice = parseFloatOrZero(document.getElementById('prodCostPrice').value);
  const stockValue = parseIntOrNull(document.getElementById('prodStock').value);
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
    vendor_id: vendorId,
    vendor_product_code: vendorProductCode || null,
    cost_price: costPrice,
    stock: stockValue,
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

document.addEventListener('DOMContentLoaded', loadAdminDashboard);
