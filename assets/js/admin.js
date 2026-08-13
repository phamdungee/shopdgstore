// assets/js/admin.js
// Dashboard riêng cho tài khoản admin.

const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const ADMIN_API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (
  (window.location.protocol === 'file:' || isLocalHost)
    ? 'http://localhost:4000/api'
    : '/api'
);
let adminUsers = [];
let adminLoginLogs = [];
let adminOrders = [];
let adminOrderAnalytics = { statuses: {}, daily: [] };
let adminUserAnalytics = { usersDaily: [] };
let adminRevenueChart = null;
let adminOrderStatusChart = null;
let adminUserChart = null;
const ADMIN_SYNC_INTERVAL_MS = 30000;
let adminSyncPromise = null;
let adminSyncTimer = null;
let adminLastSyncAt = null;
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

function applyAdminTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem('dg-admin-theme', normalized);
  const icon = document.querySelector('#adminThemeToggle i');
  if (icon) {
    icon.className = normalized === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
  const button = document.getElementById('adminThemeToggle');
  if (button) button.setAttribute('aria-pressed', String(normalized === 'dark'));
}

function toggleAdminTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyAdminTheme(next);
  renderAdminCharts();
}

function initializeAdminTheme() {
  const saved = localStorage.getItem('dg-admin-theme');
  const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyAdminTheme(saved || preferred);
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
  let url = image;
  if (!/^(https?:|\/)/i.test(url)) {
    url = `/${url}`;
  }
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const isNotServerPort = window.location.port !== '3000';
  const isLocalDev = window.location.protocol === 'file:' || (isLocalHost && isNotServerPort);
  if (isLocalDev && !/^https?:/i.test(url)) {
    url = `http://localhost:3000${url}`;
  }
  return encodeURI(url);
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

  // Collect unique categories from existing products
  const existingCats = new Set();
  if (Array.isArray(adminProducts)) {
    adminProducts.forEach(p => {
      if (p.cat) {
        existingCats.add(p.cat.trim());
      }
    });
  }

  // Combine defaults and existing ones
  const categories = [...ADMIN_PRODUCT_CATEGORIES];
  existingCats.forEach(cat => {
    if (!categories.some(c => c.value.toLowerCase() === cat.toLowerCase())) {
      categories.push({ value: cat, label: cat });
    }
  });

  // If selectedValue is not in categories and is not empty, add it to list
  if (selectedValue && !categories.some(c => c.value.toLowerCase() === selectedValue.trim().toLowerCase())) {
    categories.push({ value: selectedValue.trim(), label: selectedValue.trim() });
  }

  select.innerHTML = categories
    .map(category => `<option value="${escapeAdminHtml(category.value)}">${escapeAdminHtml(category.label)}</option>`)
    .join('');

  if (selectedValue) {
    select.value = selectedValue;
  } else if (categories.length > 0) {
    select.value = categories[0].value;
  }
}

function promptAddCategory() {
  const select = document.getElementById('prodCat');
  if (!select) return;

  const name = prompt('Nhập tên danh mục mới:');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  // Check if it already exists
  let exists = false;
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].value.toLowerCase() === trimmed.toLowerCase()) {
      select.selectedIndex = i;
      exists = true;
      break;
    }
  }

  if (!exists) {
    const opt = document.createElement('option');
    opt.value = trimmed;
    opt.text = trimmed;
    select.appendChild(opt);
    select.value = trimmed;
  }
}

