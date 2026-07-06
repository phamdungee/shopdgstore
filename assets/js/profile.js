// assets/js/profile.js
// Đồng bộ profile.html với database thông qua backend server.js.

const API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
let currentUser = null;
let accountHistory = { orders: [], transactions: [], stats: {} };

function getToken() {
  return localStorage.getItem('token');
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('isLoggedIn');
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function formatSignedMoney(value) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toLocaleString('vi-VN')}đ`;
}

function formatDateTime(value) {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function roleLabel(role) {
  if (role === 'admin') return 'Quản trị viên';
  return 'Thành viên';
}

function showProfileMessage(message) {
  if (window.showToast) {
    window.showToast(message, true);
  } else {
    alert(message);
  }
}

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  preloader.classList.add('opacity-0');
  setTimeout(() => preloader.remove(), 400);
}

function setInfoCell(index, value) {
  const cells = document.querySelectorAll('#tab-content-profile .sk-info-cell');
  const cell = cells[index];
  const valueNode = cell?.querySelector('span:last-child');
  if (valueNode) valueNode.innerText = value || 'Chưa cập nhật';
}

function setAccountStats(user, stats = {}) {
  const container = document.getElementById('profileMetricsContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="pf-stat">
      <span class="pf-stat-icon"><i class="fa-solid fa-wallet"></i></span>
      <div class="pf-stat-data">
        <p>Số dư hiện tại</p>
        <b class="dynamic-sync-balance">${formatMoney(user?.balance || 0)}</b>
      </div>
    </div>
    <div class="pf-stat">
      <span class="pf-stat-icon"><i class="fa-solid fa-chart-line"></i></span>
      <div class="pf-stat-data">
        <p>Tổng nạp</p>
        <b>${formatMoney(stats.totalDeposit || 0)}</b>
      </div>
    </div>
    <div class="pf-stat">
      <span class="pf-stat-icon"><i class="fa-solid fa-money-bill-wave"></i></span>
      <div class="pf-stat-data">
        <p>Đã dùng</p>
        <b>${formatMoney(stats.totalSpent || 0)}</b>
      </div>
    </div>
  `;
}

async function authorizedFetch(path, options = {}) {
  const token = getToken();
  if (!token) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Chưa đăng nhập');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    if (res.status === 401) {
      clearSession();
      alert('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại!');
      window.location.href = 'login.html';
    }
    throw new Error(data.message || 'Có lỗi xảy ra');
  }

  return data;
}

async function fetchMe() {
  try {
    const data = await authorizedFetch('/me');
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('isLoggedIn', 'true');
    currentUser = data.user;
    return data.user;
  } catch (err) {
    console.error(err);
    if (err.message !== 'Chưa đăng nhập') {
      showProfileMessage(err.message || 'Không kết nối được server đăng nhập.');
    }
    return null;
  }
}

async function fetchAccountHistory() {
  try {
    const data = await authorizedFetch('/account/history');
    accountHistory = {
      orders: data.orders || [],
      transactions: data.transactions || [],
      stats: data.stats || {}
    };
    renderOrders(accountHistory.orders);
    renderTransactions(accountHistory.transactions);
    setAccountStats(currentUser, accountHistory.stats);
  } catch (err) {
    console.error(err);
    renderOrders([]);
    renderTransactions([]);
    showProfileMessage(err.message || 'Không tải được lịch sử tài khoản.');
  }
}

