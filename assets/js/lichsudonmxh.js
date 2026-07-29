/* ═══════════════════════════════════════════════════════
   DG Store — Bulk Order Check JS Logic
   ═══════════════════════════════════════════════════════ */

let API_KEY = "";
let TRAMMMO_API_URL = "https://trammmo.com/api/v2";
const TỶ_GIÁ_USD_VND = 27000;

function updateHeaderCartCount() {
  if (typeof window.updateHeaderCartCount === "function") {
    window.updateHeaderCartCount();
    return;
  }
  const badge = document.getElementById("headerCartCount");
  if (!badge) return;

  let items = [];
  try {
    items = JSON.parse(localStorage.getItem("dgCart") || "[]");
  } catch (e) {
    items = [];
  }

  const quantity = (Array.isArray(items) ? items : []).filter(
    (item) => item && item.productSlug,
  ).length;

  badge.innerText = quantity > 99 ? "99+" : String(quantity);
  badge.classList.toggle("is-visible", quantity > 0);
}

function handleBulkCheck() {
  const rawInput = document.getElementById("bulk-orders-input").value.trim();
  const resultSection = document.getElementById("result-section-box");
  const tableWrapper = document.getElementById("status-table-wrapper");

  if (!rawInput) {
    if (window.showToast)
      window.showToast("Vui lòng nhập mã ID đơn hàng!", false);
    else alert("Vui lòng điền mã ID!");
    return;
  }
  const formattedOrders = rawInput
    .replace(/\n/g, ",")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .join(",");

  resultSection.style.display = "block";
  tableWrapper.innerHTML = `
        <div class="sk-loading-spinner-box">
            <div class="sk-spinner"></div>
            <p>Đang liên kết API trích xuất trạng thái đơn...</p>
        </div>
    `;

  if (!API_KEY) {
    setTimeout(() => {
      renderBulkTable({
        123456: {
          status: "In progress",
          start_count: "500",
          remains: "100",
          charge: "0.05",
        },
      });
    }, 800);
    return;
  }

  const statusFormData = new FormData();
  statusFormData.append("key", API_KEY);
  statusFormData.append("action", "status");
  statusFormData.append("orders", formattedOrders);

  fetch(TRAMMMO_API_URL, { method: "POST", body: statusFormData })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        tableWrapper.innerHTML = `<p style="padding: 20px; color: var(--danger); text-align: center; font-weight: bold;">Lỗi API: ${data.error}</p>`;
        return;
      }
      renderBulkTable(data);
    })
    .catch((error) => {
      tableWrapper.innerHTML = `<p style="padding: 20px; color: var(--danger); text-align: center; font-weight: bold;">Không thể kết nối đến máy chủ tra cứu!</p>`;
    });
}

function renderBulkTable(apiData) {
  let tableHTML = `
        <div class="sk-table-wrap">
            <table class="sk-table sk-history-table">
                <thead>
                    <tr>
                        <th>Mã Đơn</th>
                        <th>Trạng Thái</th>
                        <th>Số Lượng Gốc</th>
                        <th>Còn Lại</th>
                        <th>Chi Phí</th>
                    </tr>
                </thead>
                <tbody>
    `;
  for (const [orderId, info] of Object.entries(apiData)) {
    if (!info || info.error) {
      const errorMsg = info
        ? info.error || "Không tìm thấy thông tin đơn"
        : "Lỗi phản hồi";
      tableHTML += `
                <tr>
                    <td><strong>#${orderId}</strong></td>
                    <td colspan="4" style="color: var(--danger); font-style: italic; font-weight: 500;">Lỗi: ${errorMsg}</td>
                </tr>
            `;
      continue;
    }

    let badgeBg = "#6c757d";
    let badgeText = String(info.status).toUpperCase();
    switch (String(info.status).toLowerCase()) {
      case "pending":
        badgeBg = "var(--warning-soft)";
        badgeText = "⏳ PENDING";
        break;
      case "processing":
        badgeBg = "var(--accent-soft)";
        badgeText = "⚙️ PROCESSING";
        break;
      case "inprogress":
        badgeBg = "var(--brand-soft)";
        badgeText = "🔄 IN PROGRESS";
        break;
      case "completed":
        badgeBg = "var(--success-soft)";
        badgeText = "✅ COMPLETED";
        break;
      case "partial":
        badgeBg = "rgba(253, 126, 20, 0.15)";
        badgeText = "⚠️ PARTIAL";
        break;
      case "canceled":
        badgeBg = "var(--danger-soft)";
        badgeText = "❌ CANCELED";
        break;
    }
    const vndCharge = (parseFloat(info.charge) || 0) * TỶ_GIÁ_USD_VND;
    tableHTML += `
            <tr>
                <td><strong>#${orderId}</strong></td>
                <td><span class="badge-status" style="background-color: ${badgeBg}; border-color: ${badgeBg.replace("0.15", "0.3").replace("0.05", "0.2")};">${badgeText}</span></td>
                <td>${Number(info.start_count || 0).toLocaleString()}</td>
                <td>${Number(info.remains || 0).toLocaleString()}</td>
                <td style="color: var(--danger); font-weight: bold;">${Math.round(vndCharge).toLocaleString("vi-VN")} đ</td>
            </tr>
        `;
  }
  tableHTML += `</tbody></table></div>`;
  document.getElementById("status-table-wrapper").innerHTML = tableHTML;
}

