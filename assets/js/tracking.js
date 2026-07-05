// assets/js/tracking.js - Waybill tracking frontend script for DG Store

(() => {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  const STATUS_VI = {
    Created: "Đơn hàng đã được tạo",
    FMHub_Pickup_Done: "Đơn vị vận chuyển đã lấy hàng",
    FMHub_Received: "Đã chuyển tới bưu cục lấy",
    FMHub_LHTransporting: "Đang vận chuyển từ bưu cục lấy",
    SOC_Received: "Đã chuyển tới trung tâm khai thác",
    SOC_LHUnloading: "Đang dỡ hàng tại trung tâm khai thác",
    SOC_LHUnloaded: "Đã dỡ hàng tại trung tâm khai thác",
    SOC_LHTransporting: "Đang vận chuyển giữa các trung tâm khai thác",
    Return_SOC_Received: "Đã hoàn về trung tâm khai thác",
    Return_SOC_LHTransporting: "Đang chuyển hoàn giữa các trung tâm khai thác",
    Return_FMHub_Received: "Đã hoàn về bưu cục lấy",
    Return_FMHub_LHUnloading: "Đang dỡ hàng chuyển hoàn",
    Return_FMHub_LHUnloaded: "Đã dỡ hàng chuyển hoàn",
    Return_FMHub_Returning: "Đang chuyển hoàn cho người gửi",
    Return_FMHub_Returned: "Đã chuyển hoàn cho người gửi",
    Delivered: "Đã giao hàng",
  };

  const STATUS_ICONS = {
    ready_to_pick: { icon: "fa-box", className: "icon-ready_to_pick", label: "Sẵn sàng lấy hàng" },
    picking: { icon: "fa-hand", className: "icon-picking", label: "Đang lấy hàng" },
    picked: { icon: "fa-check", className: "icon-picked", label: "Đã lấy hàng" },
    picked_to_storing: { icon: "fa-warehouse", className: "icon-picked_to_storing", label: "Chuyển về kho" },
    storing: { icon: "fa-warehouse", className: "icon-storing", label: "Đang lưu kho" },
    transporting: { icon: "fa-truck-fast", className: "icon-transporting", label: "Đang vận chuyển" },
    delivering: { icon: "fa-motorcycle", className: "icon-delivering", label: "Đang giao hàng" },
    delivered: { icon: "fa-circle-check", className: "icon-delivered", label: "Đã giao hàng" },
    return: { icon: "fa-rotate-left", className: "icon-return", label: "Hoàn hàng" },
    cancel: { icon: "fa-xmark", className: "icon-cancel", label: "Đã hủy" },
  };

  let trackingEls = {};

  function initTrackingEls() {
    trackingEls = {
      form: document.getElementById("trackForm"),
      input: document.getElementById("trackingInput"),
      bulkInput: document.getElementById("bulkTrackingInput"),
      button: document.getElementById("trackButton"),
      watchButton: document.getElementById("watchButton"),
      refreshDashboardButton: document.getElementById("refreshDashboardButton"),
      statTracking: document.getElementById("statTracking"),
      statDelivered: document.getElementById("statDelivered"),
      statDelivering: document.getElementById("statDelivering"),
      statTransit: document.getElementById("statTransit"),
      refreshWatchButton: document.getElementById("refreshWatchButton"),
      watchList: document.getElementById("watchList"),
      loadingText: document.getElementById("loadingText"),
      emptyState: document.getElementById("emptyState"),
      loadingState: document.getElementById("loadingState"),
      errorState: document.getElementById("errorState"),
      errorText: document.getElementById("errorText"),
      result: document.getElementById("result"),
      trackingNumber: document.getElementById("trackingNumber"),
      copyButton: document.getElementById("copyButton"),
      statusBadge: document.getElementById("statusBadge"),
      summaryList: document.getElementById("summaryList"),
      timelineList: document.getElementById("timelineList"),
      rawJson: document.getElementById("rawJson"),
    };
  }

  function selectCarrierPill(value, element) {
    document.querySelectorAll('.sk-carrier-pill').forEach(pill => pill.classList.remove('active'));
    element.classList.add('active');
    const radio = element.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
  }

  function normalizeCode(value) {
    return String(value || "").replace(/\s+/g, "").toUpperCase();
  }

  function parseBulkEntries(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s*[|=]\s*/).filter(Boolean);
        const first = parts[0] || line;
        const code = normalizeCode(first.split(/\s+/)[0]);
        const label = parts.length > 1 ? parts.slice(1).join(" - ").trim() : line.replace(first, "").trim();
        return { code, label };
      })
      .filter((item) => item.code);
  }

  function selectedCarrier() {
    const activeRadio = document.querySelector('input[name="carrier"]:checked');
    return activeRadio ? activeRadio.value : 'auto';
  }

  function resolveCarrier(code) {
    const selected = selectedCarrier();
    if (selected !== "auto") return selected;
    return code.startsWith("SPX") ? "spx" : "ghn";
  }

  function setTrackingView(view) {
    if (!trackingEls.emptyState) return;
    trackingEls.emptyState.classList.toggle("sk-hidden", view !== "empty");
    trackingEls.loadingState.classList.toggle("sk-hidden", view !== "loading");
    trackingEls.errorState.classList.toggle("sk-hidden", view !== "error");
    trackingEls.result.classList.toggle("sk-hidden", view !== "result");
    
    if (trackingEls.button) {
      trackingEls.button.disabled = (view === "loading");
    }
  }

  function formatVietnamTime(value) {
    if (!value) return "-";
    let date;
    if (typeof value === "number") {
      date = new Date(value < 10000000000 ? value * 1000 : value);
    } else if (/^\d+$/.test(String(value))) {
      const numeric = Number(value);
      date = new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
    } else {
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) return String(value);
      date = new Date(parsed);
    }

    const parts = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

    return `${parts.day}-${parts.month} ${parts.hour}:${parts.minute}:${parts.second}`;
  }

  function formatGhnTime(value) {
    if (!value) return "-";
    const raw = String(value).trim();
    if (/^\d+$/.test(raw)) return formatVietnamTime(Number(raw));
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return formatVietnamTime(raw);
    return raw.replace(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/, "$1-$2").replace(/\s+/g, " ");
  }

  function statusText(status) {
    return STATUS_VI[status] || status || "-";
  }

  function iconKeyFromStatus(status, title = "", message = "") {
    const source = `${status || ""} ${title || ""} ${message || ""}`.toLowerCase();
    const normalized = source.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

    if (STATUS_ICONS[status?.toLowerCase()]) return status.toLowerCase();
    if (source.includes("cancel") || source.includes("huy")) return "cancel";
    if (source.includes("return") || source.includes("hoan")) return "return";
    if (source.includes("delivered") || source.includes("da giao") || source.includes("giao thanh cong")) return "delivered";
    if (source.includes("delivering") || source.includes("nhan vien giao") || source.includes("dang giao")) return "delivering";
    if (source.includes("transporting") || source.includes("van chuyen") || source.includes("ket noi")) return "transporting";
    if (source.includes("soc_received") || source.includes("unloading") || source.includes("storing") || source.includes("luu kho") || source.includes("trung tam khai thac")) return "storing";
    if (source.includes("fmhub_received") || source.includes("picked_to_storing") || source.includes("buu cuc")) return "picked_to_storing";
    if (source.includes("pickup_done") || source.includes("picked") || source.includes("lay hang thanh cong")) return "picked";
    if (source.includes("picking") || source.includes("dang lay")) return "picking";
    if (source.includes("created") || source.includes("ready") || source.includes("tao don")) return "ready_to_pick";
    return "ready_to_pick";
  }

  function statusIcon(status, title, message) {
    return STATUS_ICONS[iconKeyFromStatus(status, title, message)] || STATUS_ICONS.ready_to_pick;
  }

  function badgeClass(status) {
    const lower = String(status || "").toLowerCase();
    if (lower.includes("return") || lower.includes("deliver") || lower.includes("success") || lower.includes("thanh cong")) {
      return "sk-badge done";
    }
    if (lower.includes("fail") || lower.includes("lost") || lower.includes("damage") || lower.includes("huy")) {
      return "sk-badge error";
    }
    return "sk-badge";
  }

  async function fetchLocal(endpoint, code) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}${endpoint}?code=${encodeURIComponent(code)}`, {
      headers: {
        accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !payload.ok) {
      throw new Error((payload && payload.message) || `API tra ve HTTP ${response.status}`);
    }
    return payload.data;
  }

  async function requestJson(url, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !payload.ok) {
      throw new Error((payload && payload.message) || `API trả về HTTP ${response.status}`);
    }
    return payload.data;
  }

  function formatBotDate(value) {
    if (!value) return "-";
    return formatVietnamTime(value);
  }

  function minutesUntil(value) {
    if (!value) return "-";
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return "-";
    const minutes = Math.max(0, Math.ceil((parsed - Date.now()) / 60000));
    if (minutes < 60) return `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
  }

  function isToday(value) {
    if (!value) return false;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return false;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(parsed)) === formatter.format(new Date());
  }

  function renderDashboard(items) {
    if (!trackingEls.statTracking) return;
    const list = Array.isArray(items) ? items : [];
    const count = (category) => list.filter((item) => item.category === category).length;
    trackingEls.statTracking.textContent = String(list.length);
    trackingEls.statDelivered.textContent = String(count("delivered"));
    trackingEls.statDelivering.textContent = String(count("delivering"));
    trackingEls.statTransit.textContent = String(count("transporting") + count("storing") + count("picked_to_storing"));
  }

  async function loadWatchList() {
    try {
      const items = await requestJson("/watch");
      renderDashboard(items);
      renderWatchList(items);
    } catch (error) {
      if (trackingEls.watchList) {
        trackingEls.watchList.innerHTML = `<div style="color: var(--danger); font-size: 13px; text-align: center; padding: 16px;">${escapeHtml(error.message || "Không tải được danh sách theo dõi.")}</div>`;
      }
    }
  }

  let currentWatchViewMode = localStorage.getItem('watchViewMode') || 'card';

  function switchWatchListViewMode(mode) {
    currentWatchViewMode = mode;
    localStorage.setItem('watchViewMode', mode);
    
    const cardBtn = document.getElementById('viewModeCardBtn');
    const tableBtn = document.getElementById('viewModeTableBtn');
    if (cardBtn && tableBtn) {
      cardBtn.classList.toggle('active', mode === 'card');
      tableBtn.classList.toggle('active', mode === 'table');
    }
    
    loadWatchList();
  }
  window.switchWatchListViewMode = switchWatchListViewMode;

  function renderProgressTracker(category, carrier) {
    const stages = [
      { key: "ready", label: "Chuẩn bị", icon: "fa-box-open" },
      { key: "transit", label: "Vận chuyển", icon: "fa-truck-fast" },
      { key: "delivering", label: "Đang giao", icon: "fa-motorcycle" },
      { key: "delivered", label: "Đã nhận", icon: "fa-circle-check" }
    ];
    
    let currentStageIndex = 0;
    const cat = String(category || "").toLowerCase();
    if (cat.includes("ready") || cat.includes("pick")) {
      currentStageIndex = 0;
    } else if (cat.includes("transit") || cat.includes("transport") || cat.includes("store") || cat.includes("hub") || cat.includes("receive")) {
      currentStageIndex = 1;
    } else if (cat.includes("deliver") && !cat.includes("delivered")) {
      currentStageIndex = 2;
    } else if (cat.includes("deliver") || cat.includes("success") || cat.includes("done")) {
      currentStageIndex = 3;
    } else if (cat.includes("cancel") || cat.includes("fail")) {
      currentStageIndex = -1;
    }
    
    const activeColor = carrier === "SPX" ? "#ee4d2d" : "#0ea5e9";
    const activeBg = carrier === "SPX" ? "rgba(238, 77, 45, 0.1)" : "rgba(14, 165, 233, 0.1)";
    
    if (currentStageIndex === -1) {
      const isCancel = cat.includes("cancel");
      const errColor = "#ef4444";
      return `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: rgba(239, 68, 68, 0.05); border: 1px dashed rgba(239, 68, 68, 0.2); border-radius: 8px; margin: 12px 0;">
          <i class="fa-solid ${isCancel ? 'fa-ban' : 'fa-circle-exclamation'}" style="color: ${errColor}; font-size: 14px;"></i>
          <span style="font-size: 11.5px; font-weight: 700; color: ${errColor};">${isCancel ? 'ĐƠN HÀNG ĐÃ BỊ HỦY' : 'GIAO HÀNG THẤT BẠI'}</span>
        </div>
      `;
    }

    const linePercent = currentStageIndex * 33.33;
    let nodesHtml = stages.map((stage, idx) => {
      const isActive = idx <= currentStageIndex;
      const isCurrent = idx === currentStageIndex;
      
      const nodeColor = isActive ? activeColor : "var(--muted)";
      const nodeBg = isActive ? activeBg : "rgba(255,255,255,0.02)";
      const nodeBorder = isActive ? `1.5px solid ${activeColor}` : "1.5px solid var(--line)";
      const glowStyle = isCurrent ? `box-shadow: 0 0 10px ${activeColor}40;` : '';
      const textWeight = isCurrent ? '800' : '500';
      const textColor = isCurrent ? 'var(--text-bright)' : 'var(--muted)';
      
      return `
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1; position: relative; z-index: 2;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${nodeBg}; border: ${nodeBorder}; display: flex; align-items: center; justify-content: center; color: ${nodeColor}; ${glowStyle} transition: all 0.3s;">
            <i class="fa-solid ${stage.icon}" style="font-size: 13px;"></i>
          </div>
          <span style="font-size: 10px; font-weight: ${textWeight}; color: ${textColor}; margin-top: 6px; text-align: center;">${stage.label}</span>
        </div>
      `;
    }).join('');

    return `
      <div style="position: relative; display: flex; justify-content: space-between; align-items: center; padding: 10px 0; margin: 12px 0; background: rgba(0,0,0,0.15); border-radius: 10px; border: 1px solid var(--line);">
        <div style="position: absolute; left: 16%; right: 16%; top: 26px; height: 2px; background: var(--line); z-index: 1;"></div>
        <div style="position: absolute; left: 16%; width: ${linePercent * 0.68}%; top: 26px; height: 2px; background: ${activeColor}; z-index: 1; transition: width 0.5s ease;"></div>
        ${nodesHtml}
      </div>
    `;
  }

  function renderWatchListCards(items) {
    trackingEls.watchList.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; width: 100%;"></div>`;
    const grid = trackingEls.watchList.firstElementChild;

    items.forEach((item) => {
      const activeText = item.active ? `Check sau: ${minutesUntil(item.nextCheckAt)}` : "Đã dừng";
      const statusTextVal = item.paused ? "Tạm dừng" : (item.lastStatusText || "Chưa có trạng thái");
      const carrierColor = item.carrier === "SPX" ? "#ee4d2d" : "#0ea5e9";
      const carrierBg = item.carrier === "SPX" ? "rgba(238, 77, 45, 0.15)" : "rgba(14, 165, 233, 0.15)";
      
      const badgeHtml = badgeClass(item.lastStatusText || item.lastStatus);
      const progressTrackerHtml = renderProgressTracker(item.category || item.lastStatusText || item.lastStatus, item.carrier);

      const card = document.createElement("div");
      card.className = "shopee-side-box";
      card.style = "padding: 16px; margin: 0; display: flex; flex-direction: column; justify-content: space-between; border-top: 2px solid " + carrierColor + " !important;";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 11px; font-weight: 800; background: ${carrierBg}; color: ${carrierColor}; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
            <i class="fa-solid ${item.carrier === 'SPX' ? 'fa-truck' : 'fa-truck-fast'}"></i> ${escapeHtml(item.carrier)}
          </span>
          <span class="${badgeHtml}" style="font-size: 11px; font-weight: 700; padding: 2px 6px;">
            ${escapeHtml(statusTextVal)}
          </span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; flex-grow: 1;">
          <div>
            <div style="font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Mã vận đơn</div>
            <div style="font-family: monospace; font-size: 15px; font-weight: 900; color: var(--text-bright); display: flex; align-items: center; gap: 8px;">
              <span>${escapeHtml(item.code || "-")}</span>
              <button onclick="navigator.clipboard.writeText('${escapeHtml(item.code)}'); alert('Đã sao chép')" style="background: transparent; border: none; color: var(--muted); cursor: pointer; padding: 0;"><i class="fa-regular fa-copy" style="font-size: 12px;"></i></button>
            </div>
          </div>

          ${item.label ? `
          <div>
            <div style="font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Bí danh đơn</div>
            <div style="font-size: 12.5px; font-weight: 600; color: var(--text);">${escapeHtml(item.label)}</div>
          </div>` : ''}

          ${progressTrackerHtml}

          <div style="border-top: 1px dashed var(--line); padding-top: 8px; margin-top: auto; display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted);">
            <div><i class="fa-regular fa-clock" style="margin-right: 4px;"></i> ${escapeHtml(activeText)}</div>
            <div><i class="fa-solid fa-arrows-rotate" style="margin-right: 4px;"></i> Cập nhật: ${escapeHtml(formatBotDate(item.lastEventTime || item.lastCheckedAt))}</div>
            ${item.lastError ? `<div style="color: var(--danger); font-weight: 500;"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(item.lastError)}</div>` : ""}
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px;">
          <button class="sk-btn sk-btn-soft" data-action="check" data-id="${escapeHtml(item.id)}" style="flex: 1; height: 32px; font-size: 12px; padding: 0;"><i class="fa-solid fa-sync"></i> Kiểm tra</button>
          <button class="sk-btn sk-btn-soft" data-action="delete" data-id="${escapeHtml(item.id)}" style="height: 32px; font-size: 12px; padding: 0 12px; color: var(--danger); border-color: rgba(220,38,38,0.2); background: rgba(220,38,38,0.05);"><i class="fa-solid fa-trash"></i> Xóa</button>
        </div>
      `;
      grid.append(card);
    });
  }

  function renderWatchListTable(items) {
    let rowsHtml = items.map((item) => {
      const activeText = item.active ? `Check sau: ${minutesUntil(item.nextCheckAt)}` : "Đã dừng";
      const statusTextVal = item.paused ? "Tạm dừng" : (item.lastStatusText || "Chưa có trạng thái");
      const carrierColor = item.carrier === "SPX" ? "#ee4d2d" : "#0ea5e9";
      const badgeHtml = badgeClass(item.lastStatusText || item.lastStatus);
      
      return `
        <tr style="border-bottom: 1px solid var(--line); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 12px 16px;">
            <span style="font-weight: 800; color: ${carrierColor}; text-transform: uppercase;">${escapeHtml(item.carrier)}</span>
          </td>
          <td style="padding: 12px 16px;">
            <span style="font-family: monospace; font-weight: 700; color: var(--text-bright);">${escapeHtml(item.code)}</span>
          </td>
          <td style="padding: 12px 16px;">
            <span style="font-weight: 600; color: var(--text);">${escapeHtml(item.label || "-")}</span>
          </td>
          <td style="padding: 12px 16px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span class="${badgeHtml}" style="align-self: flex-start; font-size: 11px; font-weight: 700; padding: 1px 6px;">
                ${escapeHtml(statusTextVal)}
              </span>
              ${item.lastError ? `<small style="color: var(--danger); font-size: 11px;">${escapeHtml(item.lastError)}</small>` : ""}
            </div>
          </td>
          <td style="padding: 12px 16px; color: var(--muted); font-size: 12px;">
            <div style="font-weight: 600; color: var(--text-sub);">${escapeHtml(formatBotDate(item.lastEventTime || item.lastCheckedAt))}</div>
            <div><small>${escapeHtml(activeText)}</small></div>
          </td>
          <td style="padding: 12px 16px; text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              <button class="sk-btn sk-btn-soft" data-action="check" data-id="${escapeHtml(item.id)}" style="height: 28px; font-size: 11px; padding: 0 8px;"><i class="fa-solid fa-sync"></i> Kiểm tra</button>
              <button class="sk-btn sk-btn-soft" data-action="delete" data-id="${escapeHtml(item.id)}" style="height: 28px; font-size: 11px; padding: 0 8px; color: var(--danger); border-color: rgba(220,38,38,0.2); background: rgba(220,38,38,0.05);"><i class="fa-solid fa-trash"></i> Xóa</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    trackingEls.watchList.innerHTML = `
      <div style="overflow-x: auto; width: 100%; background: rgba(10, 14, 26, 0.2); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.15);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 2px solid var(--line); background: rgba(255, 255, 255, 0.02); color: var(--text-bright);">
              <th style="padding: 12px 16px; font-weight: 800;">Nhà xe</th>
              <th style="padding: 12px 16px; font-weight: 800;">Mã vận đơn</th>
              <th style="padding: 12px 16px; font-weight: 800;">Bí danh</th>
              <th style="padding: 12px 16px; font-weight: 800;">Trạng thái mới nhất</th>
              <th style="padding: 12px 16px; font-weight: 800;">Cập nhật cuối</th>
              <th style="padding: 12px 16px; font-weight: 800; text-align: right;">Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--muted);">Chưa có đơn hàng nào đang theo dõi.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderWatchList(items) {
    if (!trackingEls.watchList) return;
    
    const cardBtn = document.getElementById('viewModeCardBtn');
    const tableBtn = document.getElementById('viewModeTableBtn');
    if (cardBtn && tableBtn) {
      cardBtn.classList.toggle('active', currentWatchViewMode === 'card');
      tableBtn.classList.toggle('active', currentWatchViewMode === 'table');
    }

    if (!Array.isArray(items) || items.length === 0) {
      trackingEls.watchList.innerHTML = '<div style="color: var(--muted); font-size: 13px; text-align: center; padding: 16px;">Chưa có đơn hàng nào đang theo dõi.</div>';
      return;
    }

    if (currentWatchViewMode === 'table') {
      renderWatchListTable(items);
    } else {
      renderWatchListCards(items);
    }

    if (window.replaceIcons) window.replaceIcons(trackingEls.watchList);
  }

  async function addCurrentToWatch() {
    const bulkItems = parseBulkEntries(trackingEls.bulkInput.value);
    const code = normalizeCode(trackingEls.input.value);
    if (!bulkItems.length && !code) {
      trackingEls.errorText.textContent = "Bạn chưa nhập mã vận đơn.";
      setTrackingView("error");
      return;
    }

    const carrier = resolveCarrier(code);
    trackingEls.watchButton.disabled = true;
    trackingEls.watchButton.textContent = "Đang thêm...";

    try {
      if (bulkItems.length) {
        await requestJson("/watch", {
          method: "POST",
          body: JSON.stringify({ items: bulkItems }),
        });
      } else {
        await requestJson("/watch", {
          method: "POST",
          body: JSON.stringify({ code, carrier }),
        });
      }
      trackingEls.bulkInput.value = "";
      trackingEls.input.value = "";
      await loadWatchList();
    } catch (error) {
      trackingEls.errorText.textContent = error.message || "Không thêm được đơn theo dõi.";
      setTrackingView("error");
    } finally {
      trackingEls.watchButton.disabled = false;
      trackingEls.watchButton.innerHTML = '<i class="fa-solid fa-bell"></i> Theo dõi';
      if (window.replaceIcons) window.replaceIcons(trackingEls.watchButton);
    }
  }

  async function handleWatchAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    button.disabled = true;

    try {
      if (action === "delete") {
        await requestJson(`/watch/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      if (action === "check") {
        await requestJson(`/watch/${encodeURIComponent(id)}/check`, { method: "POST" });
      }
      await loadWatchList();
    } catch (error) {
      trackingEls.errorText.textContent = error.message || "Lỗi thao tác watchlist.";
      setTrackingView("error");
    } finally {
      button.disabled = false;
    }
  }

  function flattenObject(value, result = {}) {
    if (!value || typeof value !== "object") return result;
    if (Array.isArray(value)) {
      value.forEach((item) => flattenObject(item, result));
      return result;
    }
    Object.entries(value).forEach(([key, child]) => {
      if (child == null) return;
      if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
        if (result[key] == null || result[key] === "") result[key] = child;
      } else {
        flattenObject(child, result);
      }
    });
    return result;
  }

  function firstValue(source, keys) {
    for (const key of keys) {
      if (source[key] != null && source[key] !== "") return source[key];
    }
    return "";
  }

  function collectArrays(value, output, name = "") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      output.push({ name, value });
      value.forEach((item) => collectArrays(item, output, name));
      return;
    }
    Object.keys(value).forEach((key) => collectArrays(value[key], output, key));
  }

  function eventTimeValue(event) {
    return event.action_at ||
      event.ACTION_AT ||
      event.datetime ||
      event.DATETIME ||
      event.updated_date ||
      event.UPDATED_DATE ||
      event.updatedDate ||
      event.created_date ||
      event.CREATED_DATE ||
      event.createdDate ||
      event.updated_at ||
      event.UPDATED_AT ||
      event.updatedAt ||
      event.created_at ||
      event.CREATED_AT ||
      event.createdAt ||
      event.log_time ||
      event.LOG_TIME ||
      event.logTime ||
      event.action_time ||
      event.ACTION_TIME ||
      event.status_date ||
      event.STATUS_DATE ||
      event.thoi_gian ||
      event.THOI_GIAN ||
      event.time ||
      event.TIME ||
      event.timestamp;
  }

  function extractTimeFromText(value) {
    const text = String(value || "");
    const match = text.match(/(?:\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})[ T,-]*(?:\d{1,2}:\d{2}(?::\d{2})?)?/);
    return match ? match[0].trim().replace(/[,\s-]+$/, "") : "";
  }

  function eventTimeMs(value) {
    if (!value) return 0;
    if (typeof value === "number") return value < 10000000000 ? value * 1000 : value;
    if (/^\d+$/.test(String(value))) {
      const numeric = Number(value);
      return numeric < 10000000000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeGhnEvent(event) {
    const title = event.information || event.INFORMATION || event.status_name || event.statusName || event.status || event.STATUS || event.action || event.ACTION || event.message || event.MESSAGE || event.note || event.NOTE || "Cập nhật";
    const location = event.location || event.warehouse_name || event.warehouseName || event.station_name || event.stationName || "";
    const message = event.content || event.CONTENT || event.description || event.DESCRIPTION || event.reason || event.REASON || event.message || event.MESSAGE || location || "";
    const time = eventTimeValue(event) || extractTimeFromText(message) || extractTimeFromText(title);
    return {
      time: time ? formatGhnTime(time) : "-",
      status: event.status || event.STATUS || event.status_name || event.statusName || event.action || event.ACTION || title,
      title: statusText(title),
      message,
      sortTime: eventTimeMs(time),
    };
  }

  function findGhnEvents(trackingData, orderLogs) {
    const candidates = [];
    collectArrays(trackingData, candidates);
    collectArrays(orderLogs, candidates);

    const named = candidates.find((item) => /tracking_logs|trackingLogs/i.test(item.name) && item.value.length) ||
      candidates.find((item) => /log|tracking|history/i.test(item.name) && item.value.length) ||
      candidates.find((item) => /data/i.test(item.name) && item.value.length);
    const any = named || candidates.find((item) => item.value.length && typeof item.value[0] === "object");
    const events = any ? any.value.map(normalizeGhnEvent) : [];
    return events.sort((a, b) => b.sortTime - a.sortTime);
  }

  function normalizeSpx(raw) {
    const latest = Array.isArray(raw.tracking_list) ? raw.tracking_list[0] : null;
    return {
      carrier: "SPX",
      code: raw.sls_tracking_number || raw.tracking_number || "-",
      status: statusText(raw.current_status),
      summary: [
        ["Nhà vận chuyển", "SPX Express"],
        ["Loại đơn", raw.delivery_type || "-"],
        ["Cập nhật mới nhất", latest ? formatVietnamTime(latest.timestamp) : "-"],
        ["Nội dung mới nhất", latest ? latest.message || statusText(latest.status) : "-"],
        ["Người nhận", raw.recipient_name || "-"],
      ],
      events: Array.isArray(raw.tracking_list)
        ? raw.tracking_list.map((item) => ({
            time: formatVietnamTime(item.timestamp),
            status: item.status,
            title: statusText(item.status),
            message: item.message || "-",
          }))
        : [],
      raw,
    };
  }

  function normalizeGhn(raw, code) {
    const tracking = raw.tracking || {};
    const orderLogs = raw.orderLogs || null;
    const data = tracking.data || {};
    const flat = flattenObject(data);
    const status = firstValue(flat, ["status_name", "statusName", "status", "current_status", "currentStatus"]) || "Đã nhận dữ liệu";
    const events = findGhnEvents(data, orderLogs && orderLogs.data);

    return {
      carrier: "GHN",
      code: firstValue(flat, ["order_code", "orderCode", "client_order_code"]) || code,
      status,
      summary: [
        ["Nhà vận chuyển", "Giao Hàng Nhanh"],
        ["Trạng thái", status],
        ["Người gửi", firstValue(flat, ["sender_name", "senderName", "from_name", "fromName"]) || "-"],
        ["Người nhận", firstValue(flat, ["receiver_name", "receiverName", "to_name", "toName"]) || "-"],
        ["Dịch vụ", firstValue(flat, ["service_name", "serviceName", "service"]) || "-"],
        ["Cập nhật", formatGhnTime(firstValue(flat, ["updated_date", "UPDATED_DATE", "updatedDate", "created_date", "CREATED_DATE", "createdDate", "updated_at", "UPDATED_AT", "updatedAt", "log_time", "LOG_TIME", "logTime", "datetime", "DATETIME", "thoi_gian", "THOI_GIAN", "time", "TIME"])) || "-"],
      ],
      events,
      raw,
    };
  }

  const SUMMARY_ICONS = {
    "Nhà vận chuyển": "fa-truck",
    "Loại đơn": "fa-tag",
    "Cập nhật mới nhất": "fa-clock",
    "Cập nhật": "fa-clock",
    "Người nhận": "fa-user",
    "Người gửi": "fa-user-tag",
    "Trạng thái": "fa-circle-question",
    "Dịch vụ": "fa-cubes",
  };

  function renderSummary(items) {
    trackingEls.summaryList.innerHTML = "";
    
    let latestMessage = "";
    const regularItems = [];
    
    items.forEach(([label, value]) => {
      if (label === "Nội dung mới nhất") {
        latestMessage = value;
      } else {
        regularItems.push([label, value]);
      }
    });

    if (latestMessage) {
      const banner = document.createElement("div");
      banner.style = "background: rgba(238, 77, 45, 0.04); border-left: 4px solid #ee4d2d; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px; line-height: 1.5; border: 1px solid rgba(238, 77, 45, 0.08); border-left-width: 4px;";
      banner.innerHTML = `
        <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; color: #ee4d2d; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <i class="fa-solid fa-circle-info"></i> Nội dung mới nhất
        </div>
        <div style="color: var(--text); font-weight: 700;">${escapeHtml(latestMessage)}</div>
      `;
      trackingEls.summaryList.append(banner);
    }

    regularItems.forEach(([label, value]) => {
      const iconClass = SUMMARY_ICONS[label] || "fa-circle-info";
      const row = document.createElement("div");
      row.style = "display: flex; justify-content: space-between; align-items: center; background: var(--surface-soft); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;";
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted);">
          <i class="fa-solid ${iconClass}" style="color: #ee4d2d; font-size: 13.5px; width: 16px; text-align: center;"></i>
          <span>${escapeHtml(label)}</span>
        </div>
        <strong style="font-size: 13px; color: var(--text); font-weight: 700; text-align: right; overflow-wrap: anywhere; max-width: 60%;">${escapeHtml(value || "-")}</strong>
      `;
      trackingEls.summaryList.append(row);
    });
    if (window.replaceIcons) window.replaceIcons(trackingEls.summaryList);
  }

  function renderTimeline(events) {
    trackingEls.timelineList.innerHTML = "";
    if (!Array.isArray(events) || events.length === 0) {
      const empty = document.createElement("p");
      empty.style = "color: var(--muted); text-align: center; padding: 16px; font-size: 13px;";
      empty.textContent = "Không có dữ liệu lịch trình.";
      trackingEls.timelineList.append(empty);
      return;
    }

    const maxVisible = 3;
    const collapseWrapper = document.createElement("div");
    collapseWrapper.className = "sk-timeline-collapsed-wrapper";
    collapseWrapper.style.display = "none";
    collapseWrapper.style.gridTemplateColumns = "1fr";
    collapseWrapper.style.gap = "0px";

    events.slice(0, 60).forEach((item, index) => {
      const icon = statusIcon(item.status, item.title, item.message);
      const row = document.createElement("div");
      row.className = index === 0 ? "sk-timeline-row latest" : "sk-timeline-row";
      row.innerHTML = `
        <div class="sk-timeline-event">
          <span class="sk-timeline-icon ${escapeHtml(icon.className)}" title="${escapeHtml(icon.label)}">
            <i class="fa-solid ${escapeHtml(icon.icon)}"></i>
          </span>
          <span class="sk-timeline-time">${escapeHtml(item.time || "-")}</span>
          <h4 class="sk-timeline-title">${escapeHtml(item.title || "Cập nhật")}</h4>
          <p class="sk-timeline-desc">${escapeHtml(item.message || "-")}</p>
        </div>
      `;

      if (index < maxVisible) {
        trackingEls.timelineList.append(row);
      } else {
        collapseWrapper.append(row);
      }
    });

    if (events.length > maxVisible) {
      trackingEls.timelineList.append(collapseWrapper);

      const toggleContainer = document.createElement("div");
      toggleContainer.style = "text-align: center; margin-top: 16px; border-top: 1px dashed var(--line); padding-top: 16px;";
      toggleContainer.innerHTML = `
        <button class="sk-btn sk-btn-soft" style="color: #ee4d2d; border-color: rgba(238, 77, 45, 0.2); background: rgba(238, 77, 45, 0.05); font-size: 12px; font-weight: 700; height: 32px; padding: 0 16px; border-radius: 6px; cursor: pointer;">
          <i class="fa-solid fa-chevron-down" style="margin-right: 4px;"></i> Xem thêm (${events.length - maxVisible} cập nhật khác)
        </button>
      `;

      const toggleBtn = toggleContainer.querySelector("button");
      toggleBtn.onclick = () => {
        const isHidden = collapseWrapper.style.display === "none";
        if (isHidden) {
          collapseWrapper.style.display = "grid";
          toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-up" style="margin-right: 4px;"></i> Thu gọn`;
        } else {
          collapseWrapper.style.display = "none";
          toggleBtn.innerHTML = `<i class="fa-solid fa-chevron-down" style="margin-right: 4px;"></i> Xem thêm (${events.length - maxVisible} cập nhật khác)`;
        }
        if (window.replaceIcons) window.replaceIcons(toggleContainer);
      };

      trackingEls.timelineList.append(toggleContainer);
    }
    if (window.replaceIcons) window.replaceIcons(trackingEls.timelineList);
  }

  function renderStatusBadge(status) {
    if (!trackingEls.statusBadge) return;
    const lower = String(status || "").toLowerCase();
    let icon = "fa-circle-dot";
    let textClass = "sk-badge";
    
    if (lower.includes("return") || lower.includes("deliver") || lower.includes("success") || lower.includes("thanh cong")) {
      icon = "fa-circle-check";
      textClass = "sk-badge done";
    } else if (lower.includes("fail") || lower.includes("lost") || lower.includes("damage") || lower.includes("huy")) {
      icon = "fa-circle-xmark";
      textClass = "sk-badge error";
    } else {
      icon = "fa-truck-ramp-box";
      textClass = "sk-badge";
    }
    
    trackingEls.statusBadge.className = textClass;
    trackingEls.statusBadge.innerHTML = `<i class="fa-solid ${icon}" style="margin-right: 6px;"></i> ${escapeHtml(status || "-")}`;
    if (window.replaceIcons) window.replaceIcons(trackingEls.statusBadge);
  }

  function renderResult(result) {
    trackingEls.trackingNumber.dataset.code = result.code || "";
    const carrierColor = result.carrier === "SPX" ? "#ee4d2d" : "#0ea5e9";
    trackingEls.trackingNumber.innerHTML = `
      <span style="font-family: monospace; font-weight: 900; letter-spacing: 0.5px;">${escapeHtml(result.code || "-")}</span>
      <span style="font-size: 10px; font-weight: 800; background: ${carrierColor}; color: #fff; padding: 2px 8px; border-radius: 4px; margin-left: 8px; vertical-align: middle;">${escapeHtml(result.carrier)}</span>
    `;

    renderStatusBadge(result.status);
    renderSummary(result.summary || []);
    renderTimeline(result.events || []);
    trackingEls.rawJson.textContent = JSON.stringify(result.raw, null, 2);
    setTrackingView("result");
  }

  async function handleSubmit(event) {
    if (event) event.preventDefault();
    const code = normalizeCode(trackingEls.input.value);
    if (!code) {
      trackingEls.errorText.textContent = "Bạn chưa nhập mã vận đơn.";
      setTrackingView("error");
      return;
    }

    const carrier = resolveCarrier(code);
    trackingEls.input.value = code;
    trackingEls.loadingText.textContent = carrier === "spx" ? "Đang gọi API SPX Express." : "Đang gọi API Giao Hàng Nhanh.";
    setTrackingView("loading");

    try {
      if (carrier === "spx") {
        const data = await fetchLocal("/spx-track", code);
        renderResult(normalizeSpx(data));
      } else {
        const data = await fetchLocal("/ghn-track", code);
        renderResult(normalizeGhn(data, code));
      }
    } catch (error) {
      trackingEls.errorText.textContent = error.message || "Có lỗi khi tra cứu đơn hàng.";
      setTrackingView("error");
    }
  }

  function setupTrackingListeners() {
    initTrackingEls();
    
    // Yêu cầu đăng nhập trước khi hiển thị tra cứu
    const token = localStorage.getItem('token');
    const container = document.getElementById('shopee-tracking');
    if (!token) {
      if (container) {
        container.innerHTML = `
          <div class="sk-card" style="padding: 48px 24px; text-align: center; max-width: 500px; margin: 40px auto; border-top: 4px solid #ee4d2d; background: rgba(15, 23, 42, 0.45); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.05); border-radius: 20px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-left: 1px solid rgba(255,255,255,0.02); border-right: 1px solid rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.02);">
            
            <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(238, 77, 45, 0.08); border: 2px dashed rgba(238, 77, 45, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px auto; box-shadow: 0 0 20px rgba(238, 77, 45, 0.15);">
              <i class="fa-solid fa-shield-halved" style="font-size: 32px; color: #ee4d2d; filter: drop-shadow(0 0 8px rgba(238,77,45,0.4));"></i>
            </div>
            
            <h2 style="font-size: 19px; font-weight: 900; color: var(--text-bright); margin-bottom: 12px; font-family: 'Inter', sans-serif !important; letter-spacing: -0.01em;">ĐĂNG NHẬP ĐỂ TRA CỨU VẬN ĐƠN</h2>
            <p style="color: var(--text-sub); font-size: 13.5px; line-height: 1.6; margin-bottom: 28px; max-width: 400px; margin-left: auto; margin-right: auto;">Bạn cần đăng nhập tài khoản DG Store để tra hành trình vận đơn SPX Express, Giao Hàng Nhanh và tự động theo dõi trạng thái đơn hàng.</p>
            
            <a href="login.html?redirect=tracking.html" class="sk-btn" style="height: 44px; font-weight: 800; width: 100%; justify-content: center; display: inline-flex; text-decoration: none; border-radius: 10px; align-items: center; gap: 8px; font-size: 13.5px; background: linear-gradient(135deg, #ee4d2d, #ff683b); color: #ffffff; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(238, 77, 45, 0.35); transition: all 0.3s; cursor: pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(238, 77, 45, 0.5)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 15px rgba(238, 77, 45, 0.35)';"><i class="fa-solid fa-right-to-bracket"></i> ĐĂNG NHẬP NGAY</a>
          </div>
        `;
      }
      return;
    }

    if (!trackingEls.form) return;
    
    // Remove duplicate event listener registrations if any
    const oldForm = trackingEls.form;
    const newForm = oldForm.cloneNode(true);
    oldForm.parentNode.replaceChild(newForm, oldForm);
    trackingEls.form = newForm;
    initTrackingEls(); // re-bind elements
    
    trackingEls.form.addEventListener("submit", handleSubmit);
    trackingEls.input.addEventListener("input", () => {
      trackingEls.input.value = trackingEls.input.value.toUpperCase();
    });
    
    // Setup clicks safely
    trackingEls.watchButton.onclick = addCurrentToWatch;
    trackingEls.refreshDashboardButton.onclick = loadWatchList;
    trackingEls.refreshWatchButton.onclick = loadWatchList;
    trackingEls.watchList.onclick = handleWatchAction;
    
    trackingEls.copyButton.onclick = async () => {
      const text = (trackingEls.trackingNumber.dataset.code || trackingEls.trackingNumber.textContent).trim();
      if (text && text !== "-") {
        await navigator.clipboard.writeText(text);
        trackingEls.copyButton.title = "Đã sao chép";
        const icon = trackingEls.copyButton.querySelector('i') || trackingEls.copyButton.querySelector('.sk-icon');
        if (icon) {
          if (icon.tagName.toLowerCase() === 'i') {
            icon.className = 'fa-solid fa-check';
            setTimeout(() => {
              icon.className = 'fa-regular fa-copy';
              trackingEls.copyButton.title = "Sao chép mã";
            }, 1200);
          } else {
            const originalHTML = icon.innerHTML;
            const originalClass = icon.className;
            icon.className = 'sk-icon sm sk-icon-bounce';
            icon.innerHTML = window.SVG_ICONS['fa-check'] || '';
            setTimeout(() => {
              icon.className = originalClass;
              icon.innerHTML = originalHTML;
              trackingEls.copyButton.title = "Sao chép mã";
            }, 1200);
          }
        }
      }
    };

    const params = new URLSearchParams(location.search);
    const codeFromUrl = params.get("code") || params.get("tracking_number") || params.get("order_code");
    const carrierFromUrl = params.get("carrier");
    if (carrierFromUrl && ["auto", "spx", "ghn"].includes(carrierFromUrl)) {
      const pill = document.querySelector(`.sk-carrier-pill input[value="${carrierFromUrl}"]`)?.closest('.sk-carrier-pill');
      if (pill) selectCarrierPill(carrierFromUrl, pill);
    }
    if (codeFromUrl) {
      trackingEls.input.value = normalizeCode(codeFromUrl);
      handleSubmit();
    }

    loadWatchList();
  }

  // Handle pill selection in global scope via binding
  window.selectCarrierPill = selectCarrierPill;

  // Expose setup globally
  window.setupTrackingListeners = setupTrackingListeners;

  // Auto initialize when script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTrackingListeners);
  } else {
    setupTrackingListeners();
  }
})();
