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
  alert(message);
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
  const statValues = document.querySelectorAll('.sk-profile-metrics .sk-stat b');
  if (statValues[0]) statValues[0].innerText = formatMoney(user?.balance || 0);
  if (statValues[1]) statValues[1].innerText = formatMoney(stats.totalDeposit || 0);
  if (statValues[2]) statValues[2].innerText = formatMoney(stats.totalSpent || 0);
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
  });

  document.querySelectorAll('.dynamic-sync-balance').forEach(el => {
    el.innerText = formatMoney(user.balance);
  });

  // Render sidebar avatar
  const sidebarAvatar = document.querySelector('.sk-user-mini .sk-avatar');
  if (sidebarAvatar) {
    if (user.avatarUrl) {
      sidebarAvatar.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
    } else {
      sidebarAvatar.innerHTML = `<i class="fa-solid fa-user"></i>`;
    }
  }

  setInfoCell(0, user.username || 'user');
  setInfoCell(1, user.email || 'Chưa cập nhật');
  setInfoCell(2, user.phone || 'Chưa cập nhật');
  setInfoCell(3, user.fullName || user.username || 'Chưa cập nhật');
  setInfoCell(4, formatDateTime(user.createdAt));
  setInfoCell(5, roleLabel(user.role));
  setAccountStats(user, accountHistory.stats);

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
  const tbody = document.querySelector('#tab-content-orders tbody');
  if (!tbody) return;

  const completedOrders = orders.filter(order => order.status === 'completed');

  tbody.innerHTML = completedOrders.map(order => `
    <tr>
      <td>#${escapeHtml(order.code || order.id || '---')}</td>
      <td>
        <b>${escapeHtml(order.productName || 'Sản phẩm')}</b><br>
        <span style="color:var(--muted)">${escapeHtml(order.variantName || 'Gói mặc định')} x${Number(order.quantity || 1)}</span>
      </td>
      <td class="sk-price">${formatMoney(order.totalPrice)}</td>
      <td>${formatDateTime(order.createdAt)}</td>
      <td><span class="sk-badge sk-badge-success" style="background: var(--success-soft); color: var(--success); border-color: rgba(16, 185, 129, 0.2);">${escapeHtml(orderStatusLabel(order.status))}</span></td>
      <td>
        <button class="sk-btn sk-btn-success" style="background: var(--success); color: #fff; box-shadow: 0 0 10px rgba(16, 185, 129, 0.35); border: 0; font-weight: 700; font-size: 12px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 4px;" type="button" onclick="showOrderDetail('${escapeHtml(order.id)}')"><i class="fa-solid fa-key"></i> Lấy tài khoản</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">Chưa có đơn hàng thành công nào.</td></tr>';
}

function renderTransactions(transactions) {
  const tbody = document.querySelector('#tab-content-transactions tbody');
  if (!tbody) return;

  tbody.innerHTML = transactions.map(item => {
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
  }).join('') || '<tr><td colspan="5">Chưa có biến động số dư.</td></tr>';
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
  document.querySelectorAll('.profile-tab-section').forEach(view => {
    view.classList.add('hidden');
  });

  ['profile', 'security', 'password', 'orders', 'transactions'].forEach(id => {
    document.getElementById(`menu-${id}`)?.classList.remove('is-active');
  });

  document.getElementById(`tab-content-${tabTarget}`)?.classList.remove('hidden');
  document.getElementById(`menu-${tabTarget}`)?.classList.add('is-active');
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

document.addEventListener('DOMContentLoaded', async () => {
  const passwordForm = document.getElementById('current-password')?.closest('form');
  if (passwordForm) passwordForm.onsubmit = changePassword;

  const fileInput = document.getElementById('input-avatar-file');
  if (fileInput) {
    fileInput.addEventListener('change', handleAvatarFileSelect);
  }

  // Sync tab based on URL hash on page load
  handleHashChange();

  const user = await fetchMe();
  applyUserToProfile(user);
  if (user) await fetchAccountHistory();
  setTimeout(hidePreloader, 300);
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
  
  document.querySelectorAll('.preset-avatar-item').forEach(img => {
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
      
      document.querySelectorAll('.preset-avatar-item').forEach(el => el.classList.remove('active'));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

const modal = document.getElementById('edit-profile-modal');
const inner = modal ? modal.querySelector('div') : null;

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
  
  document.querySelectorAll('.preset-avatar-item').forEach(img => {
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
    showProfileMessage('Đã cập nhật hồ sơ và đồng bộ với database.');
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