function loadMxhHistory() {
  const wrapper = document.getElementById("recent-orders-wrapper");
  if (!wrapper) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem("dgMxhOrders") || "[]");
  } catch (e) {
    history = [];
  }

  if (!Array.isArray(history) || history.length === 0) {
    wrapper.innerHTML = `
            <p style="text-align: center; color: var(--muted); padding: 24px; font-style: italic; font-size: 13px;">
                <i class="fa-solid fa-folder-open" style="margin-right: 6px; font-size: 16px; opacity: 0.7;"></i> Bạn chưa có lịch sử đơn hàng nào gần đây trên trình duyệt này.
            </p>
        `;
    return;
  }

  let tableHTML = `
        <div class="sk-table-wrap">
            <table class="sk-table sk-history-table">
                <thead>
                    <tr>
                        <th>Mã Đơn</th>
                        <th>Gói Dịch Vụ</th>
                        <th>Số Lượng</th>
                        <th>Thành Tiền</th>
                        <th>Thời Gian</th>
                        <th style="text-align: right;">Thao Tác</th>
                    </tr>
                </thead>
                <tbody>
    `;

  history.forEach((item) => {
    const dateStr = item.timestamp
      ? new Date(item.timestamp).toLocaleString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        })
      : "---";

    tableHTML += `
            <tr>
                <td><strong>#${item.id}</strong></td>
                <td>
                    <div style="font-weight: 700; color: var(--text-bright);">${item.serviceName}</div>
                    <div class="desc-text" style="font-size: 11px; color: var(--muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        Link: ${item.link}
                    </div>
                </td>
                <td>${Number(item.quantity).toLocaleString()}</td>
                <td style="font-weight: 750; color: var(--accent-light);">${item.price}</td>
                <td style="color: var(--muted); font-size: 12px;">${dateStr}</td>
                <td style="text-align: right;">
                    <button class="sk-order-check-badge-btn" onclick="checkSingleOrder('${item.id}')">
                        <i class="fa-solid fa-rotate"></i> Kiểm tra
                    </button>
                </td>
            </tr>
        `;
  });

  tableHTML += `</tbody></table></div>`;
  wrapper.innerHTML = tableHTML;
}

window.checkSingleOrder = function (orderId) {
  const input = document.getElementById("bulk-orders-input");
  if (input) {
    input.value = orderId;
    handleBulkCheck();
    // Smooth scroll to results
    const resBox = document.getElementById("result-section-box");
    if (resBox) {
      resBox.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
};

window.clearMxhHistory = function () {
  if (
    confirm(
      "Bạn có chắc chắn muốn xóa toàn bộ lịch sử đơn hàng MXH đã lưu trên trình duyệt này?",
    )
  ) {
    localStorage.removeItem("dgMxhOrders");
    loadMxhHistory();
    if (window.showToast)
      window.showToast("Đã xóa sạch lịch sử đơn hàng!", true);
  }
};

function hideLichSuPreloader() {
  const preloader = document.getElementById("preloader");
  if (!preloader) return;
  preloader.classList.add("opacity-0");
  setTimeout(() => preloader.remove(), 400);
}

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    const shell = document.querySelector(".sk-shell");
    if (shell) shell.style.display = "none";

    if (window.showToast) {
      window.showToast(
        "Vui lòng đăng nhập trước khi xem lịch sử đơn MXH!",
        false,
      );
    } else {
      alert("Vui lòng đăng nhập trước khi xem lịch sử đơn MXH!");
    }
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1000);
    return;
  }

  // Fetch API Key from backend first
  const apiBase = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api");
  fetch(`${apiBase}/trammmo/key`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then((res) => res.json())
    .then((keyData) => {
      if (keyData && keyData.ok && keyData.apiKey) {
        API_KEY = keyData.apiKey;
        if (keyData.apiUrl) {
          TRAMMMO_API_URL = keyData.apiUrl;
        }
      }
    })
    .catch((err) => console.error("Lỗi tải cấu hình TramMMO:", err));

  updateHeaderCartCount();
  hideLichSuPreloader();
  loadMxhHistory();
});
