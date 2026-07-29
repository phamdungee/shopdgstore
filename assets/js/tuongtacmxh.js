/* ═══════════════════════════════════════════════════════
   DG Store — Cyber Social Interaction JS Logic
   ═══════════════════════════════════════════════════════ */

let API_KEY = "";
let TRAMMMO_API_URL = "https://trammmo.com/api/v2";
const TỶ_GIÁ_USD_VND = 27000;

let originalServicesList = [];
let filteredServicesList = [];
let currentPage = 1;
const rowsPerPage = 15;

let globalSelectedMin = 10;
let globalSelectedMax = 500000;

let orderTrackingInterval = null;

// ── Global shared vars (set in initApp, used across all functions) ──
let apiBase = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api");
let token = localStorage.getItem("token") || "";

const categoriesData = {
  fb: [
    { id: "fb_cam_xuc", text: "Tăng Cảm Xúc" },
    { id: "fb_comment", text: "Tăng Comment" },
    { id: "fb_share", text: "Tăng Share" },
    { id: "fb_video", text: "Tăng View Video/Reels" },
    { id: "fb_story", text: "Tăng Views/Cảm Xúc Story" },
    { id: "fb_follow", text: "Tăng Follow Fanpage/Trang Cá Nhân" },
    { id: "fb_group", text: "Tăng Thành Viên Group" },
    { id: "fb_livestream", text: "Facebook Livestream 🔴" },
    { id: "fb_like_comment", text: "Tăng Like Bình luận" },
    { id: "fb_review", text: "Tăng Review Page" },
    { id: "fb_quoc_gia", text: "⭐Facebook Services Theo Quốc Gia" },
  ],
  tt: [
    { id: "tt_like_comment", text: "Tăng Like Comment" },
    { id: "tt_repost", text: "Tăng Lượt Đăng Lại" },
    { id: "tt_save", text: "Tăng Lượt Lưu Video" },
    { id: "tt_mat_live", text: "Tăng Mắt Livestream 🔴" },
    { id: "tt_like_live", text: "Tăng Like Livestream 🔴" },
    { id: "tt_comment_live", text: "Tăng Comment Live 🔴" },
    { id: "tt_pk_live", text: "Tăng Điểm PK 🔴" },
  ],
  ig: [
    { id: "ig_like", text: "Tăng Like" },
    { id: "ig_comment", text: "Tăng Comment" },
    { id: "ig_follow", text: "Tăng Follow" },
    { id: "ig_view", text: "Tăng View" },
    { id: "ig_share", text: "Tăng Share" },
    { id: "ig_story", text: "Instagram Story" },
    { id: "ig_save", text: "Lưu Bài Viết" },
    { id: "ig_repost", text: "Tăng Lượt Đăng Lại" },
    { id: "ig_channel", text: "Thành Viên Channel" },
    { id: "ig_live", text: "Tăng Mắt Livestream 🔴" },
    { id: "ig_quoc_gia", text: "Instagram Service Theo Quốc Gia" },
    { id: "ig_khac", text: "Khác" },
  ],
  yt: [
    { id: "yt_sub", text: "Tăng Người Đăng Ký Kênh" },
    { id: "yt_like", text: "Tăng Like Video" },
    { id: "yt_comment", text: "Tăng Bình Luận" },
    { id: "yt_share", text: "Tăng Share" },
    { id: "yt_view", text: "Tăng Views" },
    { id: "yt_quoc_gia", text: "Youtube Views Theo Quốc Gia" },
    { id: "yt_hours", text: "Watch Hours" },
    { id: "yt_live", text: "Live Stream" },
  ],
};

const backupMockData = [
  {
    service: 100,
    name: "Facebook Like Gói Tốc Độ Cao 👍",
    rate: "0.12",
    min: "50",
    max: "10000",
    type: "Default",
    platform: "Facebook",
    category: "fb_cam_xuc",
  },
  {
    service: 200,
    name: "TikTok Tăng Follow Siêu Tốc 🚀 Gói Việt",
    rate: "0.45",
    min: "100",
    max: "50000",
    type: "Default",
    platform: "TikTok",
    category: "tt_like_comment",
  },
  {
    service: 300,
    name: "Instagram Tăng Bình Luận Tùy Biến 📝",
    rate: "0.85",
    min: "10",
    max: "5000",
    type: "Custom Comments",
    platform: "Instagram",
    category: "ig_comment",
  },
  {
    service: 400,
    name: "YouTube Tăng Người Đăng Ký Trọn Gói 💎",
    rate: "12.5",
    min: "1",
    max: "1",
    type: "Package",
    platform: "YouTube",
    category: "yt_sub",
  },
];

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

function hideTuongTacPreloader() {
  const preloader = document.getElementById("preloader");
  if (!preloader) return;
  preloader.classList.add("opacity-0");
  setTimeout(() => preloader.remove(), 400);
}

