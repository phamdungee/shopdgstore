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
  const container = document.getElementById('profileMetricsContainer') || document.querySelector('.sk-profile-metrics');
  if (!container) return;

  container.innerHTML = `
    <div class="sk-stat">
      <span class="sk-stat-icon"><i class="fa-solid fa-wallet"></i></span>
      <div>
        <p>Số dư hiện tại</p>
        <b class="dynamic-sync-balance">${formatMoney(user?.balance || 0)}</b>
      </div>
    </div>
    <div class="sk-stat">
      <span class="sk-stat-icon"><i class="fa-solid fa-chart-line"></i></span>
      <div>
        <p>Tổng nạp</p>
        <b>${formatMoney(stats.totalDeposit || 0)}</b>
      </div>
    </div>
    <div class="sk-stat">
      <span class="sk-stat-icon"><i class="fa-solid fa-money-bill-wave"></i></span>
      <div>
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
  const sidebarAvatar = document.querySelector('.sk-hero-avatar .sk-avatar') || document.querySelector('.sk-user-mini .sk-avatar');
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
  const infoGrid = document.querySelector('.sk-profile-info-grid');
  if (infoGrid) {
    infoGrid.innerHTML = `
      <div class="sk-info-cell"><span>Tên đăng nhập</span><span class="dynamic-sync-username">${escapeHtml(user.username || 'user')}</span></div>
      <div class="sk-info-cell"><span>Địa chỉ email</span><span>${escapeHtml(user.email || 'Chưa cập nhật')}</span></div>
      <div class="sk-info-cell"><span>Số điện thoại</span><span id="txt-phone">${escapeHtml(user.phone || 'Chưa cập nhật')}</span></div>
      <div class="sk-info-cell"><span>Họ và tên</span><span id="txt-fullname">${escapeHtml(user.fullName || user.username || 'Chưa cập nhật')}</span></div>
      <div class="sk-info-cell"><span>Ngày đăng ký</span><span>${user.createdAt ? formatDateTime(user.createdAt) : 'Chưa cập nhật'}</span></div>
      <div class="sk-info-cell"><span>Cấp tài khoản</span><span><span class="sk-badge-rank ${rankBadgeClass}">${rankName}</span></span></div>
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