function applyUserToProfile(user) {
  if (!user) return;

  document.querySelectorAll('.dynamic-sync-username').forEach(el => {
    el.innerText = user.username || 'user';
    el.style.overflow = 'hidden';
    el.style.textOverflow = 'ellipsis';
    el.style.whiteSpace = 'nowrap';
  });

  document.querySelectorAll('.dynamic-sync-balance').forEach(el => {
    el.innerText = formatMoney(user.balance);
  });

  // Render avatar fallback support
  const sidebarAvatar = document.querySelector('.pf-avatar-img, .profile-modern-avatar-section .sk-avatar, #sidebarProfileCard .sk-avatar');
  if (sidebarAvatar) {
    if (user.avatarUrl) {
      const img = document.createElement('img');
      img.src = escapeHtml(user.avatarUrl);
      img.alt = 'Avatar';
      img.onerror = () => {
        const initial = (user.username || user.email || 'U').trim().charAt(0).toUpperCase();
        sidebarAvatar.innerHTML = `<span class="avatar-fallback" style="font-weight:900;">${escapeHtml(initial)}</span>`;
      };
      sidebarAvatar.innerHTML = '';
      sidebarAvatar.appendChild(img);
    } else {
      const initial = (user.username || user.email || 'U').trim().charAt(0).toUpperCase();
      sidebarAvatar.innerHTML = `<span class="avatar-fallback" style="font-weight:900;">${escapeHtml(initial)}</span>`;
    }
  }

  // Populate dynamic rows in card
  const uidString = user.id ? user.id.toString().substring(0, 8).toUpperCase() : '---';
  document.querySelectorAll('.dynamic-sync-uid').forEach(el => {
    el.innerText = uidString;
  });

  let rankName = 'Thành viên';
  let rankBadgeClass = 'badge-member';
  if (user.role === 'admin') {
    rankName = 'ADMIN';
    rankBadgeClass = 'badge-admin';
  } else if (accountHistory.stats.totalDeposit > 1000000) {
    rankName = 'VIP';
    rankBadgeClass = 'badge-vip';
  }

  const rankEl = document.querySelector('.dynamic-sync-rank');
  if (rankEl) {
    rankEl.className = `sk-badge-rank ${rankBadgeClass} dynamic-sync-rank`;
    rankEl.innerText = rankName;
  }

  const roleBadgeEl = document.querySelector('.pf-badge, .sk-user-mini-role-badge');
  if (roleBadgeEl) {
    roleBadgeEl.className = `pf-badge ${rankBadgeClass}`;
    roleBadgeEl.innerText = rankName;
  }

  const sublineEl = document.getElementById('mobileUserSubline');
  if (sublineEl) {
    sublineEl.setAttribute('data-subline', `UID: ${uidString} | ${rankName}`);
  }

  document.querySelectorAll('.dynamic-sync-joined').forEach(el => {
    el.innerText = user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '---';
  });

  // Populate Info Grid cells (replaces skeletons)
  const infoGrid = document.getElementById('profileInfoGrid');
  if (infoGrid) {
    infoGrid.innerHTML = `
      <div class="pf-info-cell"><span>Tên đăng nhập</span><span class="dynamic-sync-username">${escapeHtml(user.username || 'user')}</span></div>
      <div class="pf-info-cell"><span>Địa chỉ email</span><span>${escapeHtml(user.email || 'Chưa cập nhật')}</span></div>
      <div class="pf-info-cell"><span>Số điện thoại</span><span id="txt-phone">${escapeHtml(user.phone || 'Chưa cập nhật')}</span></div>
      <div class="pf-info-cell"><span>Họ và tên</span><span id="txt-fullname">${escapeHtml(user.fullName || user.username || 'Chưa cập nhật')}</span></div>
      <div class="pf-info-cell"><span>Ngày đăng ký</span><span>${user.createdAt ? formatDateTime(user.createdAt) : 'Chưa cập nhật'}</span></div>
      <div class="pf-info-cell"><span>Cấp tài khoản</span><span><span class="sk-badge-rank ${rankBadgeClass}">${rankName}</span></span></div>
    `;
  }

  // Show edit profile button
  const btnEdit = document.getElementById('btnEditProfile');
  if (btnEdit) btnEdit.style.display = 'inline-flex';

  const txtPhone = document.getElementById('txt-phone');
  if (txtPhone) txtPhone.innerText = user.phone || 'Chưa cập nhật';

  const txtFullname = document.getElementById('txt-fullname');
  if (txtFullname) txtFullname.innerText = user.fullName || user.username || 'Chưa cập nhật';

  const inputPhone = document.getElementById('input-phone');
  if (inputPhone) inputPhone.value = user.phone || '';

  const inputFullname = document.getElementById('input-fullname');
  if (inputFullname) inputFullname.value = user.fullName || user.username || '';
}