function displayNoApiWarning(customMessage) {
  const container = document.getElementById("table-container");
  const defaultMsg =
    "Hệ thống đang bảo trì dịch vụ tương tác MXH hoặc chưa cấu hình kết nối. Vui lòng quay lại sau!";
  const messageToShow = customMessage || defaultMsg;

  if (container) {
    container.innerHTML = `
            <div style="text-align: center; padding: 48px; color: var(--muted); background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--line);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: var(--warning); display: block; margin-bottom: 16px;"></i>
                <h3 style="color: var(--text-bright); font-size: 15px; font-weight: 800; margin-bottom: 8px;">DỊCH VỤ ĐANG TẠM NGƯNG</h3>
                <p style="margin: 0; font-size: 13px; color: var(--text-sub); line-height: 1.5;">${messageToShow}</p>
            </div>
        `;
  }
  const paginator = document.getElementById("pagination-wrapper");
  if (paginator) paginator.style.display = "none";
  hideTuongTacPreloader();
}

function initApp() {
  // Refresh globals so every helper function has access
  token = localStorage.getItem("token") || "";
  apiBase = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api");

  if (!token) {
    const shell = document.querySelector(".sk-shell");
    if (shell) shell.style.display = "none";

    if (window.showToast) {
      window.showToast(
        "Vui lòng đăng nhập trước khi sử dụng dịch vụ tương tác MXH!",
        false,
      );
    } else {
      alert("Vui lòng đăng nhập trước khi sử dụng dịch vụ tương tác MXH!");
    }
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1000);
    return;
  }

  // Fetch API Key from backend first
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

        fetchBalance();
        updateHeaderCartCount();

        const formData = new FormData();
        formData.append("key", API_KEY);
        formData.append("action", "services");

        fetch(TRAMMMO_API_URL, { method: "POST", body: formData })
          .then((response) => response.json())
          .then((data) => {
            if (
              data &&
              !data.error &&
              (Array.isArray(data) || typeof data === "object")
            ) {
              originalServicesList = Array.isArray(data)
                ? data
                : Object.values(data);

              // Sanitize product names by removing trailing /d, /đ, /D, /Đ and redundant limit tokens like | 50K |
              originalServicesList = originalServicesList.map((item) => {
                if (item && item.name) {
                  item.name = item.name.replace(/\/\s*[dđDĐ]\b/g, "");
                  item.name = item.name.replace(
                    /\s*\|\s*\d+\s*[KkMm]\s*(?=\|)/g,
                    "",
                  );
                  item.name = item.name.trim();
                }
                return item;
              });

              filteredServicesList = [...originalServicesList];
              renderTablePage();
              hideTuongTacPreloader();
            } else {
              // API key exists but API returned error
              displayNoApiWarning(
                data
                  ? data.error || "Lỗi phản hồi từ nhà cung cấp API"
                  : "Lỗi kết nối API",
              );
            }
          })
          .catch((error) => {
            displayNoApiWarning(
              "Không thể kết nối đến nhà cung cấp dịch vụ tương tác.",
            );
          });
      } else {
        // No API Key in database
        displayNoApiWarning(
          "Quản trị viên chưa cấu hình kết nối API cho dịch vụ này.",
        );
      }
    })
    .catch((err) => {
      console.error("Lỗi tải cấu hình TramMMO:", err);
      displayNoApiWarning("Không thể đồng bộ cấu hình từ hệ thống.");
    });

  document
    .getElementById("orderPanel")
    ?.addEventListener("input", updateJsonPreview);
}

function fetchBalance() {
  if (!API_KEY) return;
  const balanceFormData = new FormData();
  balanceFormData.append("key", API_KEY);
  balanceFormData.append("action", "balance");

  fetch(TRAMMMO_API_URL, { method: "POST", body: balanceFormData })
    .then((response) => response.json())
    .then((data) => {
      if (data && data.balance) {
        const usdBalance = parseFloat(data.balance) || 0;
        const vndBalance = usdBalance * TỶ_GIÁ_USD_VND;
        const vndEl = document.getElementById("account-balance-vnd");
        const usdEl = document.getElementById("account-balance-usd");
        if (vndEl)
          vndEl.innerText =
            Math.round(vndBalance).toLocaleString("vi-VN") + " đ";
        if (usdEl)
          usdEl.innerText = `($${usdBalance.toFixed(2)} ${data.currency})`;
      }
    })
    .catch((e) => {});
}

function switchMainTab(tabId) {
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".main-tab-btn")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById(`main-tab-${tabId}`).classList.add("active");
  document.getElementById(`main-tab-${tabId}-btn`).classList.add("active");
}