function warrantyEligible(order) {
  if (!order || order.status !== 'completed') return false;
  const timestamp = order.completedAt || order.completed_at || order.createdAt || order.created_at;
  const completedTime = new Date(timestamp).getTime();
  const elapsed = Date.now() - completedTime;
  return Number.isFinite(completedTime) && elapsed >= 0 && elapsed <= 2 * 24 * 60 * 60 * 1000;
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
              <td><div class="sk-order-actions">
                <button class="sk-btn sk-btn-success" type="button" onclick="showOrderDetail('${escapeHtml(order.id)}')"><i class="fa-solid fa-key"></i> Lấy tài khoản</button>
                ${warrantyEligible(order) ? `<button class="sk-btn sk-warranty-btn" type="button" onclick="openWarrantyRequest('${escapeHtml(order.id)}','${escapeHtml(order.code || order.id)}')"><i class="fa-solid fa-shield-halved"></i> Bảo hành</button>` : ''}
              </div></td>
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
            const amountClass = amount > 0
              ? 'sk-balance-change-positive'
              : amount < 0
                ? 'sk-balance-change-negative'
                : 'sk-balance-change-neutral';
            return `
              <tr>
                <td>#${escapeHtml(item.code || item.id || '---')}</td>
                <td><strong class="${amountClass}">${formatSignedMoney(amount)}</strong></td>
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

  // ── Header
  document.getElementById('odModalCode').innerText = `Chi tiết đơn hàng #${order.code || '---'}`;

  // ── Order info grid
  document.getElementById('odModalProduct').innerText = order.productName || '---';
  document.getElementById('odModalVariant').innerText  = order.variantName || '---';
  document.getElementById('odModalQty').innerText      = order.quantity || '1';
  document.getElementById('odModalPrice').innerText    = (order.totalPrice || 0).toLocaleString('vi-VN') + 'đ';
  document.getElementById('odModalTime').innerText     = formatDateTime(order.createdAt);

  const statusEl = document.getElementById('odModalStatus');
  if (statusEl) {
    statusEl.innerText   = orderStatusLabel(order.status);
    statusEl.className   = `sk-badge ${order.status === 'completed' ? 'sk-badge-success' : order.status === 'cancelled' ? 'sk-badge-danger' : 'sk-badge-warning'}`;
  }

  // ── Resolve deliveryJson — try multiple paths
  let deliveryJson = null;

  // Path 1: order.deliveryJson (direct from DB column)
  if (order.deliveryJson) {
    deliveryJson = typeof order.deliveryJson === 'string'
      ? (() => { try { return JSON.parse(order.deliveryJson); } catch(e) { return null; } })()
      : order.deliveryJson;
  }

  // Path 2: order.responseData contains deliveryJson
  if (!deliveryJson && order.responseData) {
    let resp = order.responseData;
    if (typeof resp === 'string') { try { resp = JSON.parse(resp); } catch(e) {} }
    if (resp && typeof resp === 'object') {
      if (resp.deliveryJson) {
        deliveryJson = resp.deliveryJson;
      } else if (resp.items && Array.isArray(resp.items)) {
        deliveryJson = resp;
      } else if (resp.source === 'inventory') {
        deliveryJson = resp;
      }
    }
  }

  // Path 3: parse raw deliveryText
  if (!deliveryJson && order.deliveryText) {
    if (window.FormatService && typeof window.FormatService.parseDeliveryText === 'function') {
      deliveryJson = window.FormatService.parseDeliveryText(order.deliveryText);
    }
  }

  // Safety: if deliveryJson exists but parsed_format is empty, auto-build it from item fields
  if (deliveryJson && deliveryJson.items && deliveryJson.items.length > 0) {
    if (!deliveryJson.parsed_format || deliveryJson.parsed_format.length === 0) {
      const defaultLabels = {
        mail:'Email / Tài khoản', email:'Email / Tài khoản',
        pass:'Mật khẩu', password:'Mật khẩu',
        uid:'UID / ID', cookie:'Cookie',
        token:'Token', refresh_token:'Refresh Token',
        client_id:'Client ID', client_secret:'Client Secret',
        phone:'Số điện thoại', key:'Key kích hoạt',
        proxy:'Proxy', note:'Ghi chú', backup_code:'Mã Backup'
      };
      const keysSet = new Set();
      deliveryJson.items.forEach(item => {
        const src = item.fields || item;
        Object.keys(src).forEach(k => { if (!k.startsWith('_') && k !== 'extras' && k !== 'raw_text') keysSet.add(k); });
      });
      deliveryJson.parsed_format = Array.from(keysSet).map(k => ({
        key: k,
        label: defaultLabels[k.toLowerCase()] || (k.charAt(0).toUpperCase() + k.slice(1)),
        hidden: false
      }));
    }
  }

  const container = document.getElementById('odModalDeliveryContainer');
  const fallback  = document.getElementById('odModalFallback');
  container.innerHTML = '';

  if (deliveryJson && deliveryJson.items && deliveryJson.items.length > 0) {
    if (fallback) fallback.style.display = 'none';
    container.style.display = 'flex';

    const parsedFormat = deliveryJson.parsed_format || [];

    // ── Smart-merge: fill blank standard fields from positional extras
    deliveryJson.items.forEach(item => {
      if (!item.extras || !item.extras.length) return;
      const remaining = [];
      item.extras.forEach(ext => {
        const pos = parseInt(ext.position);
        if (!isNaN(pos) && pos > 0 && pos <= parsedFormat.length) {
          const fd  = parsedFormat[pos - 1];
          const cur = item.fields ? item.fields[fd.key] : item[fd.key];
          if (!cur || cur === '(Trống)' || String(cur).trim() === '') {
            if (item.fields) item.fields[fd.key] = ext.value;
            else item[fd.key] = ext.value;
            return;
          }
        }
        remaining.push(ext);
      });
      item.extras = remaining;
    });

    // ── Collect all raw lines for copy/download
    const allRaw = deliveryJson.items.map(i => i.raw_text || '').filter(Boolean).join('\n');
    const rawStore = document.getElementById('odModalRawStore');
    if (rawStore) rawStore.value = allRaw;

    // ── Render each account
    const emojiMap = {
      mail:'📧', email:'📧', pass:'🔑', password:'🔑', uid:'🆔', cookie:'🍪',
      token:'🔄', refresh_token:'🔄', client_id:'🆔', client_secret:'🔒',
      phone:'📱', key:'🔑', proxy:'🌐', note:'📝', backup_code:'🔐'
    };

    deliveryJson.items.forEach((item, idx) => {
      container.appendChild(renderOdAccountCard(item, idx, parsedFormat, emojiMap));
    });

  } else {
    container.style.display = 'none';
    if (fallback) fallback.style.display = 'block';
    const rawStore = document.getElementById('odModalRawStore');
    if (rawStore) rawStore.value = order.deliveryText || '';
  }

  // ── Show modal
  document.getElementById('order-detail-modal').classList.remove('opacity-0', 'pointer-events-none');
  const body = document.getElementById('odModalScrollBody');
  if (body) body.scrollTop = 0;
}