function promptEditCategory() {
  const select = document.getElementById('prodCat');
  if (!select) return;

  const currentValue = select.value;
  if (!currentValue) {
    alert('Vui lòng chọn một danh mục để chỉnh sửa.');
    return;
  }

  const name = prompt(`Nhập tên mới cho danh mục "${currentValue}":`, currentValue);
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === currentValue) return;

  // Update in select options
  let updated = false;
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].value === currentValue) {
      select.options[i].value = trimmed;
      select.options[i].text = trimmed;
      updated = true;
      break;
    }
  }

  if (updated) {
    select.value = trimmed;
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

async function adminFetch(path, options = {}) {
  const token = adminToken();
  if (!token) {
    window.location.href = 'login.html';
    throw new Error('UNAUTHENTICATED');
  }

  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
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

function setAdminSyncStatus(state, message) {
  const status = document.getElementById('adminSyncStatus');
  const button = document.getElementById('adminSyncButton');

  if (status) {
    status.dataset.state = state;
    status.textContent = message;
  }

  if (button) {
    button.disabled = state === 'syncing';
    button.classList.toggle('is-syncing', state === 'syncing');
  }
}

function formatAdminSyncTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'vừa xong';
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function renderAdminStats(stats) {
  const statTotalUsers = document.getElementById('statTotalUsers');
  if (statTotalUsers) statTotalUsers.innerText = Number(stats.totalUsers || 0).toLocaleString('vi-VN');
  const statActiveUsers = document.getElementById('statActiveUsers');
  if (statActiveUsers) statActiveUsers.innerText = Number(stats.activeUsers || 0).toLocaleString('vi-VN');
  const statAdminUsers = document.getElementById('statAdminUsers');
  if (statAdminUsers) statAdminUsers.innerText = Number(stats.adminUsers || 0).toLocaleString('vi-VN');
  const revenueEl = document.getElementById('statTotalRevenue');
  if (revenueEl) revenueEl.innerText = formatAdminMoney(stats.totalRevenue);
}

const ADMIN_ORDER_STATUS_LABELS = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  refunded: 'Hoàn tiền'
};

function renderAdminOrders() {
  const table = document.getElementById('adminOrdersTable');
  if (!table) return;
  const query = (document.getElementById('adminOrderSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('adminOrderStatusFilter')?.value || '';
  const list = adminOrders.filter(order => {
    const customer = order.customer || {};
    const haystack = `${order.code || ''} ${order.productName || ''} ${order.variantName || ''} ${customer.username || ''} ${customer.email || ''}`.toLowerCase();
    return (!status || order.status === status) && haystack.includes(query);
  });

  table.innerHTML = list.map(order => {
    const customer = order.customer || {};
    const statusLabel = ADMIN_ORDER_STATUS_LABELS[order.status] || order.status || '---';
    return `
      <tr>
        <td><code>${escapeAdminHtml(order.code || order.id || '---')}</code></td>
        <td><b>${escapeAdminHtml(customer.username || 'Khách hàng')}</b><div style="font-size:11px;color:var(--admin-muted)">${escapeAdminHtml(customer.email || '---')}</div></td>
        <td><b>${escapeAdminHtml(order.productName || '---')}</b><div style="font-size:11px;color:var(--admin-muted)">${escapeAdminHtml(order.variantName || '')}</div></td>
        <td>${Number(order.quantity || 0).toLocaleString('vi-VN')}</td>
        <td class="sk-price"><b>${formatAdminMoney(order.totalPrice)}</b></td>
        <td>${formatAdminMoney(order.profit)}</td>
        <td><span class="admin-order-status ${escapeAdminHtml(order.status || '')}">${escapeAdminHtml(statusLabel)}</span></td>
        <td>${formatAdminDate(order.createdAt)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8" class="admin-empty">Không có đơn hàng phù hợp.</td></tr>';
}

function renderAdminOrderStats() {
  const statuses = adminOrderAnalytics.statuses || {};
  const assignments = {
    orderStatPending: statuses.pending,
    orderStatProcessing: statuses.processing,
    orderStatCompleted: statuses.completed,
    orderStatFailed: Number(statuses.failed || 0) + Number(statuses.refunded || 0)
  };
  Object.entries(assignments).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = Number(value || 0).toLocaleString('vi-VN');
  });
}

function renderAdminCharts() {
  if (!window.Chart) {
    console.error('Chart.js không tải được. Kiểm tra Content-Security-Policy hoặc kết nối CDN.');
    ['adminRevenueChart', 'adminUserChart', 'adminOrderStatusChart'].forEach(id => {
      const canvas = document.getElementById(id);
      const frame = canvas?.parentElement;
      if (!canvas || !frame || frame.querySelector('.admin-chart-load-error')) return;
      canvas.hidden = true;
      const message = document.createElement('div');
      message.className = 'admin-chart-load-error admin-empty';
      message.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Không tải được thư viện biểu đồ. Vui lòng tải lại trang.';
      frame.appendChild(message);
    });
    return;
  }
  const daily = Array.isArray(adminOrderAnalytics.daily) ? adminOrderAnalytics.daily : [];
  const statuses = adminOrderAnalytics.statuses || {};
  const isDark = document.documentElement.dataset.theme === 'dark';
  const textColor = isDark ? '#a7b0bc' : '#667085';
  const gridColor = isDark ? '#30363d' : '#e5e7eb';
  const revenueTotal = daily.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const totalElement = document.getElementById('revenueChartTotal');
  if (totalElement) totalElement.textContent = formatAdminMoney(revenueTotal);

  if (adminRevenueChart) adminRevenueChart.destroy();
  const revenueCanvas = document.getElementById('adminRevenueChart');
  if (revenueCanvas) {
    adminRevenueChart = new window.Chart(revenueCanvas, {
      type: 'bar',
      data: {
        labels: daily.map(item => new Date(`${item.date}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
        datasets: [
          { label: 'Doanh thu', data: daily.map(item => Number(item.revenue || 0)), backgroundColor: '#4f7cff', borderRadius: 7, borderSkipped: false },
          { label: 'Lợi nhuận', data: daily.map(item => Number(item.profit || 0)), backgroundColor: '#20a86b', borderRadius: 7, borderSkipped: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { labels: { color: textColor, usePointStyle: true } } },
        scales: {
          x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, callback: value => `${Number(value).toLocaleString('vi-VN')}đ` }, grid: { color: gridColor } }
        }
      }
    });
  }

  if (adminUserChart) adminUserChart.destroy();
  const userCanvas = document.getElementById('adminUserChart');
  const usersDaily = Array.isArray(adminUserAnalytics.usersDaily) ? adminUserAnalytics.usersDaily : [];
  if (userCanvas) {
    adminUserChart = new window.Chart(userCanvas, {
      type: 'bar',
      data: {
        labels: usersDaily.map(item => new Date(`${item.date}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })),
        datasets: [
          { label: 'User mới', data: usersDaily.map(item => Number(item.registrations || 0)), backgroundColor: '#8b5cf6', borderRadius: 7, borderSkipped: false },
          { label: 'Đang hoạt động', data: usersDaily.map(item => Number(item.active || 0)), backgroundColor: '#22b8cf', borderRadius: 7, borderSkipped: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { labels: { color: textColor, usePointStyle: true } } },
        scales: {
          x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } }
        }
      }
    });
  }

  if (adminOrderStatusChart) adminOrderStatusChart.destroy();
  const statusCanvas = document.getElementById('adminOrderStatusChart');
  if (statusCanvas) {
    adminOrderStatusChart = new window.Chart(statusCanvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(ADMIN_ORDER_STATUS_LABELS).map(key => ADMIN_ORDER_STATUS_LABELS[key]),
        datasets: [{ data: Object.keys(ADMIN_ORDER_STATUS_LABELS).map(key => Number(statuses[key] || 0)), backgroundColor: ['#f0aa55', '#7aa2ff', '#62c981', '#ff8585', '#a78bfa'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { color: textColor, usePointStyle: true } } } }
    });
  }
}

async function loadAdminOrders() {
  const data = await adminFetch('/admin/orders');
  adminOrders = data.orders || [];
  adminOrderAnalytics = data.analytics || { statuses: {}, daily: [] };
  renderAdminOrders();
  renderAdminOrderStats();
  renderAdminCharts();
  return data;
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
    const data = await adminFetch('/admin/products');
    adminProducts = data.products || [];
    renderAdminProducts();
    return data;
  } catch (err) {
    console.error('Error loading products:', err);
    throw err;
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
  } else if (tabId === 'orders') {
    renderAdminOrders();
    renderAdminCharts();
  }
}

function handleHashChange() {
  const hash = window.location.hash.slice(1) || 'overview';
  if (['overview', 'users', 'orders', 'products', 'warehouse', 'vendors', 'security', 'announcement'].includes(hash)) {
    switchAdminTab(hash);
  }
}

window.addEventListener('hashchange', handleHashChange);

function openProductModal(prodId = '') {
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const title = document.getElementById('modalTitle');
  const container = document.getElementById('variantsContainer');
  if (!modal || !form || !container) return;
  
  form.reset();
  container.innerHTML = '';
  populateProductCategoryDropdown();
  
  // Populate images dropdown dynamically
  const select = document.getElementById('prodImageSelect');
  const detailBackgroundSelect = document.getElementById('prodDetailBackgroundSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Chọn ảnh sẵn có --</option>' + 
      adminImages.map(img => `<option value="${escapeAdminHtml(img)}">${escapeAdminHtml(img.split('/').pop())}</option>`).join('');
  }
  if (detailBackgroundSelect) {
    detailBackgroundSelect.innerHTML = '<option value="">-- Chọn ảnh background sẵn có --</option>' +
      adminImages.map(img => `<option value="${escapeAdminHtml(img)}">${escapeAdminHtml(img.split('/').pop())}</option>`).join('');
  }
  
  if (prodId) {
    if (title) title.innerText = 'Chỉnh sửa sản phẩm';
    const prod = adminProducts.find(p => String(p.id) === String(prodId));
    if (!prod) return;
    
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('prodId', prod.id);
    setVal('prodName', prod.name);
    setVal('prodSlug', prod.slug);
    populateProductCategoryDropdown(prod.cat);
    setVal('prodIcon', prod.icon || 'fa-box');
    {
      const rateValue = numberOrEmpty(prod.rate);
      setVal('prodRate', rateValue === '' ? 5.0 : rateValue);
    }
    setVal('prodImage', prod.image || '');
    setVal('prodDetailBackground', prod.detail_background_image || '');
    setVal('prodPrice', numberOrEmpty(prod.price));
    setVal('prodDesc', prod.desc || '');
    setVal('prodLongDesc', prod.long_desc || '');
    setVal('prodDeliveryType', prod.delivery_type || 'hybrid');
    setVal('prodFallbackMode', prod.fallback_mode || 'api_when_out_of_stock');
    setVal('prodDataFormat', prod.data_format || 'mail|pass');
    setVal('prodSampleData', '');
    updateFormatPreview();
    
    if (select && prod.image) {
      select.value = prod.image;
    }
    if (detailBackgroundSelect && prod.detail_background_image) {
      detailBackgroundSelect.value = prod.detail_background_image;
    }
    
    if (prod.variants && prod.variants.length > 0) {
      prod.variants.forEach(v => addVariantRow(v));
    } else {
      addVariantRow();
    }
  } else {
    if (title) title.innerText = 'Thêm sản phẩm mới';
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('prodId', '');
    populateProductCategoryDropdown('netflix');
    setVal('prodDataFormat', 'mail|pass');
    setVal('prodSampleData', '');
    updateFormatPreview();
    addVariantRow();
  }
  
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function autoGenerateSlug() {
  const prodId = document.getElementById('prodId')?.value;
  if (prodId) return; // Không tự sinh slug khi đang chỉnh sửa sản phẩm cũ
  const nameInput = document.getElementById('prodName');
  const slugInput = document.getElementById('prodSlug');
  if (!nameInput || !slugInput) return;
  const val = nameInput.value.trim().toLowerCase();
  slugInput.value = val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function onImageSelectChange() {
  const select = document.getElementById('prodImageSelect');
  const input = document.getElementById('prodImage');
  if (select && input && select.value) {
    input.value = select.value;
  }
}

function onDetailBackgroundSelectChange() {
  const select = document.getElementById('prodDetailBackgroundSelect');
  const input = document.getElementById('prodDetailBackground');
  if (select && input && select.value) {
    input.value = select.value;
  }
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
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
  const detailBackgroundImage = document.getElementById('prodDetailBackground').value.trim();
  const price = parseFloatOrZero(document.getElementById('prodPrice').value);
  const desc = document.getElementById('prodDesc').value.trim();
  const longDesc = document.getElementById('prodLongDesc').value.trim();
  const deliveryType = document.getElementById('prodDeliveryType').value;
  const fallbackMode = document.getElementById('prodFallbackMode').value;
  const dataFormat = document.getElementById('prodDataFormat').value.trim();
  const variants = getVariantsData();

  const body = {
    cat,
    icon,
    slug,
    name,
    desc,
    long_desc: longDesc,
    image,
    detail_background_image: detailBackgroundImage,
    rate,
    price,
    delivery_type: deliveryType,
    fallback_mode: fallbackMode,
    data_format: dataFormat,
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
    await refreshAdminData({ silent: true });
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
    await refreshAdminData({ silent: true });
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

async function refreshAdminData({ silent = false, includeActiveSection = true } = {}) {
  if (adminSyncPromise) {
    try {
      return await adminSyncPromise;
    } catch (err) {
      if (!silent) throw err;
      return null;
    }
  }

  setAdminSyncStatus('syncing', 'Đang đồng bộ database...');

  adminSyncPromise = (async () => {
    const [dashboardData, productsData, ordersData] = await Promise.all([
      adminFetch('/admin/dashboard'),
      adminFetch('/admin/products'),
      adminFetch('/admin/orders').catch(err => {
        console.error('Admin orders sync warning:', err);
        return { orders: [], analytics: { statuses: {}, daily: [] } };
      })
    ]);

    adminUsers = dashboardData.users || [];
    adminUserAnalytics = dashboardData.analytics || { usersDaily: [] };
    adminLoginLogs = dashboardData.loginLogs || [];
    adminProducts = productsData.products || [];
    adminOrders = ordersData.orders || [];
    adminOrderAnalytics = ordersData.analytics || { statuses: {}, daily: [] };

    renderAdminStats(dashboardData.stats || {});
    renderAdminUsers();
    renderOverviewUsers();
    renderAdminLoginLogs();
    renderAdminProducts();
    renderAdminOrders();
    renderAdminOrderStats();
    renderAdminCharts();

    if (includeActiveSection) {
      const activeTab = window.location.hash.slice(1) || 'overview';
      if (activeTab === 'warehouse') {
        await loadWarehouseData();
      } else if (activeTab === 'vendors') {
        await loadVendorsData();
      }
    }

    const serverSyncTime = dashboardData.syncedAt || productsData.syncedAt || ordersData.syncedAt || Date.now();
    adminLastSyncAt = new Date(serverSyncTime);
    setAdminSyncStatus('success', `Đã đồng bộ lúc ${formatAdminSyncTime(adminLastSyncAt)}`);

    return { dashboardData, productsData, ordersData };
  })();

  try {
    return await adminSyncPromise;
  } catch (err) {
    console.error('Admin database sync error:', err);
    setAdminSyncStatus('error', 'Đồng bộ thất bại — bấm để thử lại');
    if (!silent) throw err;
    return null;
  } finally {
    adminSyncPromise = null;
  }
}

async function manualRefreshAdminData() {
  try {
    await refreshAdminData();
  } catch (err) {
    if (!['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      alert(err.message);
    }
  }
}

function startAdminAutoSync() {
  if (adminSyncTimer) clearInterval(adminSyncTimer);
  adminSyncTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      // Keep the current warehouse detail, filters and scroll position intact.
      // Active-section data is refreshed only by an explicit user action.
      refreshAdminData({ silent: true, includeActiveSection: false }).catch(() => {});
    }
  }, ADMIN_SYNC_INTERVAL_MS);
}

async function loadAdminDashboard() {
  try {
    const me = await adminFetch('/me');
    if (me.user?.role !== 'admin') {
      alert('Tài khoản này không có quyền admin.');
      window.location.href = 'index.html';
      return;
    }

    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl) adminNameEl.innerText = me.user.fullName || me.user.username || 'Admin';
    await Promise.all([
      refreshAdminData({ includeActiveSection: false }),
      loadAdminImages(),
      loadAnnouncement()
    ]);
    
    // Setup tab views based on current URL hash
    handleHashChange();
    startAdminAutoSync();
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
      const announceTitleEl = document.getElementById('announceTitle');
      if (announceTitleEl) announceTitleEl.value = data.announcement.title || '';
      const announceContentEl = document.getElementById('announceContent');
      if (announceContentEl) announceContentEl.value = data.announcement.content || '';
      const announceActiveEl = document.getElementById('announceActive');
      if (announceActiveEl) announceActiveEl.checked = !!data.announcement.active;
    }
  } catch (err) {
    console.error('Error loading announcement:', err);
  }
}

async function saveAnnouncement() {
  const token = adminToken();
  if (!token) return;

  const titleEl = document.getElementById('announceTitle');
  const contentEl = document.getElementById('announceContent');
  const activeEl = document.getElementById('announceActive');
  const title = titleEl ? titleEl.value.trim() : '';
  const content = contentEl ? contentEl.value.trim() : '';
  const active = activeEl ? activeEl.checked : false;

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
      const whStatAvailable = document.getElementById('whStatAvailable');
      if (whStatAvailable) whStatAvailable.innerText = res.stats.totalStock;
      const whStatReserved = document.getElementById('whStatReserved');
      if (whStatReserved) whStatReserved.innerText = res.stats.reserved;
      const whStatActiveBatches = document.getElementById('whStatActiveBatches');
      if (whStatActiveBatches) whStatActiveBatches.innerText = res.stats.totalVendors;
      const whStatLowWarning = document.getElementById('whStatLowWarning');
      if (whStatLowWarning) whStatLowWarning.innerText = res.stats.lowStock ? res.stats.lowStock.length : 0;
    }
  } catch (err) {
    console.error('Stats load warning:', err.message);
  }
  
  const activeProductId = selectedWarehouseProductId;
  const activeProductStillExists = activeProductId &&
    adminProducts.some(product => String(product.id) === String(activeProductId));

  if (activeProductStillExists) {
    await openWarehouseProductDetails(activeProductId);
  } else {
    closeWarehouseProductDetails();
  }

  await Promise.all([
    loadInventoryBatches(),
    loadInventoryHistories()
  ]);
}

function switchWarehouseSubTab(tab) {
  document.querySelectorAll('.wh-subtab-view').forEach(view => view.style.display = 'none');
  const targetView = document.getElementById(`wh-${tab}-subtab`);
  if (targetView) targetView.style.display = 'block';
  
  // Active class update
  const btnContainer = document.querySelector('#warehouse-section div[style*="border-bottom"]');
  if (btnContainer) {
    btnContainer.querySelectorAll('.sk-btn').forEach((btn, index) => {
      const active = (tab === 'stock' && index === 0) ||
                     (tab === 'batches' && index === 1) ||
                     (tab === 'history' && index === 2);
      btn.classList.toggle('active', active);
    });
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Đã sao chép thành công!');
  }).catch(err => {
    console.error('Cannot copy:', err);
  });
}

let selectedWarehouseProductId = null;

async function openWarehouseProductDetails(productId) {
  selectedWarehouseProductId = productId;
  const prod = adminProducts.find(p => String(p.id) === String(productId));
  if (!prod) return;

  const nameEl = document.getElementById('whDetailsProductName');
  if (nameEl) nameEl.innerText = prod.name;
  
  const slugEl = document.getElementById('whDetailsProductSlug');
  if (slugEl) slugEl.innerText = prod.slug;
  
  const importBtn = document.getElementById('whDetailsImportBtn');
  if (importBtn) {
    importBtn.onclick = () => {
      openImportStockModal(prod.id);
    };
  }

  const variants = Array.isArray(prod.variants) ? prod.variants : [];

  // Populate variant filter dropdown from product data
  const varFilterSelect = document.getElementById('whDetailsFilterVariant');
  if (varFilterSelect) {
    varFilterSelect.innerHTML = '<option value="">-- Tất cả phân loại gói --</option>' +
      variants.map(v => `<option value="${v.id}">${escapeAdminHtml(v.name)}</option>`).join('');
  }

  const prodView = document.getElementById('wh-stock-products-view');
  if (prodView) prodView.style.display = 'none';
  
  const detailsView = document.getElementById('wh-stock-details-view');
  if (detailsView) detailsView.style.display = 'block';

  // Show loading in summary bar
  const summaryEl = document.getElementById('whDetailsVariantsSummary');
  if (summaryEl) summaryEl.innerHTML = '<span style="color: var(--muted); font-size: 12px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải số liệu thực từ database...</span>';

  // Fetch real stock counts from DB
  try {
    const stockRes = await adminFetch(`/admin/inventory/stock-summary?product_id=${productId}`);
    if (summaryEl) {
      if (stockRes.ok && stockRes.variantSummary && stockRes.variantSummary.length > 0) {
        summaryEl.innerHTML = stockRes.variantSummary.map(vs => {
          const isApi = vs.delivery_type === 'api';
          const availDisplay = isApi ? '∞ (API)' : vs.available.toLocaleString('vi-VN');
          return `
            <div style="padding: 6px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; font-size: 12px;">
              <b style="color: var(--brand-light);">${escapeAdminHtml(vs.variant_name || 'Không có gói')}:</b>
              <span style="font-weight: 800; color: #10b981;"><i class="fa-solid fa-box"></i> Còn ${availDisplay}</span>
              <span style="font-weight: 700; color: #f59e0b; margin-left: 8px;"><i class="fa-solid fa-clock"></i> Giữ ${vs.reserved}</span>
              <span style="font-weight: 700; color: #ef4444; margin-left: 8px;"><i class="fa-solid fa-circle-check"></i> Đã bán ${vs.sold}</span>
            </div>
          `;
        }).join('');
      } else if (variants.length === 0) {
        summaryEl.innerHTML = '<span style="color: var(--muted); font-size: 12px; font-style: italic;">Sản phẩm này chưa cấu hình phân loại gói.</span>';
      } else {
        summaryEl.innerHTML = '<span style="color: var(--muted); font-size: 12px; font-style: italic;">Chưa có tài khoản nào trong kho của sản phẩm này.</span>';
      }
    }
  } catch (err) {
    if (summaryEl) summaryEl.innerHTML = `<span style="color: var(--danger); font-size: 12px;">Lỗi tải số liệu: ${escapeAdminHtml(err.message)}</span>`;
  }

  loadWarehouseProductItems();
}

function closeWarehouseProductDetails() {
  selectedWarehouseProductId = null;
  const detailsView = document.getElementById('wh-stock-details-view');
  if (detailsView) detailsView.style.display = 'none';
  
  const prodView = document.getElementById('wh-stock-products-view');
  if (prodView) prodView.style.display = 'block';
  
  renderWarehouseProducts();
}

async function loadWarehouseProductItems() {
  if (!selectedWarehouseProductId) return;
  
  const varId = document.getElementById('whDetailsFilterVariant')?.value || '';
  const status = document.getElementById('whDetailsFilterStatus')?.value || '';
  const query = (document.getElementById('whDetailsSearch')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('whDetailsItemsTable');
  if (!tbody) return;
  
  try {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...</td></tr>';
    
    const params = new URLSearchParams({ product_id: selectedWarehouseProductId });
    if (varId) params.set('variant_id', varId);
    if (status) params.set('status', status);
    const res = await adminFetch(`/admin/inventory/items?${params.toString()}`);
    const items = res.items || [];
    
    const filtered = items.filter(item => {
      const rawContent = JSON.stringify(item.content).toLowerCase();
      return rawContent.includes(query) || String(item.serial || '').toLowerCase().includes(query);
    });

    tbody.innerHTML = filtered.map(item => {
      let contentHtml = '';
      let rawText = '';
      if (item.content && typeof item.content === 'object') {
        const entries = Object.entries(item.content);
        if (entries.length > 0) {
          contentHtml = entries
            .map(([k, v]) => `<span class="sk-content-pill"><b>${escapeAdminHtml(k)}:</b> ${escapeAdminHtml(String(v))}</span>`)
            .join(' ');
          rawText = entries.map(([k, v]) => String(v)).join('|');
        } else {
          contentHtml = `<code>{}</code>`;
          rawText = '{}';
        }
      } else {
        const textVal = String(item.content || '');
        contentHtml = `<code>${escapeAdminHtml(textVal)}</code>`;
        rawText = textVal;
      }
      
      const escapedRawText = rawText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const copyButton = `<button class="sk-btn-copy" onclick="copyToClipboard('${escapedRawText}')" title="Sao chép tài khoản"><i class="fa-regular fa-copy"></i></button>`;

      const statusMeta = {
        available: { label: 'Còn trong kho', icon: 'fa-box' },
        reserved: { label: 'Đang giữ', icon: 'fa-clock' },
        sold: { label: 'Đã bán', icon: 'fa-circle-check' }
      }[item.status] || { label: item.status || 'Không xác định', icon: 'fa-circle-question' };
      const orderText = item.sold_order_id
        ? `<span style="font-size:11px; font-weight:700;">#${escapeAdminHtml(String(item.sold_order_id).slice(0, 8))}</span>`
        : '<span style="color:var(--muted)">Chưa bán</span>';

      return `
        <tr>
          <td><span style="font-size:13px; font-weight:600; color:var(--brand-light)">${escapeAdminHtml(item.product_variants?.name || 'Gói')}</span></td>
          <td>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <div style="display:flex; flex-wrap:wrap; gap:4px;">${contentHtml}</div>
              ${copyButton}
            </div>
          </td>
          <td><span class="badge-status ${escapeAdminHtml(item.status)}"><i class="fa-solid ${statusMeta.icon}" style="margin-right:5px"></i>${escapeAdminHtml(statusMeta.label)}</span></td>
          <td>${formatAdminMoney(item.cost_price)}</td>
          <td>${orderText}</td>
          <td>${formatAdminDate(item.created_at)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" style="text-align:center">Không tìm thấy tài khoản nào trong kho của sản phẩm này.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger); text-align:center">Lỗi: ${escapeAdminHtml(err.message)}</td></tr>`;
  }
}

async function renderWarehouseProducts() {
  const tbody = document.getElementById('whProductsTableBody');
  const grid = document.getElementById('whProductsGrid');
  if (!tbody && !grid) return;
  
  const query = (document.getElementById('whProductSearch')?.value || '').trim().toLowerCase();
  
  const filtered = adminProducts.filter(prod => {
    const haystack = `${prod.name || ''} ${prod.slug || ''} ${prod.cat || ''}`.toLowerCase();
    return haystack.includes(query);
  });
  
  // Show loading state first
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 36px; color: var(--muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 22px; display: block; margin-bottom: 8px;"></i> Đang tải dữ liệu tồn kho từ database...</td></tr>`;
  }
  if (grid) {
    grid.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--muted); grid-column: 1 / -1;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; display: block; margin-bottom: 8px;"></i> Đang tải dữ liệu kho từ database...</div>`;
  }

  // Fetch an authoritative aggregate from the database.
  const stockMap = {};
  let stockSummaryLoaded = false;
  try {
    const summaryRes = await adminFetch('/admin/inventory/stock-summary');
    if (summaryRes.ok && Array.isArray(summaryRes.productSummary)) {
      stockSummaryLoaded = true;

      for (const product of adminProducts) {
        stockMap[String(product.id)] = { available: 0, reserved: 0, sold: 0, total: 0 };
      }

      for (const summary of summaryRes.productSummary) {
        stockMap[String(summary.product_id)] = {
          available: Number(summary.available || 0),
          reserved: Number(summary.reserved || 0),
          sold: Number(summary.sold || 0),
          total: Number(summary.total || 0)
        };
      }
    }
  } catch (err) {
    console.warn('Could not load real stock data:', err.message);
  }
  
  if (filtered.length === 0) {
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--muted);"><i class="fa-solid fa-folder-open" style="font-size: 22px; display: block; margin-bottom: 8px;"></i> Không tìm thấy sản phẩm nào.</td></tr>';
    }
    if (grid) {
      grid.innerHTML = '<div style="text-align: center; padding: 32px; color: var(--muted); grid-column: 1 / -1;"><i class="fa-solid fa-folder-open" style="font-size: 24px; display: block; margin-bottom: 8px;"></i> Không tìm thấy sản phẩm nào.</div>';
    }
    return;
  }

  if (tbody) {
    tbody.innerHTML = filtered.map(prod => {
      const variants = Array.isArray(prod.variants) ? prod.variants : [];
      const iconClass = safeAdminIconClass(prod.icon);
      const isApiOnly = prod.delivery_type === 'api' || (variants.length > 0 && variants.every(v => v.delivery_type === 'api'));
      
      // Use real DB stock if available, otherwise fall back to stock_cache
      const realStock = stockMap[String(prod.id)];
      let stockDisplay;
      let reservedDisplay = 0;
      let soldDisplay = 0;
      let stockColor = '#10b981';
      let stockBg = 'rgba(16, 185, 129, 0.12)';

      if (isApiOnly) {
        stockDisplay = '∞ (API)';
        stockColor = '#38bdf8';
        stockBg = 'rgba(56, 189, 248, 0.12)';
      } else if (stockSummaryLoaded && realStock) {
        stockDisplay = realStock.available.toLocaleString('vi-VN');
        reservedDisplay = realStock.reserved;
        soldDisplay = realStock.sold;
        if (realStock.available === 0) {
          stockColor = '#ef4444';
          stockBg = 'rgba(239, 68, 68, 0.12)';
        }
      } else {
        // Fallback to stock_cache sum
        let totalFromCache = 0;
        variants.forEach(v => { if (v.delivery_type !== 'api') totalFromCache += Number(v.stock || 0); });
        if (variants.length === 0) totalFromCache = prod.stock || 0;
        stockDisplay = totalFromCache.toLocaleString('vi-VN');
        if (totalFromCache === 0) {
          stockColor = '#ef4444';
          stockBg = 'rgba(239, 68, 68, 0.12)';
        }
      }
      
      const imageSrc = adminImageSrc(prod.image);
      const imgHtml = imageSrc
        ? `<img src="${escapeAdminHtml(imageSrc)}" alt="${escapeAdminHtml(prod.name || 'Sản phẩm')}" data-fallback-icon="${escapeAdminHtml(iconClass)}" class="sk-prod-avatar" style="width:38px; height:38px; border-radius:8px; object-fit:cover; flex-shrink:0;"/>`
        : adminProductIconFallback(iconClass).replace(/style="[^"]*"/, 'class="sk-prod-avatar" style="width:38px; height:38px; border-radius:8px; font-size:18px; flex-shrink:0;"');

      const deliveryTypeLabel = {
        hybrid: '<span class="sk-badge" style="background:rgba(99, 102, 241, 0.15); color:#818cf8; font-size:11px;"><i class="fa-solid fa-shuffle"></i> Hybrid</span>',
        inventory: '<span class="sk-badge" style="background:rgba(16, 185, 129, 0.15); color:#10b981; font-size:11px;"><i class="fa-solid fa-box"></i> Kho hàng</span>',
        api: '<span class="sk-badge" style="background:rgba(56, 189, 248, 0.15); color:#38bdf8; font-size:11px;"><i class="fa-solid fa-cloud"></i> API NCC</span>'
      }[prod.delivery_type] || `<span class="sk-badge">${escapeAdminHtml(prod.delivery_type || 'auto')}</span>`;

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:12px;">
              ${imgHtml}
              <div>
                <div style="font-weight:700; font-size:14px; color:var(--text-bright); line-height:1.3;">${escapeAdminHtml(prod.name)}</div>
                <div style="display:flex; align-items:center; gap:6px; margin-top:3px;">
                  <span class="sk-badge ${escapeAdminHtml(prod.cat)}" style="font-size:9px; padding:1px 6px; text-transform:uppercase;">${escapeAdminHtml(prod.cat)}</span>
                  <span style="font-size:11px; color:var(--muted); font-family:monospace;">${escapeAdminHtml(prod.slug)}</span>
                </div>
              </div>
            </div>
          </td>
          <td style="text-align:center;">${deliveryTypeLabel}</td>
          <td style="text-align:center;">
            <span style="display:inline-flex; align-items:center; gap:4px; font-weight:700; font-size:12px; color:var(--brand-light); background:rgba(255,255,255,0.04); padding:3px 8px; border-radius:6px;">
              <i class="fa-solid fa-tags"></i> ${variants.length} gói
            </span>
          </td>
          <td style="text-align:center;">
            <span style="display:inline-block; min-width:65px; padding:4px 10px; border-radius:99px; font-size:12.5px; font-weight:800; background:${stockBg}; color:${stockColor};">
              <i class="fa-solid fa-box"></i> ${stockDisplay}
            </span>
          </td>
          <td style="text-align:center;">
            <span style="display:inline-block; min-width:45px; padding:4px 8px; border-radius:99px; font-size:12px; font-weight:700; background:rgba(245, 158, 11, 0.12); color:#f59e0b;">
              <i class="fa-solid fa-clock"></i> ${reservedDisplay.toLocaleString('vi-VN')}
            </span>
          </td>
          <td style="text-align:center;">
            <span style="display:inline-block; min-width:45px; padding:4px 8px; border-radius:99px; font-size:12px; font-weight:700; background:rgba(239, 68, 68, 0.12); color:#f87171;">
              <i class="fa-solid fa-circle-check"></i> ${soldDisplay.toLocaleString('vi-VN')}
            </span>
          </td>
          <td style="text-align:right;">
            <div style="display:flex; justify-content:flex-end; gap:6px;">
              <button class="sk-btn sk-btn-soft" onclick="openWarehouseProductDetails('${prod.id}')" style="padding:5px 10px; font-size:12px; font-weight:700;" title="Xem danh sách tài khoản trong kho">
                <i class="fa-solid fa-folder-open"></i> Chi tiết
              </button>
              <button class="sk-btn sk-btn-primary" onclick="openImportStockModal('${prod.id}')" style="padding:5px 10px; font-size:12px; font-weight:700;" title="Nhập thêm tài khoản/key vào kho">
                <i class="fa-solid fa-plus"></i> Nhập kho
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('img.sk-prod-avatar').forEach(image => {
      image.addEventListener('error', () => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = adminProductIconFallback(image.dataset.fallbackIcon);
        const fallbackNode = wrapper.firstElementChild;
        fallbackNode.classList.add('sk-prod-avatar');
        fallbackNode.style.width = '38px';
        fallbackNode.style.height = '38px';
        fallbackNode.style.borderRadius = '8px';
        fallbackNode.style.fontSize = '18px';
        fallbackNode.style.flexShrink = '0';
        image.replaceWith(fallbackNode);
      }, { once: true });
    });
  }

  if (grid) {
    grid.innerHTML = filtered.map(prod => {
      const variants = Array.isArray(prod.variants) ? prod.variants : [];
      const iconClass = safeAdminIconClass(prod.icon);
      const isApiOnly = prod.delivery_type === 'api' || (variants.length > 0 && variants.every(v => v.delivery_type === 'api'));
      
      // Use real DB stock if available, otherwise fall back to stock_cache
      const realStock = stockMap[String(prod.id)];
      let stockDisplay;
      let reservedDisplay = 0;
      let soldDisplay = 0;
      if (isApiOnly) {
        stockDisplay = '∞ (API)';
      } else if (stockSummaryLoaded && realStock) {
        stockDisplay = realStock.available.toLocaleString('vi-VN');
        reservedDisplay = realStock.reserved;
        soldDisplay = realStock.sold;
      } else {
        // Fallback to stock_cache sum
        let totalFromCache = 0;
        variants.forEach(v => { if (v.delivery_type !== 'api') totalFromCache += Number(v.stock || 0); });
        if (variants.length === 0) totalFromCache = prod.stock || 0;
        stockDisplay = totalFromCache.toLocaleString('vi-VN');
      }
      
      const imageSrc = adminImageSrc(prod.image);
      const imgHtml = imageSrc
        ? `<img src="${escapeAdminHtml(imageSrc)}" alt="${escapeAdminHtml(prod.name || 'Sản phẩm')}" data-fallback-icon="${escapeAdminHtml(iconClass)}" class="sk-prod-avatar" style="width:40px; height:40px; margin-right:0;"/>`
        : adminProductIconFallback(iconClass).replace(/style="[^"]*"/, 'class="sk-prod-avatar" style="width:40px; height:40px; font-size:18px; margin-right:0;"');

      return `
        <div class="sk-product-admin-card" style="margin: 0; display: flex; flex-direction: column; justify-content: space-between; min-height: 180px;">
          <div>
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
              ${imgHtml}
              <div>
                <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: var(--text-bright);">${escapeAdminHtml(prod.name)}</h3>
                <span class="sk-badge ${escapeAdminHtml(prod.cat)}" style="font-size: 9px; padding: 2px 6px; text-transform: uppercase;">${escapeAdminHtml(prod.cat)}</span>
              </div>
            </div>
            <div style="background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 6px; margin-bottom: 15px; font-size: 12px; border: 1px solid rgba(255,255,255,0.04);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: var(--muted);">Còn trong kho:</span>
                <b style="color: #10b981;">${stockDisplay}</b>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: var(--muted);">Đang giữ:</span>
                <b style="color: #f59e0b;">${reservedDisplay.toLocaleString('vi-VN')}</b>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: var(--muted);">Đã bán:</span>
                <b style="color: #ef4444;">${soldDisplay.toLocaleString('vi-VN')}</b>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted);">Phân loại gói:</span>
                <span style="font-weight:600; color:var(--brand-light);">${variants.length} gói</span>
              </div>
            </div>
          </div>
          <button class="sk-btn sk-btn-soft" onclick="openWarehouseProductDetails('${prod.id}')" style="width: 100%; justify-content: center; font-size: 12px; height: 32px; font-weight: 700;">
            <i class="fa-solid fa-folder-open"></i> Xem chi tiết kho
          </button>
        </div>
      `;
    }).join('');
    
    grid.querySelectorAll('img.sk-prod-avatar').forEach(image => {
      image.addEventListener('error', () => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = adminProductIconFallback(image.dataset.fallbackIcon);
        const fallbackNode = wrapper.firstElementChild;
        fallbackNode.classList.add('sk-prod-avatar');
        fallbackNode.style.width = '40px';
        fallbackNode.style.height = '40px';
        fallbackNode.style.fontSize = '18px';
        fallbackNode.style.marginRight = '0';
        image.replaceWith(fallbackNode);
      }, { once: true });
    });
  }
}

function switchVendorsSubTab(tab) {
  document.querySelectorAll('.vd-subtab-view').forEach(view => view.style.display = 'none');
  const targetVdView = document.getElementById(`vd-${tab}-subtab`);
  if (targetVdView) targetVdView.style.display = 'block';
  
  const btnContainer = document.querySelector('#vendors-section div[style*="border-bottom"]');
  if (btnContainer) {
    btnContainer.querySelectorAll('.sk-btn').forEach((btn, index) => {
      const active = (tab === 'list' && index === 0) || (tab === 'mapping' && index === 1) || (tab === 'logs' && index === 2);
      btn.classList.toggle('active', active);
    });
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

function inventoryStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();
  return {
    available: { label: 'Còn trong kho', icon: 'fa-box', className: 'available' },
    reserved: { label: 'Đang giữ', icon: 'fa-clock', className: 'reserved' },
    sold: { label: 'Đã bán', icon: 'fa-circle-check', className: 'sold' }
  }[normalized] || {
    label: status || 'Chưa xác định',
    icon: 'fa-circle-question',
    className: 'warning'
  };
}

function inventoryActionMeta(action) {
  const normalized = String(action || '').toLowerCase();
  return {
    import: { label: 'Nhập kho', icon: 'fa-file-import', color: '#10b981' },
    imported: { label: 'Nhập kho', icon: 'fa-file-import', color: '#10b981' },
    reserve: { label: 'Giữ cho đơn', icon: 'fa-clock', color: '#f59e0b' },
    reserved: { label: 'Giữ cho đơn', icon: 'fa-clock', color: '#f59e0b' },
    sell: { label: 'Xuất bán', icon: 'fa-cart-shopping', color: '#ef4444' },
    sold: { label: 'Xuất bán', icon: 'fa-cart-shopping', color: '#ef4444' },
    release: { label: 'Trả lại kho', icon: 'fa-rotate-left', color: '#3b82f6' },
    released: { label: 'Trả lại kho', icon: 'fa-rotate-left', color: '#3b82f6' },
    update: { label: 'Cập nhật', icon: 'fa-pen', color: '#8b5cf6' },
    delete: { label: 'Xóa khỏi kho', icon: 'fa-trash', color: '#ef4444' }
  }[normalized] || {
    label: action || 'Thay đổi',
    icon: 'fa-pen-to-square',
    color: 'var(--muted)'
  };
}

function renderInventorySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return `<span style="color:var(--muted)">${escapeAdminHtml(snapshot || 'Không có dữ liệu')}</span>`;
  }

  const entries = Object.entries(snapshot);
  if (!entries.length) return '<span style="color:var(--muted)">Không có dữ liệu</span>';
  return `<div style="display:flex; flex-wrap:wrap; gap:5px;">${entries.map(([key, value]) =>
    `<span class="sk-content-pill"><b>${escapeAdminHtml(key)}:</b> ${escapeAdminHtml(String(value ?? ''))}</span>`
  ).join('')}</div>`;
}

async function loadInventoryHistories() {
  const tbody = document.getElementById('whHistoryTable');
  if (!tbody) return;
  try {
    const res = await adminFetch('/admin/inventory/histories');
    tbody.innerHTML = (res.histories || []).map(h => {
      const action = inventoryActionMeta(h.action);
      const before = inventoryStatusMeta(h.status_before);
      const after = inventoryStatusMeta(h.status_after);
      const shortId = String(h.id || '').slice(0, 8);
      return `
        <tr>
          <td><code title="${escapeAdminHtml(h.id || '')}">#${escapeAdminHtml(shortId || '---')}</code></td>
          <td><span class="sk-badge" style="color:${action.color}; border-color:color-mix(in srgb, ${action.color} 30%, transparent);"><i class="fa-solid ${action.icon}" style="margin-right:5px"></i>${escapeAdminHtml(action.label)}</span></td>
          <td><b>${escapeAdminHtml(h.product_name)}</b><br><span style="font-size:11px; color:var(--muted)">${escapeAdminHtml(h.variant_name)}</span></td>
          <td><span class="badge-status ${before.className}"><i class="fa-solid ${before.icon}" style="margin-right:5px"></i>${escapeAdminHtml(before.label)}</span></td>
          <td><span class="badge-status ${after.className}"><i class="fa-solid ${after.icon}" style="margin-right:5px"></i>${escapeAdminHtml(after.label)}</span></td>
          <td>${renderInventorySnapshot(h.content_snapshot)}</td>
          <td><b>${formatAdminDate(h.created_at)}</b></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" style="text-align:center; color:var(--muted)">Chưa có thay đổi kho nào được ghi nhận.</td></tr>';
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
  const product_id = document.getElementById('importProdSelect').value;
  const duplicate_policy = document.querySelector('input[name="importDupPolicy"]:checked')?.value || 'skip';
  
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
      body: JSON.stringify({ content_raw: content, product_id, duplicate_policy })
    });
    
    const data = await res.json();
    if (data.ok && data.report) {
      if (previewCard) previewCard.style.display = 'block';
      const previewTotalEl = document.getElementById('previewTotal');
      if (previewTotalEl) previewTotalEl.innerText = data.report.totalLines;
      const previewValidEl = document.getElementById('previewValid');
      if (previewValidEl) previewValidEl.innerText = data.report.validCount;
      const previewDupDbEl = document.getElementById('previewDupDb');
      if (previewDupDbEl) {
        if (duplicate_policy === 'replace') {
          previewDupDbEl.innerText = `${data.report.replaceInDbCount || 0} (Ghi đè)`;
          previewDupDbEl.parentElement.style.color = '#38bdf8';
        } else {
          previewDupDbEl.innerText = data.report.duplicateInDbCount || 0;
          previewDupDbEl.parentElement.style.color = 'var(--danger)';
        }
      }
      const previewDupFileEl = document.getElementById('previewDupFile');
      if (previewDupFileEl) previewDupFileEl.innerText = data.report.duplicateInFileCount;

      const tableBody = document.getElementById('importPreviewTableBody');
      if (tableBody) {
        let tbodyHtml = '';
        const lines = data.report.lines || [];
        lines.forEach(line => {
          let dot = '🔴';
          let textColor = '#ef4444';
          let badgeText = 'Lỗi';
          let badgeBg = 'rgba(239, 68, 68, 0.15)';
          
          if (line.status === 'success') {
            dot = '🟢';
            textColor = '#10b981';
            badgeText = 'Hợp lệ';
            badgeBg = 'rgba(16, 185, 129, 0.15)';
          } else if (line.status === 'replace_ready') {
            dot = '🔄';
            textColor = '#38bdf8';
            badgeText = 'Ghi đè (Replace)';
            badgeBg = 'rgba(56, 189, 248, 0.15)';
          } else if (line.status === 'warning_extra') {
            dot = '🟡';
            textColor = 'var(--warning)';
            badgeText = 'Thừa trường';
            badgeBg = 'rgba(245, 158, 11, 0.15)';
          } else if (line.status === 'warning_missing') {
            dot = '🟠';
            textColor = '#f97316';
            badgeText = 'Thiếu trường';
            badgeBg = 'rgba(249, 115, 22, 0.15)';
          } else if (line.status === 'duplicate_file') {
            dot = '🟡';
            textColor = 'var(--warning)';
            badgeText = 'Trùng tệp';
            badgeBg = 'rgba(245, 158, 11, 0.15)';
          } else if (line.status === 'duplicate_db') {
            dot = '🔴';
            textColor = 'var(--danger)';
            badgeText = 'Trùng DB (Bỏ qua)';
            badgeBg = 'rgba(239, 68, 68, 0.15)';
          }
          
          tbodyHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
              <td style="padding: 7px 10px; color: var(--muted); text-align: center; font-weight: 700;">#${line.lineNum}</td>
              <td style="padding: 7px 10px; text-align: center;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; background: ${badgeBg}; color: ${textColor};">
                  ${dot} ${badgeText}
                </span>
              </td>
              <td style="padding: 7px 10px; color: ${textColor}; word-break: break-all;">
                <span style="font-weight: 600;">${escapeAdminHtml(line.message)}</span>
                <span style="display:block; font-size:11px; color:var(--muted); font-family:monospace; margin-top:2px; background: rgba(0,0,0,0.25); padding: 2px 6px; border-radius: 4px;">
                  ${escapeAdminHtml(line.text.substring(0, 80))}${line.text.length > 80 ? '...' : ''}
                </span>
              </td>
            </tr>
          `;
        });
        
        if (lines.length === 0) {
          tbodyHtml = '<tr><td colspan="3" style="text-align:center; padding:16px; color:var(--muted);">Chưa có dữ liệu phân tích</td></tr>';
        }
        tableBody.innerHTML = tbodyHtml;
      }

      if (btn) {
        const importableCount = (data.report.lines || []).filter(l => ['success', 'replace_ready', 'warning_extra', 'warning_missing'].includes(l.status)).length;
        btn.disabled = importableCount === 0;
      }
    }
  } catch (err) {
    console.error('Preview error:', err);
  }
}