function updateCategoryDropdown() {
  const platformSelect = document.getElementById("filter-platform").value;
  const categoryInput = document.getElementById("filter-category");
  const categoryMenu = document.getElementById("category-dropdown-menu");
  const categoryBtn = document.getElementById("category-dropdown-btn");

  if (!categoryInput || !categoryMenu || !categoryBtn) return;

  // Reset dropdown content and value
  categoryMenu.innerHTML = "";
  categoryInput.value = "";

  let iconHtml =
    '<span class="category-option-icon"><i class="fa-solid fa-list"></i></span>';
  if (platformSelect === "fb") {
    iconHtml =
      '<span class="category-option-icon"><img src="assets/img/ảnh sản phẩm/logo-facebook-vong-tron-xanh-duong-voi-chu-f-mau-trang_1131634-495_11zon.webp" style="width:16px; height:16px; border-radius:50%; object-fit:cover;"></span>';
  } else if (platformSelect === "tt") {
    iconHtml =
      '<span class="category-option-icon"><img src="assets/img/ảnh sản phẩm/logo-tiktok_705838-12827_11zon.webp" style="width:16px; height:16px; border-radius:50%; object-fit:cover;"></span>';
  } else if (platformSelect === "ig") {
    iconHtml =
      '<span class="category-option-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:inline-block; vertical-align:middle;"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></span>';
  } else if (platformSelect === "yt") {
    iconHtml =
      '<span class="category-option-icon"><img src="assets/img/ảnh sản phẩm/youtube-logo-youtube-icon-transparent-free-png.webp" style="width:16px; height:16px; border-radius:3px; object-fit:contain;"></span>';
  }

  if (platformSelect && categoriesData[platformSelect]) {
    categoryBtn.disabled = false;

    // "Tất cả danh mục" item
    const allItem = document.createElement("div");
    allItem.className = "custom-dropdown-item active";
    allItem.setAttribute("data-value", "");
    allItem.innerHTML = `
            ${iconHtml}
            <span class="category-option-text">Tất cả danh mục</span>
        `;
    categoryMenu.appendChild(allItem);

    // Specific category items
    categoriesData[platformSelect].forEach((cat) => {
      const catItem = document.createElement("div");
      catItem.className = "custom-dropdown-item";
      catItem.setAttribute("data-value", cat.id);
      catItem.innerHTML = `
                ${iconHtml}
                <span class="category-option-text">${cat.text}</span>
            `;
      categoryMenu.appendChild(catItem);
    });

    // Set button selected value
    categoryBtn.querySelector(".dropdown-selected-val").innerHTML = `
            ${iconHtml}
            <span class="category-option-text">Tất cả danh mục</span>
        `;

    // Add event listeners to category items
    const catItems = categoryMenu.querySelectorAll(".custom-dropdown-item");
    catItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        catItems.forEach((i) => i.classList.remove("active"));
        item.classList.add("active");

        const val = item.getAttribute("data-value");
        categoryInput.value = val;

        categoryBtn.querySelector(".dropdown-selected-val").innerHTML =
          item.innerHTML;
        categoryBtn.parentElement.classList.remove("is-open");

        filterServices();
      });
    });
  } else {
    categoryBtn.disabled = true;
    categoryBtn.querySelector(".dropdown-selected-val").innerHTML = `
            <span class="category-option-icon"><i class="fa-solid fa-list"></i></span>
            <span class="category-option-text">-- Chọn nền tảng trước --</span>
        `;
  }

  filterServices();
}

