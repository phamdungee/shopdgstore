// Initialize Dark Theme by default for all visitors
(function () {
  try {
    const savedTheme = localStorage.getItem('theme') || localStorage.getItem('dg_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

(function () {
  function initMiniSidebar() {
    const nav = document.querySelector(".sk-sidebar-new");
    const topbarInner = document.querySelector(".sk-topbar-inner");

    if (!nav || !topbarInner || topbarInner.querySelector(".sk-menu-toggle")) {
      return;
    }

    document.body.classList.add("sk-has-mini-sidebar", "sk-sidebar-collapsed");
    nav.classList.add("sk-mini-sidebar");
    nav.setAttribute(
      "aria-label",
      nav.getAttribute("aria-label") || "Menu chính",
    );

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sk-menu-toggle";
    toggle.setAttribute("aria-label", "Mở menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';

    const backdrop = document.createElement("div");
    backdrop.className = "sk-sidebar-backdrop";
    backdrop.setAttribute("aria-hidden", "true");

    topbarInner.insertBefore(toggle, topbarInner.firstElementChild);
    const shell = document.querySelector(".sk-shell") || document.body;
    shell.appendChild(backdrop);

    function closeSidebar() {
      document.body.classList.remove("sk-sidebar-expanded");
      document.body.classList.add("sk-sidebar-collapsed");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Mở menu");
      backdrop.classList.remove("is-visible");
    }

    function openSidebar() {
      document.body.classList.add("sk-sidebar-expanded");
      document.body.classList.remove("sk-sidebar-collapsed");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Thu gọn menu");

      if (window.matchMedia("(max-width: 980px)").matches) {
        backdrop.classList.add("is-visible");
      }
    }

    function toggleSidebar() {
      if (document.body.classList.contains("sk-sidebar-expanded")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }

    toggle.addEventListener("click", toggleSidebar);
    backdrop.addEventListener("click", closeSidebar);

    nav.addEventListener("click", (event) => {
      if (
        event.target.closest(".nav-item") &&
        window.matchMedia("(max-width: 980px)").matches
      ) {
        closeSidebar();
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSidebar();
      }
    });

    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 980px)").matches) {
        backdrop.classList.remove("is-visible");
      } else if (document.body.classList.contains("sk-sidebar-expanded")) {
        backdrop.classList.add("is-visible");
      }
    });
    // Hook sidebar hover-expand triggers
    const sidebar = document.querySelector(".sk-sidebar-new");
    if (sidebar) {
      sidebar.addEventListener("mouseenter", () => {
        document.body.classList.add("sk-sidebar-hovered");
      });
      sidebar.addEventListener("mouseleave", () => {
        document.body.classList.remove("sk-sidebar-hovered");
      });
    }
  }

  // Unified Premium Dark Glass Toast System
  function showToast(message, isSuccess = true) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "sk-toast-stack";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = "sk-toast";

    // Customize style borders and glows
    if (!isSuccess) {
      toast.style.borderLeft = "4px solid var(--danger)";
      toast.style.boxShadow =
        "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px var(--danger-glow)";
    } else {
      toast.style.borderLeft = "4px solid var(--success)";
      toast.style.boxShadow =
        "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px var(--success-glow)";
    }

    const iconClass = isSuccess ? "fa-circle-check" : "fa-circle-xmark";
    const iconColor = isSuccess ? "var(--success)" : "var(--danger)";

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid ${iconClass}" style="color: ${iconColor}; font-size: 15px;"></i>
        <span>${message}</span>
      </div>
    `;

    container.appendChild(toast);
    if (window.replaceIcons) window.replaceIcons(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(40px)";
      toast.style.transition = "all 0.3s var(--ease-smooth)";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function getAbsoluteImageUrl(url) {
    if (!url) return "";
    let res = url;
    if (!(
      res.startsWith("http://") ||
      res.startsWith("https://") ||
      res.startsWith("/")
    )) {
      res = "/" + res;
    }
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(
      window.location.hostname,
    );
    const isNotServerPort = window.location.port !== "3000";
    const isLocalDev =
      window.location.protocol === "file:" || (isLocalHost && isNotServerPort);
    if (isLocalDev && !res.startsWith("http")) {
      res = "http://localhost:4000" + res;
    }
    return encodeURI(res);
  }

  // --- Unified Auth Logic ---
  const API_BASE =
    window.DG_API_BASE ||
    window.SKYNET_API_BASE ||
    (window.location.protocol === "file:"
      ? "http://localhost:4000/api"
      : "/api");

  function formatMoney(amount) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount || 0);
  }

  function getStoredUser() {
    try {
      const userStr = localStorage.getItem("user");
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  function clearAuthSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderHeaderLoggedOut() {
    const targets = document.querySelectorAll(
      "#headerAuthActions, .sk-auth-actions",
    );
    targets.forEach((target) => {
      // Don't overwrite the cart icon if it's in the same container. Just replace the auth part.
      // We will look for an element with id="authActionsContainer" inside, or just replace the whole thing if it's purely for auth.
      let container = target.querySelector("#authActionsContainer") || target;
      container.innerHTML =
        '<a class="sk-btn sk-btn-primary" href="/login.html"><i class="fa-solid fa-right-to-bracket"></i> <span class="btn-text">Đăng nhập / Đăng ký</span></a>';
      if (window.replaceIcons) window.replaceIcons(container);
    });
  }

  function renderHeaderUser(user) {
    const targets = document.querySelectorAll(
      "#headerAuthActions, .sk-auth-actions",
    );
    targets.forEach((target) => {
      let container = target.querySelector("#authActionsContainer") || target;
      const displayName = user.fullName || user.username || "User";
      const initial = displayName.trim().charAt(0).toUpperCase() || "U";
      const safeName = escapeHtml(displayName);
      const adminLink =
        user.role === "admin"
          ? '<a class="sk-btn sk-btn-accent sk-admin-btn" href="/admin.html"><i class="fa-solid fa-gauge-high"></i> <span class="btn-text">Admin</span></a>'
          : "";
      let finalAvatarUrl = user.avatarUrl;
      if (
        finalAvatarUrl &&
        !finalAvatarUrl.startsWith("http") &&
        !finalAvatarUrl.startsWith("/")
      ) {
        finalAvatarUrl = "/" + finalAvatarUrl;
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
        <a class="sk-btn sk-btn-soft sk-deposit-btn" href="/nap-tien.html"><i class="fa-solid fa-wallet"></i> <span class="btn-text">Nạp tiền</span></a>
        <button class="sk-icon-btn sk-logout-btn" type="button" onclick="handleHeaderLogout()" aria-label="Đăng xuất">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      `;
      if (window.replaceIcons) window.replaceIcons(container);
    });

    // Dynamically insert Admin Dashboard in sidebar drawer for admins
    if (user.role === "admin") {
      const sidebar = document.querySelector(".sk-sidebar-new");
      if (sidebar && !sidebar.querySelector('[href*="/admin.html"]')) {
        const adminSection = document.createElement("div");
        adminSection.className = "sk-sidebar-new-nav sk-sidebar-admin-section";
        adminSection.innerHTML = `
          <div class="sidebar-title">ADMIN</div>
          <a href="/admin.html" class="nav-item" data-tooltip="Dashboard">
            <i class="fa-solid fa-gauge-high"></i>
            <span class="nav-label">Dashboard</span>
          </a>
        `;
        sidebar.insertBefore(adminSection, sidebar.firstChild);
      }
    }

    // Also sync balance texts across the page
    document.querySelectorAll(".dynamic-sync-balance").forEach((el) => {
      el.innerText = formatMoney(user.balance);
    });
    document.querySelectorAll(".dynamic-sync-username").forEach((el) => {
      el.innerText = user.username || user.fullName || "User";
    });
  }

  async function syncHeaderAuth() {
    const token = localStorage.getItem("token");
    const cachedUser = getStoredUser();

    if (cachedUser) renderHeaderUser(cachedUser);
    if (!token) {
      if (!cachedUser) renderHeaderLoggedOut();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false || !data.user) {
        clearAuthSession();
        renderHeaderLoggedOut();
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("isLoggedIn", "true");
      renderHeaderUser(data.user);
    } catch {
      if (!cachedUser) renderHeaderLoggedOut();
    }
  }

  window.handleHeaderLogout = function () {
    clearAuthSession();
    renderHeaderLoggedOut();
    if (
      window.location.pathname.includes("profile.html") ||
      window.location.pathname.includes("admin.html")
    ) {
      window.location.href = "/index.html";
    }
  };

  window.getAbsoluteImageUrl = getAbsoluteImageUrl;
  window.showToast = showToast;
  window.triggerToast = showToast; // compatibility alias
  window.syncHeaderAuth = syncHeaderAuth;
  window.getStoredUser = getStoredUser;

  function hideGenericPreloader() {
    setTimeout(() => {
      const preloader = document.getElementById("preloader");
      if (preloader && preloader.getAttribute("data-auto-hide") !== "false") {
        preloader.classList.add("opacity-0");
        setTimeout(() => preloader.remove(), 500);
      }
    }, 400);
  }

  function updateHeaderCartCount() {
    const badge = document.getElementById("headerCartCount");
    const sidebarBadge = document.getElementById("sidebarCartCount");
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem("dgCart") || "[]");
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }
    const count = items.reduce(
      (sum, item) => sum + Number(item.quantity || 1),
      0,
    );

    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("is-visible", count > 0);
    }
    if (sidebarBadge) {
      sidebarBadge.textContent = count;
      sidebarBadge.classList.toggle("is-visible", count > 0);
    }
  }

  window.updateHeaderCartCount = updateHeaderCartCount;

  function preferredTheme() {
    const saved = localStorage.getItem("dg-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function applyTheme(theme) {
    const nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("dg-theme", nextTheme);
    document.querySelectorAll(".sk-theme-toggle").forEach((button) => {
      const isLight = nextTheme === "light";
      button.setAttribute("aria-label", isLight ? "Bật giao diện tối" : "Bật giao diện sáng");
      button.setAttribute("title", isLight ? "Giao diện tối" : "Giao diện sáng");
      button.innerHTML = `<i class="fa-solid ${isLight ? "fa-moon" : "fa-sun"}" aria-hidden="true"></i>`;
    });
  }

  function initThemeToggle() {
    applyTheme(preferredTheme());
    const topbarInner = document.querySelector(".sk-topbar-inner");
    let toggles = [...document.querySelectorAll(".sk-theme-toggle")];
    if (!toggles.length && topbarInner) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "sk-icon-btn sk-theme-toggle";
      const authActions = topbarInner.querySelector("#headerAuthActions, .sk-auth-actions");
      if (authActions && authActions.parentElement) authActions.parentElement.insertBefore(toggle, authActions);
      else topbarInner.appendChild(toggle);
      toggles = [toggle];
    }

    toggles.forEach((toggle) => {
      if (toggle.dataset.themeBound === "true") return;
      toggle.dataset.themeBound = "true";
      toggle.addEventListener("click", () => {
        applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
      });
    });
    applyTheme(document.documentElement.dataset.theme);
  }

  function initSupportPanel() {
    return; // Disabled corner support button as requested

    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "sk-support-launcher";
    launcher.setAttribute("aria-controls", "storefrontSupportPanel");
    launcher.setAttribute("aria-expanded", "false");
    launcher.innerHTML = '<i class="fa-solid fa-headset" aria-hidden="true"></i><span>Hỗ trợ</span>';

    const panel = document.createElement("section");
    panel.id = "storefrontSupportPanel";
    panel.className = "sk-support-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Hỗ trợ khách hàng");
    panel.innerHTML = `
      <div class="sk-support-head">
        <div><h2>Hỗ trợ khách hàng</h2><p>Mô tả vấn đề, đội ngũ DG Store sẽ tiếp nhận thông tin.</p></div>
        <button class="sk-icon-btn" type="button" data-support-close aria-label="Đóng hỗ trợ"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form class="sk-support-form">
        <label>Mã đơn hàng (nếu có)<input class="sk-input" name="orderCode" autocomplete="off" placeholder="Ví dụ: DG123456"></label>
        <label>Nội dung cần hỗ trợ<textarea name="message" required minlength="10" maxlength="1200" placeholder="Mô tả lỗi hoặc yêu cầu của bạn..."></textarea></label>
        <button class="sk-btn sk-btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Tạo yêu cầu hỗ trợ</button>
        <p class="sk-support-note">Thông tin sẽ được tạo thành nội dung liên hệ; không bao gồm mật khẩu hoặc dữ liệu đăng nhập sản phẩm.</p>
      </form>`;

    const setOpen = (open) => {
      panel.hidden = !open;
      launcher.setAttribute("aria-expanded", String(open));
      if (open) panel.querySelector("textarea")?.focus();
    };
    launcher.addEventListener("click", () => setOpen(panel.hidden));
    panel.querySelector("[data-support-close]").addEventListener("click", () => setOpen(false));
    panel.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const orderCode = form.elements.orderCode.value.trim();
      const message = form.elements.message.value.trim();
      const subject = orderCode ? `Hỗ trợ đơn hàng ${orderCode}` : "Yêu cầu hỗ trợ DG Store";
      const body = `${subject}\n\n${message}`;
      const token = localStorage.getItem("token");
      if (token) {
        const response = await fetch(`${API_BASE}/support/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: form.dataset.type === "warranty" ? "warranty" : "support",
            orderId: form.dataset.orderId || null,
            subject,
            message,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) {
          showToast(result.message || "Không thể tạo yêu cầu hỗ trợ.", false);
          return;
        }
        form.reset();
        delete form.dataset.orderId;
        delete form.dataset.type;
        setOpen(false);
        showToast("Đã gửi yêu cầu hỗ trợ thành công.");
        return;
      }
      const supportEmail = String(window.DG_SUPPORT_EMAIL || "").trim();
      if (supportEmail) {
        window.location.href = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      } else {
        try {
          await navigator.clipboard.writeText(body);
          showToast("Đã sao chép nội dung hỗ trợ. Hãy gửi qua kênh liên hệ của DG Store.");
        } catch {
          showToast("Chưa cấu hình kênh tiếp nhận hỗ trợ.", false);
        }
      }
    });

    window.openStorefrontSupport = (options = {}) => {
      formValue(panel, "orderCode", options.orderCode || options.orderId || "");
      formValue(panel, "message", options.message || "");
      const form = panel.querySelector("form");
      form.dataset.type = options.type === "warranty" ? "warranty" : "support";
      if (options.orderId) form.dataset.orderId = String(options.orderId);
      else delete form.dataset.orderId;
      setOpen(true);
    };

    document.body.append(panel, launcher);
  }

  function formValue(container, fieldName, value) {
    const field = container.querySelector(`[name="${fieldName}"]`);
    if (field) field.value = String(value || "");
  }

  window.isWarrantyEligible = function (order) {
    if (!order || order.status !== "completed") return false;
    const serverTimestamp = order.completedAt || order.completed_at || order.createdAt || order.created_at;
    const completedTime = new Date(serverTimestamp).getTime();
    if (!Number.isFinite(completedTime)) return false;
    const elapsed = Date.now() - completedTime;
    return elapsed >= 0 && elapsed <= 2 * 24 * 60 * 60 * 1000;
  };

  window.openWarrantyRequest = function (orderId, orderCode) {
    if (typeof window.openStorefrontSupport !== "function") return;
    window.openStorefrontSupport({
      orderId,
      orderCode: orderCode || orderId,
      type: "warranty",
      message: `Tôi cần yêu cầu bảo hành cho đơn hàng #${orderCode || orderId}.\nMô tả lỗi: `,
    });
  };

  window.debounce = function (func, wait) {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initThemeToggle();
      initMiniSidebar();
      syncHeaderAuth();
      hideGenericPreloader();
      updateHeaderCartCount();
      initSupportPanel();
    });
  } else {
    initThemeToggle();
    initMiniSidebar();
    syncHeaderAuth();
    hideGenericPreloader();
    updateHeaderCartCount();
    initSupportPanel();
  }

  window.downloadDeliveryResult = function () {
    const text = document.getElementById("deliveryResultText").value;
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Thong_tin_tai_khoan.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
})();