function renderOdAccountCard(item, idx, parsedFormat, emojiMap) {
  const card = document.createElement('div');
  card.className = 'od-account-card';

  const rawText = item.raw_text || '';

  // ── Card header
  const header = document.createElement('div');
  header.className = 'od-account-card-header';
  const title = document.createElement('span');
  title.className = 'od-acc-title';
  title.innerHTML = `📦 Tài khoản #${idx + 1}`;
  const copyCardBtn = document.createElement('button');
  copyCardBtn.className = 'od-fv-btn';
  copyCardBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy tài khoản';
  copyCardBtn.onclick = (e) => { e.stopPropagation(); copyText(rawText || buildRawFromFields(item, parsedFormat)); };
  header.appendChild(title);
  header.appendChild(copyCardBtn);
  card.appendChild(header);

  // ── Standard fields
  const fieldsWrap = document.createElement('div');
  parsedFormat.forEach((f, fIdx) => {
    if (f.hidden) return;
    const val = (item.fields && item.fields[f.key]) || item[f.key] || '';
    const emoji = emojiMap[f.key.toLowerCase()] || '🏷️';
    const isPass  = f.key === 'pass' || f.key === 'password';
    const isToken = f.key === 'token' || f.key === 'refresh_token' || f.key === 'cookie';
    const uid = `odFV-${idx}-${fIdx}`;

    const row = document.createElement('div');
    row.className = 'od-field';

    const label = document.createElement('div');
    label.className = 'od-field-label';
    label.textContent = `${emoji} ${f.label}`;
    row.appendChild(label);

    const box = document.createElement('div');
    box.className = 'od-field-value-box';

    const textSpan = document.createElement('span');
    textSpan.className = 'od-fv-text';
    textSpan.id = uid;
    textSpan.setAttribute('data-raw', val);

    if (!val.trim()) {
      textSpan.classList.add('empty');
      textSpan.textContent = '(Trống)';
    } else if (isPass) {
      textSpan.classList.add('masked');
      textSpan.textContent = '●●●●●●●●';
    } else if (isToken && val.length > 40) {
      textSpan.classList.add('collapsed');
      textSpan.textContent = val;
    } else {
      textSpan.textContent = val;
    }

    const actions = document.createElement('div');
    actions.className = 'od-fv-actions';

    if (isPass && val.trim()) {
      const showBtn = document.createElement('button');
      showBtn.className = 'od-fv-btn';
      showBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Hiện';
      showBtn.onclick = (e) => { e.stopPropagation(); toggleOdFieldMask(uid, showBtn); };
      actions.appendChild(showBtn);
    }
    if (isToken && val.length > 40) {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'od-fv-btn';
      expandBtn.innerHTML = '<i class="fa-solid fa-expand"></i> Đầy đủ';
      expandBtn.onclick = (e) => { e.stopPropagation(); toggleOdFieldCollapse(uid, expandBtn); };
      actions.appendChild(expandBtn);
    }
    if (val.trim()) {
      const cpBtn = document.createElement('button');
      cpBtn.className = 'od-fv-btn';
      cpBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
      cpBtn.onclick = (e) => { e.stopPropagation(); copyText(val); };
      actions.appendChild(cpBtn);
    }

    box.appendChild(textSpan);
    box.appendChild(actions);
    row.appendChild(box);
    fieldsWrap.appendChild(row);
  });
  card.appendChild(fieldsWrap);

  // ── Extra fields
  if (item.extras && item.extras.length > 0) {
    const extSec = document.createElement('div');
    extSec.className = 'od-extras-section';
    const extLabel = document.createElement('div');
    extLabel.className = 'od-extras-label';
    extLabel.innerHTML = '<i class="fa-solid fa-box"></i> Dữ liệu ngoài định dạng';
    extSec.appendChild(extLabel);

    item.extras.forEach(ext => {
      const row = document.createElement('div');
      row.className = 'od-extra-item';

      const pos = document.createElement('span');
      pos.className = 'od-extra-pos';
      pos.textContent = `Trường #${ext.position || '?'}`;

      const val = document.createElement('span');
      val.className = 'od-extra-val';
      val.textContent = ext.value || '';

      const cpBtn = document.createElement('button');
      cpBtn.className = 'od-fv-btn';
      cpBtn.style.flexShrink = '0';
      cpBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
      cpBtn.onclick = (e) => { e.stopPropagation(); copyText(ext.value || ''); };

      row.appendChild(pos);
      row.appendChild(val);
      row.appendChild(cpBtn);
      extSec.appendChild(row);
    });

    card.appendChild(extSec);
  }

  // ── Raw data collapse
  if (rawText) {
    const rawSec = document.createElement('div');
    rawSec.className = 'od-raw-section';

    const rawBoxId = `odRaw-${idx}`;
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'od-raw-toggle-btn';
    toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-right" style="font-size:9px;"></i> Hiện dữ liệu gốc';
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      const box = document.getElementById(rawBoxId);
      if (!box) return;
      const isHidden = box.style.display === 'none';
      box.style.display = isHidden ? 'block' : 'none';
      toggleBtn.innerHTML = isHidden
        ? '<i class="fa-solid fa-chevron-down" style="font-size:9px;"></i> Ẩn dữ liệu gốc'
        : '<i class="fa-solid fa-chevron-right" style="font-size:9px;"></i> Hiện dữ liệu gốc';
    };

    const rawBox = document.createElement('div');
    rawBox.className = 'od-raw-box';
    rawBox.id = rawBoxId;
    rawBox.style.display = 'none';

    const rawContent = document.createElement('span');
    rawContent.style.wordBreak = 'break-all';
    rawContent.textContent = rawText;

    const rawCpBtn = document.createElement('button');
    rawCpBtn.className = 'od-fv-btn';
    rawCpBtn.style.cssText = 'position:absolute; right:6px; top:6px;';
    rawCpBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
    rawCpBtn.onclick = (e) => { e.stopPropagation(); copyText(rawText); };

    rawBox.appendChild(rawContent);
    rawBox.appendChild(rawCpBtn);
    rawSec.appendChild(toggleBtn);
    rawSec.appendChild(rawBox);
    card.appendChild(rawSec);
  }

  return card;
}

