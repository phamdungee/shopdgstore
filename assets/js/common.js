(function () {
  function initMiniSidebar() {
    const nav = document.querySelector('.sk-sidebar-new');
    const topbarInner = document.querySelector('.sk-topbar-inner');

    if (!nav || !topbarInner || topbarInner.querySelector('.sk-menu-toggle')) {
      return;
    }

    document.body.classList.add('sk-has-mini-sidebar', 'sk-sidebar-collapsed');
    nav.classList.add('sk-mini-sidebar');
    nav.setAttribute('aria-label', nav.getAttribute('aria-label') || 'Menu chính');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sk-menu-toggle';
    toggle.setAttribute('aria-label', 'Mở menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';

    const backdrop = document.createElement('div');
    backdrop.className = 'sk-sidebar-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    topbarInner.insertBefore(toggle, topbarInner.firstElementChild);
    const shell = document.querySelector('.sk-shell') || document.body;
    shell.appendChild(backdrop);

    function closeSidebar() {
      document.body.classList.remove('sk-sidebar-expanded');
      document.body.classList.add('sk-sidebar-collapsed');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Mở menu');
      backdrop.classList.remove('is-visible');
    }

    function openSidebar() {
      document.body.classList.add('sk-sidebar-expanded');
      document.body.classList.remove('sk-sidebar-collapsed');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Thu gọn menu');

      if (window.matchMedia('(max-width: 980px)').matches) {
        backdrop.classList.add('is-visible');
      }
    }

    function toggleSidebar() {
      if (document.body.classList.contains('sk-sidebar-expanded')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }

    toggle.addEventListener('click', toggleSidebar);
    backdrop.addEventListener('click', closeSidebar);

    nav.addEventListener('click', (event) => {
      if (event.target.closest('.nav-item') && window.matchMedia('(max-width: 980px)').matches) {
        closeSidebar();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeSidebar();
      }
    });

    window.addEventListener('resize', () => {
      if (!window.matchMedia('(max-width: 980px)').matches) {
        backdrop.classList.remove('is-visible');
      } else if (document.body.classList.contains('sk-sidebar-expanded')) {
        backdrop.classList.add('is-visible');
      }
    });
    // Hook sidebar hover-expand triggers
    const sidebar = document.querySelector('.sk-sidebar-new');
    if (sidebar) {
      sidebar.addEventListener('mouseenter', () => {
        document.body.classList.add('sk-sidebar-hovered');
      });
      sidebar.addEventListener('mouseleave', () => {
        document.body.classList.remove('sk-sidebar-hovered');
      });
    }
  }

  // Unified Premium Dark Glass Toast System
  function showToast(message, isSuccess = true) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'sk-toast-stack';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'sk-toast';
    
    // Customize style borders and glows
    if (!isSuccess) {
      toast.style.borderLeft = '4px solid var(--danger)';
      toast.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px var(--danger-glow)';
    } else {
      toast.style.borderLeft = '4px solid var(--success)';
      toast.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px var(--success-glow)';
    }
    
    const iconClass = isSuccess ? 'fa-circle-check' : 'fa-circle-xmark';
    const iconColor = isSuccess ? 'var(--success)' : 'var(--danger)';
    
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid ${iconClass}" style="color: ${iconColor}; font-size: 15px;"></i>
        <span>${message}</span>
      </div>
    `;
    
    container.appendChild(toast);
    if (window.replaceIcons) window.replaceIcons(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s var(--ease-smooth)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function getAbsoluteImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
      return url;
    }
    return '/' + url;
  }

  // --- Unified Auth Logic ---
  const API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');

  function formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  }

  function getStoredUser() {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  function clearAuthSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isLoggedIn');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderHeaderLoggedOut() {
    const targets = document.querySelectorAll('#headerAuthActions, .sk-auth-actions');
    targets.forEach(target => {
      // Don't overwrite the cart icon if it's in the same container. Just replace the auth part.
      // We will look for an element with id="authActionsContainer" inside, or just replace the whole thing if it's purely for auth.
      let container = target.querySelector('#authActionsContainer') || target;
      container.innerHTML = '<a class="sk-btn sk-btn-primary" href="/login.html"><i class="fa-solid fa-right-to-bracket"></i> <span class="btn-text">Đăng nhập / Đăng ký</span></a>';
      if (window.replaceIcons) window.replaceIcons(container);
    });
  }

  function renderHeaderUser(user) {
    const targets = document.querySelectorAll('#headerAuthActions, .sk-auth-actions');
    targets.forEach(target => {
      let container = target.querySelector('#authActionsContainer') || target;
      const displayName = user.fullName || user.username || 'User';
      const initial = displayName.trim().charAt(0).toUpperCase() || 'U';
      const safeName = escapeHtml(displayName);
      const adminLink = user.role === 'admin'
        ? '<a class="sk-btn sk-btn-accent" href="/admin.html"><i class="fa-solid fa-gauge-high"></i> <span class="btn-text">Admin</span></a>'
        : '';
      let finalAvatarUrl = user.avatarUrl;
      if (finalAvatarUrl && !finalAvatarUrl.startsWith('http') && !finalAvatarUrl.startsWith('/')) {
        finalAvatarUrl = '/' + finalAvatarUrl;
      }
      const avatarHtml = finalAvatarUrl
        ? `<img class="sk-user-avatar" src="${escapeHtml(finalAvatarUrl)}" alt="Avatar" style="object-fit: cover;" />`
        : `<span class="sk-user-avatar">${escapeHtml(initial)}</span>`;

      container.innerHTML = `
        <a class="sk-user-chip" href="/profile.html" title="Mở tài khoản">
          ${avatarHtml}
          <span class="sk-user-meta">
            <strong>${safeName}</strong>
            <small>${formatMoney(user.balance)}</small>
          </span>
        </a>
        ${adminLink}
        <a class="sk-btn sk-btn-soft" href="/nap-tien.html"><i class="fa-solid fa-wallet"></i> <span class="btn-text">Nạp tiền</span></a>
        <button class="sk-icon-btn sk-logout-btn" type="button" onclick="handleHeaderLogout()" aria-label="Đăng xuất">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      `;
      if (window.replaceIcons) window.replaceIcons(container);
    });
    
    // Also sync balance texts across the page
    document.querySelectorAll('.dynamic-sync-balance').forEach(el => {
      el.innerText = formatMoney(user.balance);
    });
    document.querySelectorAll('.dynamic-sync-username').forEach(el => {
      el.innerText = user.username || user.fullName || 'User';
    });
  }

  async function syncHeaderAuth() {
    const token = localStorage.getItem('token');
    const cachedUser = getStoredUser();

    if (cachedUser) renderHeaderUser(cachedUser);
    if (!token) {
      if (!cachedUser) renderHeaderLoggedOut();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false || !data.user) {
        clearAuthSession();
        renderHeaderLoggedOut();
        return;
      }

      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('isLoggedIn', 'true');
      renderHeaderUser(data.user);
    } catch {
      if (!cachedUser) renderHeaderLoggedOut();
    }
  }

  window.handleHeaderLogout = function() {
    clearAuthSession();
    renderHeaderLoggedOut();
    if (window.location.pathname.includes('profile.html') || window.location.pathname.includes('admin.html')) {
      window.location.href = '/index.html';
    }
  };

  window.getAbsoluteImageUrl = getAbsoluteImageUrl;
  window.showToast = showToast;
  window.triggerToast = showToast; // compatibility alias
  window.syncHeaderAuth = syncHeaderAuth;
  window.getStoredUser = getStoredUser;

  function hideGenericPreloader() {
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader && preloader.getAttribute('data-auto-hide') !== 'false') {
        preloader.classList.add('opacity-0');
        setTimeout(() => preloader.remove(), 500);
      }
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initMiniSidebar();
      syncHeaderAuth();
      hideGenericPreloader();
    });
  } else {
    initMiniSidebar();
    syncHeaderAuth();
    hideGenericPreloader();
  }

  window.downloadDeliveryResult = function() {
    const text = document.getElementById('deliveryResultText').value;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Thong_tin_tai_khoan.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
})();