function getGroupKey(item) {
  if (!item) return "khac";
  if (item.category && item.category.includes("_")) return item.category;

  const platform = (item.platform || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();
  const name = (item.name || "").toLowerCase();

  // Regex boundaries matching for safety to avoid matching substring inside words (e.g. "ig" inside "gift", "tt" inside "button")
  const fbRegex = /\b(facebook|fb)\b/i;
  const ttRegex = /\b(tiktok|tt)\b/i;
  const igRegex = /\b(instagram|ig)\b/i;
  const ytRegex = /\b(youtube|yt|ytb)\b/i;

  const isFb =
    fbRegex.test(platform) || fbRegex.test(cat) || fbRegex.test(name);
  const isTt =
    ttRegex.test(platform) || ttRegex.test(cat) || ttRegex.test(name);
  const isIg =
    igRegex.test(platform) || igRegex.test(cat) || igRegex.test(name);
  const isYt =
    ytRegex.test(platform) || ytRegex.test(cat) || ytRegex.test(name);

  if (isFb) {
    if (
      cat.includes("cảm xúc") ||
      cat.includes("like") ||
      cat.includes("tym") ||
      cat.includes("tim") ||
      name.includes("like") ||
      name.includes("cảm xúc") ||
      name.includes("tym")
    ) {
      if (
        cat.includes("bình luận") ||
        cat.includes("comment") ||
        name.includes("bình luận") ||
        name.includes("comment")
      )
        return "fb_like_comment";
      return "fb_cam_xuc";
    }
    if (
      cat.includes("bình luận") ||
      cat.includes("comment") ||
      name.includes("bình luận") ||
      name.includes("comment")
    )
      return "fb_comment";
    if (
      cat.includes("share") ||
      cat.includes("chia sẻ") ||
      name.includes("share") ||
      name.includes("chia sẻ")
    )
      return "fb_share";
    if (
      cat.includes("video") ||
      cat.includes("reels") ||
      cat.includes("view") ||
      cat.includes("lượt xem") ||
      name.includes("video") ||
      name.includes("reels") ||
      name.includes("view")
    )
      return "fb_video";
    if (cat.includes("story") || name.includes("story")) return "fb_story";
    if (
      cat.includes("follow") ||
      cat.includes("sub") ||
      cat.includes("theo dõi") ||
      cat.includes("đăng ký") ||
      cat.includes("fanpage") ||
      name.includes("follow") ||
      name.includes("theo dõi") ||
      name.includes("sub") ||
      name.includes("fanpage")
    )
      return "fb_follow";
    if (
      cat.includes("group") ||
      cat.includes("nhóm") ||
      cat.includes("thành viên") ||
      name.includes("group") ||
      name.includes("nhóm") ||
      name.includes("thành viên")
    )
      return "fb_group";
    if (
      cat.includes("live") ||
      cat.includes("trực tiếp") ||
      name.includes("live") ||
      name.includes("trực tiếp")
    )
      return "fb_livestream";
    if (
      cat.includes("review") ||
      cat.includes("đánh giá") ||
      name.includes("review") ||
      name.includes("đánh giá")
    )
      return "fb_review";
    if (
      cat.includes("quốc gia") ||
      cat.includes("country") ||
      cat.includes("việt") ||
      cat.includes("ngoại") ||
      name.includes("quốc gia") ||
      name.includes("country")
    )
      return "fb_quoc_gia";
    return "fb_cam_xuc";
  }

  if (isTt) {
    if (
      cat.includes("like comment") ||
      cat.includes("tim bình luận") ||
      name.includes("like comment") ||
      name.includes("tim bình luận") ||
      name.includes("tym bình luận")
    )
      return "tt_like_comment";
    if (
      cat.includes("repost") ||
      cat.includes("đăng lại") ||
      name.includes("repost") ||
      name.includes("đăng lại")
    )
      return "tt_repost";
    if (
      cat.includes("save") ||
      cat.includes("lưu") ||
      name.includes("save") ||
      name.includes("lưu")
    )
      return "tt_save";
    if (
      cat.includes("mắt") ||
      cat.includes("view live") ||
      name.includes("mắt") ||
      name.includes("view live") ||
      name.includes("mắt live")
    )
      return "tt_mat_live";
    if (
      cat.includes("like live") ||
      cat.includes("tim live") ||
      name.includes("like live") ||
      name.includes("tim live") ||
      name.includes("tym live")
    )
      return "tt_like_live";
    if (
      cat.includes("comment live") ||
      cat.includes("cmt live") ||
      name.includes("comment live") ||
      name.includes("cmt live")
    )
      return "tt_comment_live";
    if (cat.includes("pk") || name.includes("pk")) return "tt_pk_live";
    return "tt_like_comment";
  }

  if (isIg) {
    if (
      cat.includes("comment") ||
      cat.includes("bình luận") ||
      name.includes("comment") ||
      name.includes("bình luận")
    )
      return "ig_comment";
    if (
      cat.includes("follow") ||
      cat.includes("theo dõi") ||
      cat.includes("sub") ||
      name.includes("follow") ||
      name.includes("theo dõi") ||
      name.includes("sub")
    )
      return "ig_follow";
    if (
      cat.includes("view") ||
      cat.includes("xem") ||
      name.includes("view") ||
      name.includes("xem")
    )
      return "ig_view";
    if (
      cat.includes("share") ||
      cat.includes("chia sẻ") ||
      name.includes("share") ||
      name.includes("chia sẻ")
    )
      return "ig_share";
    if (cat.includes("story") || name.includes("story")) return "ig_story";
    if (
      cat.includes("save") ||
      cat.includes("lưu") ||
      name.includes("save") ||
      name.includes("lưu")
    )
      return "ig_save";
    if (
      cat.includes("repost") ||
      cat.includes("đăng lại") ||
      name.includes("repost") ||
      name.includes("đăng lại")
    )
      return "ig_repost";
    if (cat.includes("channel") || name.includes("channel"))
      return "ig_channel";
    if (cat.includes("live") || name.includes("live")) return "ig_live";
    if (
      cat.includes("quốc gia") ||
      cat.includes("country") ||
      name.includes("quốc gia") ||
      name.includes("country")
    )
      return "ig_quoc_gia";
    if (
      cat.includes("like") ||
      cat.includes("tym") ||
      cat.includes("tim") ||
      name.includes("like") ||
      name.includes("tym") ||
      name.includes("tim")
    )
      return "ig_like";
    return "ig_khac";
  }

  if (isYt) {
    if (
      cat.includes("sub") ||
      cat.includes("đăng ký") ||
      name.includes("sub") ||
      name.includes("đăng ký")
    )
      return "yt_sub";
    if (
      cat.includes("like") ||
      cat.includes("thích") ||
      name.includes("like") ||
      name.includes("thích")
    )
      return "yt_like";
    if (
      cat.includes("comment") ||
      cat.includes("bình luận") ||
      name.includes("comment") ||
      name.includes("bình luận")
    )
      return "yt_comment";
    if (
      cat.includes("share") ||
      cat.includes("chia sẻ") ||
      name.includes("share") ||
      name.includes("chia sẻ")
    )
      return "yt_share";
    if (
      cat.includes("quốc gia") ||
      cat.includes("country") ||
      name.includes("quốc gia") ||
      name.includes("country")
    )
      return "yt_quoc_gia";
    if (
      cat.includes("hour") ||
      cat.includes("giờ xem") ||
      name.includes("hour") ||
      name.includes("giờ xem")
    )
      return "yt_hours";
    if (
      cat.includes("live") ||
      cat.includes("stream") ||
      name.includes("live") ||
      name.includes("stream")
    )
      return "yt_live";
    if (
      cat.includes("view") ||
      cat.includes("xem") ||
      name.includes("view") ||
      name.includes("xem")
    )
      return "yt_view";
    return "yt_view";
  }

  return "khac";
}

function filterServices() {
  const selectedPlatform = document.getElementById("filter-platform").value;
  const selectedCategory = document.getElementById("filter-category").value;
  const keyword = document
    .getElementById("search-keyword")
    .value.trim()
    .toLowerCase();

  filteredServicesList = originalServicesList.filter((item) => {
    if (!item || !item.name) return false;
    const itemGroupKey = getGroupKey(item);
    const info = getCategoryLabel(itemGroupKey);
    const matchPlatform =
      !selectedPlatform || info.platform === selectedPlatform;
    const matchCategory =
      !selectedCategory || itemGroupKey === selectedCategory;
    const matchKeyword =
      !keyword ||
      item.service.toString().includes(keyword) ||
      item.name.toLowerCase().includes(keyword);
    return matchPlatform && matchCategory && matchKeyword;
  });

  currentPage = 1;
  renderTablePage();
}

function renderTablePage() {
  const container = document.getElementById("table-container");
  const paginator = document.getElementById("pagination-wrapper");

  if (filteredServicesList.length === 0) {
    container.innerHTML =
      '<div class="no-result">Không tìm thấy gói dịch vụ phù hợp!</div>';
    paginator.style.display = "none";
    return;
  }

  const totalPages = Math.ceil(filteredServicesList.length / rowsPerPage);
  paginator.style.display = "flex";
  document.getElementById("page-info-display").innerText =
    `Trang ${currentPage} / ${totalPages}`;
  document.getElementById("btn-prev-page").disabled = currentPage === 1;
  document.getElementById("btn-next-page").disabled =
    currentPage === totalPages;

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedItems = filteredServicesList.slice(startIndex, endIndex);

  const selectedServiceId = document.getElementById("order-service-id").value;

  let tableHTML = `
        <div class="sk-table-wrap">
            <table class="sk-table">
                <thead>
                    <tr>
                        <th style="width: 80px;">Mã ID</th>
                        <th>Tên Gói Dịch Vụ</th>
                        <th style="width: 160px;">Giá sl 1000</th>
                        <th style="width: 140px;">Tối thiểu / Tối đa</th>
                    </tr>
                </thead>
                <tbody>
    `;

  paginatedItems.forEach((item) => {
    if (!item || !item.service) return;
    const originalUsdRate = parseFloat(item.rate) || 0;
    const calculatedVndRate = (originalUsdRate + 0.36) * TỶ_GIÁ_USD_VND;
    const infoDescription = `⚡ Tốc độ: Tối đa • 🕒 Bắt đầu: 0-1 giờ • 💎 Chất lượng: Mix • ⚠️ Lưu ý: Không mua trùng link khi đơn cũ chưa xong.`;
    const isSelectedClass =
      selectedServiceId === String(item.service) ? ' class="is-selected"' : "";

    tableHTML += `
            <tr${isSelectedClass} onclick="handleRowSelection(this, '${item.service}', \`${item.name}\`, ${calculatedVndRate}, '${item.min}', '${item.max}', ${item.refill || false}, ${item.cancel || false}, '${item.type || "Default"}')">
                <td><strong style="color: var(--brand-light);">${item.service}</strong></td>
                <td>
                    <strong style="color: var(--text-bright);">${item.name}</strong>
                    <br><span class="desc-text">${infoDescription}</span>
                </td>
                <td style="color: var(--success); font-weight: 800; font-size: 15px;">${Math.round(calculatedVndRate).toLocaleString("vi-VN")} đ</td>
                <td style="color: var(--text-sub); font-weight: 500;">${Number(item.min).toLocaleString()} / ${Number(item.max).toLocaleString()}</td>
            </tr>
        `;
  });

  tableHTML += `</tbody></table></div>`;
  container.innerHTML = tableHTML;
}

function changePage(direction) {
  currentPage += direction;
  renderTablePage();
}

function handleRowSelection(
  rowEl,
  serviceId,
  name,
  calculatedVndRate,
  min,
  max,
  refill,
  cancel,
  type,
) {
  // Clear existing selection class
  const tbody = rowEl.closest("tbody");
  tbody
    .querySelectorAll("tr")
    .forEach((tr) => tr.classList.remove("is-selected"));
  rowEl.classList.add("is-selected");

  handleRowClick(
    serviceId,
    name,
    calculatedVndRate,
    min,
    max,
    refill,
    cancel,
    type,
  );

  // Scroll to order creation panel on mobile/tablet (width <= 1024px)
  if (window.innerWidth <= 1024) {
    const orderPanel = document.getElementById("orderPanel");
    if (orderPanel) {
      orderPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function handleRowClick(
  serviceId,
  name,
  calculatedVndRate,
  min,
  max,
  refill,
  cancel,
  type,
) {
  document.getElementById("order-service-display").value =
    `[ID: ${serviceId}] - ${name}`;
  document.getElementById("order-service-id").value = serviceId;
  document.getElementById("order-service-rate").value = calculatedVndRate;
  document.getElementById("order-service-type").value = type;

  globalSelectedMin = parseInt(min) || 10;
  globalSelectedMax = parseInt(max) || 500000;

  document.getElementById("meta-type").innerText = type || "Default";
  document.getElementById("meta-refill").innerText = refill
    ? "Bảo Hành Hoàn Tiền ✅"
    : "Không Bảo Hành 🛡️";
  document.getElementById("meta-cancel").innerText = "Không hỗ trợ hủy đơn";

  generateDynamicFormFields(type);
  calculateTotal();
  updateJsonPreview();
}

function generateDynamicFormFields(type) {
  const container = document.getElementById("dynamic-fields-container");
  container.innerHTML = "";

  const noQuantityTypes = [
    "Package",
    "Custom Comments Package",
    "Comment Replies",
    "Subscriptions",
  ];
  const isNeedQuantity = !noQuantityTypes.includes(type);

  let fieldsHTML = '<div class="dynamic-field-block">';

  if (isNeedQuantity) {
    fieldsHTML += `
            <div class="sk-field">
                <label id="label-quantity">Số Lượng * (Tối thiểu: ${globalSelectedMin.toLocaleString()} - Tối đa: ${globalSelectedMax.toLocaleString()})</label>
                <input class="sk-input" type="number" id="order-quantity" value="${globalSelectedMin}" oninput="calculateTotal(); updateJsonPreview();">
            </div>
        `;
  }

  switch (type) {
    case "Custom Comments":
    case "Custom Comments Package":
      fieldsHTML += `<div class="sk-field"><label>Nội dung bình luận (Mỗi hàng 1 bình luận) *</label><textarea class="sk-input" id="param-comments" rows="3" placeholder="Nhập văn bản bình luận..."></textarea></div>`;
      break;
    case "SEO":
      fieldsHTML += `<div class="sk-field"><label>Từ khóa SEO (Ngăn cách bằng dấu phẩy) *</label><input class="sk-input" type="text" id="param-keywords" placeholder="seo, marketing, digital"></div>`;
      break;
    case "Poll":
      fieldsHTML += `<div class="sk-field"><label>Vị trí câu trả lời cần chọn (1, 2, 3...) *</label><input class="sk-input" type="number" id="param-answer-number" value="1" min="1"></div>`;
      break;
    case "Comment Replies":
      fieldsHTML += `
                <div class="sk-field"><label>Username của comment gốc *</label><input class="sk-input" type="text" id="param-comment-replies-username" placeholder="comment_author"></div>
                <div class="sk-field"><label>Nội dung phản hồi *</label><textarea class="sk-input" id="param-comment-replies-comments" rows="2" placeholder="Đồng ý!"></textarea></div>
            `;
      break;
  }

  fieldsHTML += "</div>";
  container.innerHTML = fieldsHTML;
}

function calculateTotal() {
  const rateVnd =
    parseFloat(document.getElementById("order-service-rate").value) || 0;
  const type = document.getElementById("order-service-type").value;
  const noQuantityTypes = [
    "Package",
    "Custom Comments Package",
    "Comment Replies",
    "Subscriptions",
  ];

  let total = 0;
  if (noQuantityTypes.includes(type)) {
    total = rateVnd;
  } else {
    const quantityInput = document.getElementById("order-quantity");
    const quantity = quantityInput ? parseInt(quantityInput.value) || 0 : 0;
    total = (rateVnd * quantity) / 1000;
  }
  document.getElementById("order-total").innerText =
    Math.round(total).toLocaleString("vi-VN") + " đ";
}

function switchLinkMode(mode) {
  document.getElementById("tab-one").classList.toggle("active", mode === "one");
  document
    .getElementById("tab-many")
    .classList.toggle("active", mode === "many");
  const fieldWrapper = document.getElementById("link-field-wrapper");
  if (mode === "one") {
    fieldWrapper.innerHTML =
      '<input class="sk-input" type="text" id="order-link" placeholder="Nhập liên kết hoặc UID..." oninput="updateJsonPreview()">';
  } else {
    fieldWrapper.innerHTML =
      '<textarea class="sk-input" id="order-link" rows="3" placeholder="Mỗi dòng nhập 1 liên kết / UID..." oninput="updateJsonPreview()"></textarea>';
  }
  updateJsonPreview();
}

async function handlePasteClipboard(elementId) {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById(elementId).value = text;
    updateJsonPreview();
  } catch (err) {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );
    const msg = isMobile
      ? 'Không thể tự động truy cập Clipboard. Vui lòng nhấn giữ vào ô nhập và chọn "Dán" (Paste).'
      : "Vui lòng dùng tổ hợp phím Ctrl+V để dán.";
    if (window.showToast) {
      window.showToast(msg, false);
    } else {
      alert(msg);
    }
  }
}

function buildCurrentPayload() {
  const serviceId = document.getElementById("order-service-id").value;
  const type = document.getElementById("order-service-type").value;
  const link = document.getElementById("order-link")
    ? document.getElementById("order-link").value.trim()
    : "";

  if (!serviceId) return null;

  let payload = {
    key: API_KEY || "demo_key",
    action: "add",
    service: parseInt(serviceId),
    link: link || "chưa nhập link",
  };

  const noQuantityTypes = [
    "Package",
    "Custom Comments Package",
    "Comment Replies",
    "Subscriptions",
  ];
  if (!noQuantityTypes.includes(type)) {
    const qtyInput = document.getElementById("order-quantity");
    payload.quantity = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
  }
  return payload;
}

function updateJsonPreview() {
  const currentPayload = buildCurrentPayload();
  const previewBox = document.getElementById("json-preview");
  if (!currentPayload) {
    previewBox.innerText =
      '{\n  "message": "Vui lòng chọn 1 gói dịch vụ từ bảng."\n}';
    return;
  }

  let displayPayload = { ...currentPayload };
  delete displayPayload.key;

  previewBox.innerText = JSON.stringify(displayPayload, null, 2);
}

function reportMaintenanceToAdmin(
  serviceId,
  serviceName,
  link,
  quantity,
  errorMsg,
) {
  const token = localStorage.getItem("token");
  const apiBase = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api");
  if (!token) return;

  fetch(`${apiBase}/telegram/alert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      serviceId,
      serviceName,
      link,
      quantity,
      errorDetail: errorMsg,
    }),
  }).catch((err) =>
    console.error("Failed to report maintenance to admin:", err),
  );
}

function processOrderSubmit() {
  const currentPayload = buildCurrentPayload();
  if (!currentPayload) {
    if (window.showToast) {
      window.showToast("Vui lòng chọn gói dịch vụ ở bảng trước!", false);
    } else {
      alert("Vui lòng chọn gói dịch vụ ở bảng trước!");
    }
    return;
  }
  if (!currentPayload.link || currentPayload.link === "chưa nhập link") {
    if (window.showToast) {
      window.showToast("Vui lòng nhập liên kết mục tiêu!", false);
    } else {
      alert("Vui lòng nhập liên kết mục tiêu!");
    }
    return;
  }

  let alertPayload = { ...currentPayload };
  delete alertPayload.key;

  if (!API_KEY) {
    const fakeOrderId = Math.floor(100000 + Math.random() * 900000);
    if (window.showToast) {
      window.showToast(
        `[CHẠY THỬ NGHIỆM] Tạo đơn thành công! Mã hóa đơn: #${fakeOrderId}`,
        true,
      );
    } else {
      alert(
        `[CHẠY THỬ NGHIỆM]\nTạo đơn thành công! Khởi chạy trình theo dõi đơn #${fakeOrderId}\n\nForm gửi đi (Đã ẩn key):\n` +
          JSON.stringify(alertPayload, null, 2),
      );
    }

    const serviceName = document.getElementById("order-service-display").value;
    const totalText = document.getElementById("order-total").innerText;
    saveOrderToHistory(
      fakeOrderId,
      serviceName,
      currentPayload.link,
      currentPayload.quantity || 0,
      totalText,
    );

    startAutoPollingOrder(fakeOrderId);
    return;
  }

  const orderFormData = new FormData();
  for (const [k, v] of Object.entries(currentPayload)) {
    orderFormData.append(k, v);
  }

  fetch(TRAMMMO_API_URL, { method: "POST", body: orderFormData })
    .then((response) => response.json())
    .then((data) => {
      if (data && data.order) {
        if (window.showToast) {
          window.showToast(
            `Đặt hàng thành công! Mã hóa đơn: #${data.order}`,
            true,
          );
        } else {
          alert(
            `Đặt hàng thành công! Mã hóa đơn: #${data.order}\n\nForm gửi đi (Đã ẩn key):\n` +
              JSON.stringify(alertPayload, null, 2),
          );
        }

        const serviceName = document.getElementById(
          "order-service-display",
        ).value;
        const totalText = document.getElementById("order-total").innerText;
        saveOrderToHistory(
          data.order,
          serviceName,
          currentPayload.link,
          currentPayload.quantity || 0,
          totalText,
        );

        startAutoPollingOrder(data.order);
      } else {
        if (window.showToast) {
          window.showToast("Đặt hàng thất bại, server đang bảo trì", false);
        } else {
          alert("Đặt hàng thất bại, server đang bảo trì");
        }
        const serviceName = document.getElementById(
          "order-service-display",
        ).value;
        const qtyInput = document.getElementById("order-quantity");
        const quantityVal = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
        reportMaintenanceToAdmin(
          currentPayload.service,
          serviceName,
          currentPayload.link,
          quantityVal,
          data.error || "API không trả về mã đơn hàng",
        );
      }
    })
    .catch((err) => {
      if (window.showToast) {
        window.showToast("Đặt hàng thất bại, server đang bảo trì", false);
      } else {
        alert("Đặt hàng thất bại, server đang bảo trì");
      }
      const serviceName = document.getElementById(
        "order-service-display",
      ).value;
      const qtyInput = document.getElementById("order-quantity");
      const quantityVal = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
      reportMaintenanceToAdmin(
        currentPayload.service,
        serviceName,
        currentPayload.link,
        quantityVal,
        err.message || "Lỗi kết nối mạng",
      );
    });
}