// Modals toggling
function openImportStockModal(productId = '', variantId = '') {
  const modal = document.getElementById('importStockModal');
  if (!modal) return;
  const importStockForm = document.getElementById('importStockForm');
  if (importStockForm) importStockForm.reset();
  const importPreviewCard = document.getElementById('importPreviewCard');
  if (importPreviewCard) importPreviewCard.style.display = 'none';
  const btnSubmitImport = document.getElementById('btnSubmitImport');
  if (btnSubmitImport) btnSubmitImport.disabled = true;
  
  loadDropdownProducts('importProdSelect');
  
  if (productId) {
    const importProdSelect = document.getElementById('importProdSelect');
    if (importProdSelect) importProdSelect.value = productId;
    onImportProductSelectChange();
    if (variantId) {
      const importVarSelect = document.getElementById('importVarSelect');
      if (importVarSelect) importVarSelect.value = variantId;
    }
  } else {
    onImportProductSelectChange();
  }
  setupImportDragDrop();

  // Re-run preview if policy radio changes
  document.querySelectorAll('input[name="importDupPolicy"]').forEach(radio => {
    radio.onchange = () => triggerImportPreview();
  });
  
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeImportStockModal() {
  const importStockModal = document.getElementById('importStockModal');
  if (importStockModal) importStockModal.classList.add('opacity-0', 'pointer-events-none');
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

  const submitBtn = document.getElementById('btnSubmitImport');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý import...';
  }

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
      await refreshAdminData({ silent: true });
    } else {
      throw new Error(data.message || 'Lỗi nhập hàng');
    }
  } catch (err) {
    alert(err.message);
  }
}