function orderStatusLabel(status) {
  const labels = {
    completed: 'Thành công',
    processing: 'Đang xử lý',
    pending: 'Đang xử lý',
    cancelled: 'Đã hủy',
    refunded: 'Đã hoàn'
  };
  return labels[status] || status || '---';
}

function renderOrders(orders) {
  const ordersBody = document.getElementById('ordersTabBody');
  if (!ordersBody) return;

  const completedOrders = orders.filter(order => order.status === 'completed');

  if (completedOrders.length === 0) {
    ordersBody.innerHTML = `
      <div class="sk-empty-state">
        <i class="fa-solid fa-folder-open" style="font-size: 40px; color: rgba(255,255,255,0.1); margin-bottom: 16px;"></i>
        <h3>Chưa có đơn hàng nào</h3>
        <p>Lịch sử mua hàng của bạn hiện đang trống. Hãy thực hiện giao dịch đầu tiên!</p>
      </div>
    `;
    return;
  }

  ordersBody.innerHTML = `
    <div class="sk-table-wrap">
      <table class="sk-table">
        <thead><tr><th>Mã đơn</th><th>Sản phẩm</th><th>Giá trị</th><th>Ngày mua</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
        <tbody>
          ${completedOrders.map(order => `
            <tr>
              <td>#${escapeHtml(order.code || order.id || '---')}</td>
              <td>
                <b>${escapeHtml(order.productName || 'Sản phẩm')}</b><br>
                <span style="color:var(--muted)">${escapeHtml(order.variantName || 'Gói mặc định')} x${Number(order.quantity || 1)}</span>
              </td>
              <td class="sk-price">${formatMoney(order.totalPrice)}</td>
              <td>${formatDateTime(order.createdAt)}</td>
              <td><span class="sk-badge sk-badge-success" style="background: var(--success-soft); color: var(--success); border-color: rgba(41, 226, 125, 0.2);">${escapeHtml(orderStatusLabel(order.status))}</span></td>
              <td>
                <button class="sk-btn sk-btn-success" style="background: var(--success); color: #fff; border: 0; font-weight: 700; font-size: 12px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 4px;" type="button" onclick="showOrderDetail('${escapeHtml(order.id)}')"><i class="fa-solid fa-key"></i> Lấy tài khoản</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTransactions(transactions) {
  const txBody = document.getElementById('transactionsTabBody');
  if (!txBody) return;

  if (transactions.length === 0) {
    txBody.innerHTML = `
      <div class="sk-empty-state">
        <i class="fa-solid fa-clock-rotate-left" style="font-size: 40px; color: rgba(255,255,255,0.1); margin-bottom: 16px;"></i>
        <h3>Chưa có giao dịch nào</h3>
        <p>Lịch sử biến động số dư tài khoản của bạn hiện đang trống.</p>
      </div>
    `;
    return;
  }

  txBody.innerHTML = `
    <div class="sk-table-wrap">
      <table class="sk-table">
        <thead><tr><th>Mã GD</th><th>Thay đổi</th><th>Số dư cuối</th><th>Nội dung</th><th>Thời gian</th></tr></thead>
        <tbody>
          ${transactions.map(item => {
            const amount = Number(item.amount || 0);
            const color = amount >= 0 ? 'var(--success)' : 'var(--danger)';
            return `
              <tr>
                <td>#${escapeHtml(item.code || item.id || '---')}</td>
                <td style="color:${color}; font-weight:900">${formatSignedMoney(amount)}</td>
                <td>${formatMoney(item.balanceAfter)}</td>
                <td>${escapeHtml(item.content || 'Biến động số dư')}</td>
                <td>${formatDateTime(item.createdAt)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function showOrderDetail(orderId) {
  const order = accountHistory.orders.find(item => String(item.id) === String(orderId));
  if (!order) return;

  document.getElementById('odModalCode').innerText = `Chi tiết đơn hàng #${order.code || '---'}`;
  document.getElementById('odModalProduct').innerText = order.productName || '---';
  document.getElementById('odModalVariant').innerText = order.variantName || '---';
  document.getElementById('odModalQty').innerText = order.quantity || '1';
  document.getElementById('odModalPrice').innerText = (order.totalPrice || 0).toLocaleString('vi-VN') + 'đ';
  document.getElementById('odModalTime').innerText = formatDateTime(order.createdAt);
  
  const statusEl = document.getElementById('odModalStatus');
  if (statusEl) {
    statusEl.innerText = orderStatusLabel(order.status);
    statusEl.className = `badge-status ${order.status === 'completed' ? 'active' : 'locked'}`;
  }

  document.getElementById('odModalDelivery').value = order.deliveryText || 'Đơn hàng đã được ghi nhận.';
  
  const modal = document.getElementById('order-detail-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeOrderDetailModal() {
  const modal = document.getElementById('order-detail-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function copyOrderDetailDelivery() {
  const text = document.getElementById('odModalDelivery').value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert('Đã sao chép thông tin tài khoản thành công!');
  });
}

function switchProfileTab(tabTarget) {
  document.querySelectorAll('.pf-panel').forEach(view => {
    view.classList.add('hidden');
  });

  ['profile', 'security', 'password', 'orders', 'transactions'].forEach(id => {
    const btn = document.getElementById(`menu-${id}`);
    if (btn) btn.classList.remove('is-active', 'active');
  });

  const targetEl = document.getElementById(`tab-content-${tabTarget}`);
  if (targetEl) {
    targetEl.classList.remove('hidden');
    // On mobile screens, scroll down to the content so user knows it changed
    if (window.innerWidth <= 992) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const activeBtn = document.getElementById(`menu-${tabTarget}`);
  if (activeBtn) activeBtn.classList.add('is-active', 'active');
  
  if (window.location.hash !== `#${tabTarget}`) {
    window.history.replaceState(null, null, `#${tabTarget}`);
  }
}

function updateGlobalSidebarActive() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const currentHash = window.location.hash;
  
  document.querySelectorAll('.sk-sidebar-new .nav-item').forEach(el => {
    const href = el.getAttribute('href');
    if (!href) return;
    
    const isProfilePage = currentPath === 'profile.html';
    let isMatch = false;
    
    if (isProfilePage) {
      if (href === 'profile.html' && (!currentHash || currentHash === '#profile')) {
        isMatch = true;
      } else if ((href === 'profile.html#orders' || href.includes('index.html#orders')) && currentHash === '#orders') {
        isMatch = true;
      } else if (href === 'profile.html#policy' && (currentHash === '#policy' || currentHash === '#security')) {
        isMatch = true;
      } else if (href === 'profile.html#history' && (currentHash === '#history' || currentHash === '#transactions')) {
        isMatch = true;
      }
    } else {
      isMatch = href.includes(currentPath);
    }
    
    el.classList.toggle('active', isMatch);
  });
}

function handleHashChange() {
  const hash = window.location.hash.slice(1);
  
  // Map global sidebar hash routes to internal profile tab IDs
  const routeMap = {
    'profile': 'profile',
    'security': 'security',
    'policy': 'security',
    'password': 'password',
    'orders': 'orders',
    'transactions': 'transactions',
    'history': 'transactions'
  };
  
  const targetTab = routeMap[hash] || 'profile';
  switchProfileTab(targetTab);
  updateGlobalSidebarActive();
}

window.handlePasswordUpdate = changePassword;

window.retryLoadingProfile = function() {
  const errorState = document.getElementById('profileErrorState');
  if (errorState) errorState.classList.add('hidden');
  showSkeletons();
  loadProfileFlow();
};

function showSkeletons() {
  const infoGrid = document.getElementById('profileInfoGrid');
  if (infoGrid) {
    infoGrid.innerHTML = `
      <div class="sk-info-cell skeleton skeleton-cell"></div>
      <div class="sk-info-cell skeleton skeleton-cell"></div>
      <div class="sk-info-cell skeleton skeleton-cell"></div>
      <div class="sk-info-cell skeleton skeleton-cell"></div>
      <div class="sk-info-cell skeleton skeleton-cell"></div>
      <div class="sk-info-cell skeleton skeleton-cell"></div>
    `;
  }
  const metrics = document.getElementById('profileMetricsContainer');
  if (metrics) {
    metrics.innerHTML = `
      <div class="sk-stat skeleton skeleton-stat"></div>
      <div class="sk-stat skeleton skeleton-stat"></div>
      <div class="sk-stat skeleton skeleton-stat"></div>
    `;
  }
  const btnEdit = document.getElementById('btnEditProfile');
  if (btnEdit) btnEdit.style.display = 'none';

  const ordersBody = document.getElementById('ordersTabBody');
  if (ordersBody) {
    ordersBody.innerHTML = `<div class="skeleton skeleton-cell" style="height:120px; width:100%;"></div>`;
  }
  const txBody = document.getElementById('transactionsTabBody');
  if (txBody) {
    txBody.innerHTML = `<div class="skeleton skeleton-cell" style="height:120px; width:100%;"></div>`;
  }
}

async function loadProfileFlow() {
  try {
    const user = await fetchMe();
    if (!user) {
      throw new Error('Không lấy được thông tin người dùng');
    }
    await fetchAccountHistory();
    applyUserToProfile(user);
  } catch (err) {
    console.error(err);
    const errorState = document.getElementById('profileErrorState');
    if (errorState) errorState.classList.remove('hidden');
    
    const infoGrid = document.getElementById('profileInfoGrid');
    if (infoGrid) infoGrid.innerHTML = '';
    const metrics = document.getElementById('profileMetricsContainer');
    if (metrics) metrics.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const passwordForm = document.getElementById('current-password')?.closest('form');
  if (passwordForm) passwordForm.onsubmit = changePassword;

  const fileInput = document.getElementById('input-avatar-file');
  if (fileInput) {
    fileInput.addEventListener('change', handleAvatarFileSelect);
  }

  // Sync tab based on URL hash on page load
  handleHashChange();

  // Hide the generic preloader immediately to display skeletons
  hidePreloader();
  
  // Start loading data flow
  loadProfileFlow();
});

window.addEventListener('hashchange', handleHashChange);

function handleLogout() {
  clearSession();
  window.location.href = 'index.html';
}

const modal = document.getElementById('edit-profile-modal');
const inner = modal ? modal.querySelector('div') : null;

function openEditModal() {
  if (!modal || !inner) return;
  modal.classList.remove('opacity-0', 'pointer-events-none');
  inner.classList.remove('scale-95');
}

function closeEditModal() {
  if (!modal || !inner) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  inner.classList.add('scale-95');
}

function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;

  const showPassword = input.type === 'password';
  input.type = showPassword ? 'text' : 'password';
  button.setAttribute('aria-label', showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  button.innerHTML = showPassword
    ? '<i class="fa-solid fa-eye-slash"></i>'
    : '<i class="fa-solid fa-eye"></i>';
}

let tempAvatarUrl = null;

function updateModalAvatarPreview(url) {
  const previewContainer = document.getElementById('modal-avatar-preview');
  if (!previewContainer) return;
  
  if (url) {
    previewContainer.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
  } else {
    const displayName = currentUser?.fullName || currentUser?.username || 'U';
    const initial = displayName.trim().charAt(0).toUpperCase();
    previewContainer.innerHTML = `<span>${escapeHtml(initial)}</span>`;
  }
}

window.selectPresetAvatar = function(src) {
  let relativeSrc = src;
  if (src.includes('assets/img/')) {
    relativeSrc = src.substring(src.indexOf('assets/img/'));
  }
  
  tempAvatarUrl = relativeSrc;
  updateModalAvatarPreview(tempAvatarUrl);
  
  document.querySelectorAll('.pf-preset').forEach(img => {
    let imgRelative = img.getAttribute('src');
    if (imgRelative === relativeSrc) {
      img.classList.add('active');
    } else {
      img.classList.remove('active');
    }
  });
};

function handleAvatarFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Vui lòng chọn tệp hình ảnh hợp lệ.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxDim = 150;
      
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      tempAvatarUrl = compressedDataUrl;
      updateModalAvatarPreview(tempAvatarUrl);
      
      document.querySelectorAll('.pf-preset').forEach(el => el.classList.remove('active'));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function openEditModal() {
  if (!modal || !inner) return;
  modal.classList.remove('opacity-0', 'pointer-events-none');
  inner.classList.remove('scale-95');
  
  const inputPhone = document.getElementById('input-phone');
  if (inputPhone) inputPhone.value = currentUser?.phone || '';
  
  const inputFullname = document.getElementById('input-fullname');
  if (inputFullname) inputFullname.value = currentUser?.fullName || currentUser?.username || '';

  tempAvatarUrl = currentUser?.avatarUrl || null;
  updateModalAvatarPreview(tempAvatarUrl);
  
  document.querySelectorAll('.pf-preset').forEach(img => {
    let imgRelative = img.getAttribute('src');
    if (tempAvatarUrl && tempAvatarUrl === imgRelative) {
      img.classList.add('active');
    } else {
      img.classList.remove('active');
    }
  });

  const fileInput = document.getElementById('input-avatar-file');
  if (fileInput) fileInput.value = '';
}

function closeEditModal() {
  if (!modal || !inner) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  inner.classList.add('scale-95');
}

async function saveProfileChanges() {
  const phone = document.getElementById('input-phone')?.value.trim() || '';
  const fullName = document.getElementById('input-fullname')?.value.trim() || '';

  try {
    const data = await authorizedFetch('/profile', {
      method: 'PATCH',
      body: JSON.stringify({ phone, fullName, avatarUrl: tempAvatarUrl })
    });

    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    applyUserToProfile(data.user);
    closeEditModal();
    showProfileMessage('Đã cập nhật ảnh hồ sơ');
  } catch (err) {
    console.error(err);
    showProfileMessage(err.message || 'Không cập nhật được hồ sơ.');
  }
}

async function changePassword(event) {
  event.preventDefault();

  const currentPasswordInput = document.getElementById('current-password');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const submitButton = event.target?.querySelector('button[type="submit"]');

  const currentPassword = currentPasswordInput?.value || '';
  const newPassword = newPasswordInput?.value || '';
  const confirmPassword = confirmPasswordInput?.value || '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    showProfileMessage('Vui lòng nhập đầy đủ mật khẩu.');
    return;
  }

  if (newPassword.length < 6) {
    showProfileMessage('Mật khẩu mới phải có ít nhất 6 ký tự.');
    return;
  }

  if (newPassword !== confirmPassword) {
    showProfileMessage('Xác nhận mật khẩu mới không khớp.');
    return;
  }

  const originalButtonHtml = submitButton?.innerHTML;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...';
  }

  try {
    const data = await authorizedFetch('/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });

    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    showProfileMessage(data.message || 'Đổi mật khẩu thành công.');
  } catch (err) {
    console.error(err);
    showProfileMessage(err.message || 'Không đổi được mật khẩu.');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonHtml || 'Cập nhật mật khẩu';
    }
  }
}