function startAutoPollingOrder(orderId) {
  if (orderTrackingInterval) clearInterval(orderTrackingInterval);

  const trackBox = document.getElementById("live-track-container");
  document.getElementById("track-order-id").innerText = `#${orderId}`;
  trackBox.style.display = "block";

  pollSingleOrderStatus(orderId);

  orderTrackingInterval = setInterval(() => {
    pollSingleOrderStatus(orderId);
  }, 60000);
}

function pollSingleOrderStatus(orderId) {
  const msgEl = document.getElementById("track-order-msg");
  msgEl.innerText = `Cập nhật cuối: ${new Date().toLocaleTimeString()} - Đang kiểm tra...`;

  if (!API_KEY) {
    setTimeout(() => {
      const mockStatuses = [
        "Pending",
        "Processing",
        "In progress",
        "Completed",
      ];
      const randomStatus =
        mockStatuses[Math.floor(Math.random() * mockStatuses.length)];
      updateLiveTrackUI(randomStatus, 100, 50, orderId);
    }, 500);
    return;
  }

  const statusFormData = new FormData();
  statusFormData.append("key", API_KEY);
  statusFormData.append("action", "status");
  statusFormData.append("order", orderId);

  fetch(TRAMMMO_API_URL, { method: "POST", body: statusFormData })
    .then((response) => response.json())
    .then((data) => {
      if (data && data.status) {
        updateLiveTrackUI(data.status, data.start_count, data.remains, orderId);
        msgEl.innerText = `Cập nhật cuối: ${new Date().toLocaleTimeString()} - Đồng bộ thành công.`;
      }
    })
    .catch((err) => {
      msgEl.innerText = `Lỗi kết nối, đang chờ chu kỳ tiếp theo...`;
    });
}