function buildRawFromFields(item, parsedFormat) {
  return parsedFormat.map(f => (item.fields && item.fields[f.key]) || item[f.key] || '').join('|');
}

function toggleOdFieldMask(uid, btn) {
  const el = document.getElementById(uid);
  if (!el) return;
  const isMasked = el.classList.contains('masked');
  const raw = el.getAttribute('data-raw');
  if (isMasked) {
    el.textContent = raw;
    el.classList.remove('masked');
    btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Ẩn';
  } else {
    el.textContent = '●●●●●●●●';
    el.classList.add('masked');
    btn.innerHTML = '<i class="fa-solid fa-eye"></i> Hiện';
  }
}

function toggleOdFieldCollapse(uid, btn) {
  const el = document.getElementById(uid);
  if (!el) return;
  const isCollapsed = el.classList.contains('collapsed');
  if (isCollapsed) {
    el.classList.remove('collapsed');
    btn.innerHTML = '<i class="fa-solid fa-compress"></i> Thu gọn';
  } else {
    el.classList.add('collapsed');
    btn.innerHTML = '<i class="fa-solid fa-expand"></i> Đầy đủ';
  }
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    // subtle visual feedback — could be a toast; alert for now
    const el = document.createElement('div');
    el.textContent = '✓ Đã sao chép';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#22c55e;color:#fff;padding:8px 16px;border-radius:6px;font-weight:700;font-size:13px;z-index:9999;opacity:1;transition:opacity 0.4s;';
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 1800);
  });
}