function openVendorModal(id = '') {
  const modal = document.getElementById('vendorModal');
  if (!modal) return;
  const vendorForm = document.getElementById('vendorForm');
  if (vendorForm) vendorForm.reset();
  const vendorIdEl = document.getElementById('vendorId');
  if (vendorIdEl) vendorIdEl.value = id;
  const vendorModalTitle = document.getElementById('vendorModalTitle');
  
  if (id) {
    if (vendorModalTitle) vendorModalTitle.innerText = 'Chỉnh sửa nhà cung cấp';
    const v = allVendors.find(item => Number(item.id) === Number(id));
    if (v) {
      const vendorName = document.getElementById('vendorName');
      if (vendorName) vendorName.value = v.name || '';
      const vendorApiUrl = document.getElementById('vendorApiUrl');
      if (vendorApiUrl) vendorApiUrl.value = v.api_url || '';
      const vendorApiKey = document.getElementById('vendorApiKey');
      if (vendorApiKey) vendorApiKey.value = v.api_key || '';
      const vendorAdapterKey = document.getElementById('vendorAdapterKey');
      if (vendorAdapterKey) vendorAdapterKey.value = v.adapter_key || 'botmmo';
      const vendorStatus = document.getElementById('vendorStatus');
      if (vendorStatus) vendorStatus.value = v.status || 'active';
    }
  } else {
    if (vendorModalTitle) vendorModalTitle.innerText = 'Thêm nhà cung cấp API';
  }
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeVendorModal() {
  const vendorModalEl = document.getElementById('vendorModal');
  if (vendorModalEl) vendorModalEl.classList.add('opacity-0', 'pointer-events-none');
}

async function saveVendor(e) {
  e.preventDefault();
  const token = adminToken();
  if (!token) return;

  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const id = getVal('vendorId');
  const name = getVal('vendorName').trim();
  const api_url = getVal('vendorApiUrl').trim();
  const api_key = getVal('vendorApiKey').trim();
  const adapter_key = getVal('vendorAdapterKey');
  const status = getVal('vendorStatus');

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
  if (!modal) return;
  const mappingFormEl = document.getElementById('mappingForm');
  if (mappingFormEl) mappingFormEl.reset();
  
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
  const mappingModalEl = document.getElementById('mappingModal');
  if (mappingModalEl) mappingModalEl.classList.add('opacity-0', 'pointer-events-none');
}

async function saveMapping(e) {
  e.preventDefault();
  const token = adminToken();
  if (!token) return;

  const getVal2 = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const vendor_id = getVal2('mapVendorSelect');
  const product_id = getVal2('mapProdSelect');
  const variant_id = getVal2('mapVarSelect');
  const vendor_product_code = getVal2('mapVendorProductCode');
  const priority = getVal2('mapPriority');
  const mapEnabledEl = document.getElementById('mapEnabled');
  const enabled = mapEnabledEl ? mapEnabledEl.checked : false;

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

async function compressImage(file, { maxWidth = 1200, quality = 0.75 } = {}) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

async function uploadProductImage(event, target = 'productImage') {
  let file = event.target.files[0];
  if (!file) return;

  const btn = event.target.previousElementSibling;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compressing...';

  try {
    file = await compressImage(file, { maxWidth: 1200, quality: 0.75 });
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    const formData = new FormData();
    formData.append('image', file);

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
    const isDetailBackground = target === 'detailBackground';
    const prodImageEl = document.getElementById(
      isDetailBackground ? 'prodDetailBackground' : 'prodImage'
    );
    if (prodImageEl) prodImageEl.value = data.url;
    
    // Add to library dropdown if possible
    const select = document.getElementById(
      isDetailBackground ? 'prodDetailBackgroundSelect' : 'prodImageSelect'
    );
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

function updateFormatPreview() {
  const formatInput = document.getElementById('prodDataFormat');
  const sampleInput = document.getElementById('prodSampleData');
  const container = document.getElementById('formatPreviewContainer');
  const content = document.getElementById('formatPreviewContent');
  
  if (!formatInput || !container || !content) return;
  
  const formatStr = formatInput.value.trim();
  const sampleStr = sampleInput ? sampleInput.value.trim() : '';
  
  if (!formatStr) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  const fields = window.FormatService ? window.FormatService.parseDataFormat(formatStr) : [];
  const sampleParts = sampleStr ? sampleStr.split('|').map(p => p.trim()) : [];
  
  const emojiMap = {
    mail: '📧', email: '📧',
    pass: '🔑', password: '🔑',
    uid: '🆔', cookie: '🍪',
    token: '🔄', refresh_token: '🔄',
    client_id: '🆔', client_secret: '🔒',
    phone: '📱', key: '🔑',
    proxy: '🌐', note: '📝', backup_code: '🔐'
  };
  
  let html = '';
  fields.forEach((field, idx) => {
    const value = sampleParts[idx] || `[Ví dụ: ${field.label}]`;
    const isPlaceholder = !sampleParts[idx];
    const emoji = emojiMap[field.key.toLowerCase()] || '🏷️';
    const hiddenBadge = field.hidden ? '<span class="sk-badge" style="background:rgba(239,68,68,0.15); color:var(--danger); border-color:rgba(239,68,68,0.3); font-size:9px; padding:2px 4px; margin-left:6px;">Ẩn (Hidden)</span>' : '';
    
    html += `
      <div style="display: flex; flex-direction: column; gap: 2px; padding: 6px; background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
        <span style="font-weight: 700; color: #aaa; font-size: 11px; display: inline-flex; align-items: center;">
          ${emoji} ${escapeAdminHtml(field.label)} ${hiddenBadge}
        </span>
        <span style="font-family: monospace; word-break: break-all; color: ${isPlaceholder ? 'var(--muted)' : '#fff'}; font-size: 12px; margin-top: 2px;">
          ${escapeAdminHtml(value)}
        </span>
      </div>
    `;
  });
  
  if (sampleParts.length > fields.length) {
    for (let i = fields.length; i < sampleParts.length; i++) {
      html += `
        <div style="display: flex; flex-direction: column; gap: 2px; padding: 6px; background: rgba(249,115,22,0.05); border-radius: 4px; border: 1px dashed rgba(249,115,22,0.2);">
          <span style="font-weight: 700; color: var(--warning); font-size: 11px;">
            📦 Trường #${i + 1} (Dữ liệu bổ sung)
          </span>
          <span style="font-family: monospace; word-break: break-all; color: #fff; font-size: 12px; margin-top: 2px;">
            ${escapeAdminHtml(sampleParts[i])}
          </span>
        </div>
      `;
    }
  }
  
  content.innerHTML = html;
}

function autoDetectFormat() {
  const sampleInput = document.getElementById('prodSampleData');
  const formatInput = document.getElementById('prodDataFormat');
  if (!sampleInput || !formatInput) return;
  
  const sampleStr = sampleInput.value.trim();
  if (!sampleStr) {
    alert('Vui lòng nhập một dòng dữ liệu mẫu vào ô bên phải trước khi tự động nhận diện.');
    return;
  }
  
  if (window.FormatService) {
    const suggestion = window.FormatService.autoDetectFormat(sampleStr);
    formatInput.value = suggestion;
    updateFormatPreview();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !adminLastSyncAt) return;
  if (Date.now() - adminLastSyncAt.getTime() >= ADMIN_SYNC_INTERVAL_MS) {
    refreshAdminData({ silent: true, includeActiveSection: false }).catch(() => {});
  }
});

window.addEventListener('beforeunload', () => {
  if (adminSyncTimer) clearInterval(adminSyncTimer);
});

document.addEventListener('DOMContentLoaded', () => {
  initializeAdminTheme();
  loadAdminDashboard();
});