function updateLiveTrackUI(status, startCount, remains, orderId) {
  const statusEl = document.getElementById("track-order-status");
  document.getElementById("track-order-start").innerText = startCount || 0;
  document.getElementById("track-order-remains").innerText = remains || 0;

  statusEl.innerText = status;

  switch (String(status).toLowerCase()) {
    case "pending":
      statusEl.style.background = "#ffc107";
      statusEl.style.color = "#212529";
      break;
    case "processing":
      statusEl.style.background = "#17a2b8";
      statusEl.style.color = "#fff";
      break;
    case "inprogress":
      statusEl.style.background = "#007bff";
      statusEl.style.color = "#fff";
      break;
    case "completed":
      statusEl.style.background = "#28a745";
      statusEl.style.color = "#fff";
      break;
    case "partial":
      statusEl.style.background = "#fd7e14";
      statusEl.style.color = "#fff";
      break;
    case "canceled":
      statusEl.style.background = "#dc3545";
      statusEl.style.color = "#fff";
      break;
  }

  const terminalStatuses = ["completed", "partial", "canceled"];
  if (terminalStatuses.includes(String(status).toLowerCase())) {
    clearInterval(orderTrackingInterval);
    document.getElementById("track-order-msg").innerHTML =
      `🔒 <strong>Trình theo dõi đã dừng:</strong> Đơn hàng đạt trạng thái cuối (${status}).`;
  }
}