// Keep these for compatibility with other parts of the page
function copySingleFieldValue(event, value) { if (event) { event.stopPropagation(); event.preventDefault(); } copyText(value); }

function closeOrderDetailModal() {
  document.getElementById('order-detail-modal').classList.add('opacity-0', 'pointer-events-none');
}

function copyOrderDetailDelivery() {
  const store = document.getElementById('odModalRawStore');
  const text  = store ? store.value : '';
  copyText(text);
}

function exportOrderDetailTxt() {
  const orderCode = (document.getElementById('odModalCode').innerText || '').replace('Chi tiết đơn hàng #', '').trim();
  const store = document.getElementById('odModalRawStore');
  const content = store ? store.value : '';
  if (!content) return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `DGStore_DonHang_${orderCode}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function switchProfileTab(tabTarget) {
  document.querySelectorAll('.profile-tab-section').forEach(view => {
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

  // Update mobile buttons active state
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === tabTarget;
    btn.classList.toggle('is-active', isTarget);
  });
  
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
      const isProfileLink = href === 'profile.html' || href === '/profile.html';
      const isPolicyLink = href === 'profile.html#policy' || href === '/profile.html#policy' || href === 'profile.html#security' || href === '/profile.html#security';

      if (currentHash === '#policy' || currentHash === '#security') {
        isMatch = isPolicyLink;
      } else {
        isMatch = isProfileLink;
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
  
  // Mobile sidebar toggle
  const toggleBtn = document.getElementById('mobileSidebarToggle');
  function createBackdrop() {
    let bd = document.getElementById('mobileSidebarBackdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'mobileSidebarBackdrop';
      bd.className = 'mobile-sidebar-backdrop';
      document.body.appendChild(bd);
      bd.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
      });
    }
    return bd;
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const open = document.body.classList.toggle('sidebar-open');
      if (open) createBackdrop();
    });
  }

  // Close sidebar on larger resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 991) document.body.classList.remove('sidebar-open');
  });
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
let avatarUploadPending = false;

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
  tempAvatarUrl = src;
  updateModalAvatarPreview(tempAvatarUrl);
  
  document.querySelectorAll('.preset-avatar-item').forEach(img => {
    if (img.src === src) {
      img.classList.add('active');
    } else {
      img.classList.remove('active');
    }
  });
};

async function handleAvatarFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showProfileMessage('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.');
    event.target.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showProfileMessage('Ảnh đại diện không được vượt quá 2 MB.');
    event.target.value = '';
    return;
  }

  const token = getToken();
  if (!token) {
    clearSession();
    window.location.href = 'login.html';
    return;
  }

  avatarUploadPending = true;
  const uploadButton = document.querySelector('.upload-device-btn');
  if (uploadButton) {
    uploadButton.disabled = true;
    uploadButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên R2...';
  }

  try {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(`${API_BASE}/upload?folder=avatars`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false || !data.url) {
      throw new Error(data.message || 'Không thể tải ảnh lên R2.');
    }

    tempAvatarUrl = data.url;
    updateModalAvatarPreview(tempAvatarUrl);
    document.querySelectorAll('.preset-avatar-item').forEach(el => el.classList.remove('active'));
    showProfileMessage('Ảnh đã được tải lên R2. Nhấn Lưu thay đổi để sử dụng.');
  } catch (err) {
    console.error(err);
    showProfileMessage(err.message || 'Không thể tải ảnh lên R2.');
    event.target.value = '';
  } finally {
    avatarUploadPending = false;
    if (uploadButton) {
      uploadButton.disabled = false;
      uploadButton.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Tải ảnh thiết bị';
    }
  }
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
  
  document.querySelectorAll('.preset-avatar-item').forEach(img => {
    if (tempAvatarUrl && tempAvatarUrl === img.src) {
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
  if (avatarUploadPending) {
    showProfileMessage('Vui lòng chờ ảnh tải lên R2 hoàn tất.');
    return;
  }

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