function initCustomDropdown() {
  const platformDropdown = document.getElementById("platform-dropdown");
  const platformBtn = document.getElementById("platform-dropdown-btn");
  const platformMenu = document.getElementById("platform-dropdown-menu");
  const platformInput = document.getElementById("filter-platform");

  const categoryDropdown = document.getElementById("category-dropdown");
  const categoryBtn = document.getElementById("category-dropdown-btn");

  if (platformDropdown && platformBtn && platformMenu && platformInput) {
    platformBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (categoryDropdown) categoryDropdown.classList.remove("is-open");
      platformDropdown.classList.toggle("is-open");
    });

    const items = platformMenu.querySelectorAll(".custom-dropdown-item");
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        items.forEach((i) => i.classList.remove("active"));
        item.classList.add("active");

        const val = item.getAttribute("data-value");
        platformInput.value = val;

        // Update button content
        const btnValContainer = platformBtn.querySelector(
          ".dropdown-selected-val",
        );
        btnValContainer.innerHTML = item.innerHTML;

        platformDropdown.classList.remove("is-open");

        // Trigger category update
        updateCategoryDropdown();
      });
    });
  }

  if (categoryDropdown && categoryBtn) {
    categoryBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (platformDropdown) platformDropdown.classList.remove("is-open");
      categoryDropdown.classList.toggle("is-open");
    });
  }

  document.addEventListener("click", (e) => {
    if (platformDropdown && !platformDropdown.contains(e.target)) {
      platformDropdown.classList.remove("is-open");
    }
    if (categoryDropdown && !categoryDropdown.contains(e.target)) {
      categoryDropdown.classList.remove("is-open");
    }
  });
}

function getCategoryLabel(groupKey) {
  for (let platform in categoriesData) {
    let found = categoriesData[platform].find((c) => c.id === groupKey);
    if (found) return { text: found.text, platform: platform };
  }
  return { text: "Dịch vụ lẻ", platform: "khac" };
}

function saveOrderToHistory(orderId, serviceName, link, quantity, priceText) {
  try {
    let history = JSON.parse(localStorage.getItem("dgMxhOrders") || "[]");
    if (!Array.isArray(history)) history = [];

    // Avoid duplicate entry if somehow triggered twice
    if (history.some((item) => String(item.id) === String(orderId))) return;

    const newOrder = {
      id: orderId,
      serviceName: serviceName || "Dịch vụ mạng xã hội",
      link: link || "---",
      quantity: quantity || 0,
      price: priceText || "0 đ",
      timestamp: new Date().toISOString(),
    };
    history.unshift(newOrder);
    // Limit to 50 items
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem("dgMxhOrders", JSON.stringify(history));
  } catch (err) {
    console.error("Failed to save order to local storage history:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initApp();
  initCustomDropdown();
});
