#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");

const SPX_SECRET = "MGViZmZmZTYzZDJhNDgxY2Y1N2ZlN2Q1ZWJkYzlmZDY=";
const TRACKING_API =
  "https://spx.vn/api/v2/fleet_order/tracking/search?sls_tracking_number=";
const GHN_API_BASE =
  "https://fe-online-gateway.ghn.vn/order-tracking/public-api/client";
const WATCH_FILE = path.join(__dirname, "watchlist.json");
const CONFIG_FILE = path.join(__dirname, "bot-config.json");
const TELEGRAM_STATE_FILE = path.join(__dirname, "telegram-state.json");
const BOT_TICK_MS = 30 * 1000;
const TELEGRAM_POLL_MS = 5 * 1000;

const CHECK_INTERVALS = {
  ready_to_pick: 60 * 60 * 1000,
  picked_to_storing: 60 * 60 * 1000,
  storing: 60 * 60 * 1000,
  transporting: 60 * 60 * 1000,
  at_delivery_hub: 15 * 60 * 1000,
  delivering: 5 * 60 * 1000,
  delivered: null,
  return: 60 * 60 * 1000,
  cancel: null,
  unknown: 60 * 60 * 1000,
};

const STATUS_VI = {
  Created: "Don hang da duoc tao",
  FMHub_Pickup_Done: "Don vi van chuyen da lay hang",
  FMHub_Received: "Da chuyen toi buu cuc lay",
  FMHub_LHTransporting: "Dang van chuyen tu buu cuc lay",
  SOC_Received: "Da chuyen toi trung tam khai thac",
  SOC_LHUnloading: "Dang do hang tai trung tam khai thac",
  SOC_LHUnloaded: "Da do hang tai trung tam khai thac",
  SOC_LHTransporting: "Dang van chuyen giua cac trung tam khai thac",
  Return_SOC_Received: "Da hoan ve trung tam khai thac",
  Return_SOC_LHTransporting: "Dang chuyen hoan giua cac trung tam khai thac",
  Return_FMHub_Received: "Da hoan ve buu cuc lay",
  Return_FMHub_Returning: "Dang chuyen hoan cho nguoi gui",
  Return_FMHub_Returned: "Da chuyen hoan cho nguoi gui",
  SP_Collection_Collected: "Giao hàng thành công",
  SP_Collection_Assigned: "Chờ lấy hàng",
  LMHub_Assigned: "Đến bưu cục giao",
  LMHub_Received: "Đến bưu cục giao",
  LMHub_Delivering: "Đang giao hàng",
  Delivered: "Giao thành công",
};

function normalizeTrackingNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function signTrackingNumber(trackingNumber) {
  const normalized = normalizeTrackingNumber(trackingNumber);
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = crypto
    .createHash("sha256")
    .update(`${normalized}${timestamp}${SPX_SECRET}`)
    .digest("hex");

  return `${normalized}|${timestamp}${hash}`;
}

function formatVietnamTime(timestamp) {
  if (!timestamp) return "-";

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

function statusText(status) {
  return STATUS_VI[status] || status || "-";
}

function nowIso() {
  return new Date().toISOString();
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (_) {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function loadConfig() {
  const config = readJsonFile(CONFIG_FILE, {});
  return {
    telegramBotToken:
      process.env.TELEGRAM_BOT_TOKEN || config.telegramBotToken || "",
    telegramChatId:
      process.env.TELEGRAM_CHAT_ID || config.telegramChatId || "",
    telegramPolling:
      process.env.TELEGRAM_POLLING === "0" ? false : config.telegramPolling !== false,
  };
}

function loadWatchlist() {
  const data = readJsonFile(WATCH_FILE, []);
  return Array.isArray(data) ? data : [];
}

function saveWatchlist(items) {
  writeJsonFile(WATCH_FILE, items);
}

function detectCarrier(code, carrier) {
  if (carrier && carrier !== "auto") return carrier.toLowerCase();
  return normalizeTrackingNumber(code).startsWith("SPX") ? "spx" : "ghn";
}

function statusCategory(status, text = "", message = "") {
  const source = `${status || ""} ${text || ""} ${message || ""}`.toLowerCase();
  const normalized = stripVietnamese(source);
  const statusOnly = String(status || "").toLowerCase();

  if (statusOnly.includes("cancel") || /\b(cancel|canceled|cancelled|da huy|huy don|don huy)\b/.test(normalized)) return "cancel";
  if (/\b(fail|failed|that bai|giao that bai|khong giao duoc)\b/.test(normalized)) return "failed";
  if (
    statusOnly === "sp_collection_collected" ||
    normalized.includes("delivered") ||
    normalized.includes("da giao") ||
    normalized.includes("giao thanh cong") ||
    normalized.includes("giao hang thanh cong")
  ) return "delivered";
  if (normalized.includes("delivering") || normalized.includes("dang giao") || normalized.includes("nhan vien giao")) return "delivering";
  if (normalized.includes("den buu cuc giao") || normalized.includes("buu cuc giao") || normalized.includes("delivery hub")) return "at_delivery_hub";
  if (normalized.includes("transporting") || normalized.includes("van chuyen") || normalized.includes("trung chuyen") || normalized.includes("ket noi")) return "transporting";
  if (normalized.includes("storing") || normalized.includes("warehouse") || normalized.includes("kho") || normalized.includes("trung tam khai thac")) return "storing";
  if (normalized.includes("lmhub") || normalized.includes("last mile")) return "at_delivery_hub";
  if (normalized.includes("received") || normalized.includes("picked_to_storing") || normalized.includes("buu cuc")) return "picked_to_storing";
  if (normalized.includes("pickup_done") || normalized.includes("picked") || normalized.includes("collected") || normalized.includes("da lay")) return "picked_to_storing";
  if (normalized.includes("picking") || normalized.includes("dang lay")) return "ready_to_pick";
  if (normalized.includes("ready") || normalized.includes("created") || normalized.includes("cho lay") || normalized.includes("cho lay hang") || normalized.includes("tao don")) return "ready_to_pick";
  if (normalized.includes("return") || normalized.includes("hoan")) return "return";
  return "unknown";
}

function nextCheckAtFor(category) {
  const interval = Object.prototype.hasOwnProperty.call(CHECK_INTERVALS, category)
    ? CHECK_INTERVALS[category]
    : CHECK_INTERVALS.unknown;
  if (interval === null) return null;
  return new Date(Date.now() + interval).toISOString();
}

function safeString(value) {
  if (value == null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatBotTime(value) {
  if (!value) return "-";
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const numeric = Number(value);
    return formatVietnamTime(numeric < 10000000000 ? numeric : numeric / 1000);
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return formatVietnamTime(Math.floor(parsed / 1000));
}

function formatClock(value) {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return formatBotTime(value);

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(parsed));
}

function formatShortDateTime(value) {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return formatBotTime(value);

  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(parsed)).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

function separator() {
  return "━━━━━━━━━━━━━━━━━━━━━━━";
}

function categoryIcon(category) {
  return {
    ready_to_pick: "📦",
    picking: "👨‍💼",
    picked: "✅",
    picked_to_storing: "✅",
    storing: "🏢",
    transporting: "🚛",
    at_delivery_hub: "🏬",
    delivering: "🛵",
    delivered: "🎉",
    failed: "❌",
    return: "↩️",
    cancel: "❌",
    unknown: "📦",
  }[category || "unknown"] || "📦";
}

function categoryLabel(category, fallback = "") {
  return {
    ready_to_pick: "Chờ lấy hàng",
    picking: "Đang lấy hàng",
    picked: "Đã lấy hàng",
    picked_to_storing: "Đã lấy hàng",
    storing: "Nhập kho",
    transporting: "Trung chuyển",
    at_delivery_hub: "Đến bưu cục giao",
    delivering: "Đang giao hàng",
    delivered: "Giao thành công",
    failed: "Giao thất bại",
    return: "Hoàn hàng",
    cancel: "Đã hủy",
    unknown: fallback || "Đang cập nhật",
  }[category || "unknown"] || fallback || "Đang cập nhật";
}

function intervalLabel(category) {
  const interval = CHECK_INTERVALS[category || "unknown"] ?? CHECK_INTERVALS.unknown;
  if (interval === null) return "Ngừng theo dõi";
  if (interval === 5 * 60 * 1000) return "5 phút / lần";
  if (interval === 15 * 60 * 1000) return "15 phút / lần";
  if (interval === 60 * 60 * 1000) return "1 giờ / lần";
  return `${Math.round(interval / 60000)} phút / lần`;
}

function displayStatus(statusTextValue, category) {
  const label = categoryLabel(category, statusTextValue);
  return label || statusTextValue || "-";
}

function sharedIntervalLabel(items) {
  const activeItems = (items || []).filter((item) => item.active && !item.paused);
  if (!activeItems.length) return "đã ngừng";
  const labels = [...new Set(activeItems.map((item) => intervalLabel(item.category)))];
  return labels.length === 1 ? labels[0] : "theo từng trạng thái";
}

function minutesUntil(value) {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  const diff = Math.max(0, parsed - Date.now());
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function todayNotificationCount(items) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return items.filter((item) => {
    if (!item.lastNotifiedAt) return false;
    const parsed = Date.parse(item.lastNotifiedAt);
    if (!Number.isFinite(parsed)) return false;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parsed)) === today;
  }).length;
}

function extractLocationFromText(value) {
  const text = safeString(value);
  const bracket = text.match(/\[([^\]]+)\]/);
  if (bracket) return bracket[1].trim();
  const at = text.match(/\btại\s+(.+)$/i);
  if (at) return at[1].trim();
  return "-";
}

function locationText(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    return (
      value.address ||
      value.name ||
      value.warehouse_name ||
      value.warehouseName ||
      value.current_warehouse ||
      ""
    );
  }
  return "";
}

function commandCode(text) {
  const parts = String(text || "").trim().split(/\s+/);
  return extractTrackingCode(parts.slice(1).join(" ")) || extractTrackingCode(text);
}

function commandPayload(text) {
  return String(text || "").trim().replace(/^\/\S+\s*/i, "").trim();
}

function stripVietnamese(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function extractTrackingCode(text) {
  const upper = normalizeTrackingNumber(String(text || "").replace(/[^\w\s-]/g, " "));
  const spx = upper.match(/\bSPX[A-Z0-9]{6,}\b/);
  if (spx) return spx[0];

  const blocked = new Set([
    "START",
    "THEODOI",
    "DANHSACH",
    "KIEMTRA",
    "CHITIET",
    "TAMDUNG",
    "TIEPTUC",
    "XOA",
    "THONGKE",
    "CAIDAT",
    "BATTHONGBAO",
    "TATTHONGBAO",
    "HELP",
    "LIST",
    "REMOVE",
    "DELETE",
    "WATCH",
    "CHECK",
    "THEO",
    "DOI",
    "TRA",
    "CUU",
    "KIEM",
    "HANG",
    "TRANG",
    "THAI",
  ]);
  const generic = upper
    .split(/\s+/)
    .map((part) => part.replace(/^-+|-+$/g, ""))
    .find((part) => /^[A-Z0-9-]{8,40}$/.test(part) && !blocked.has(part));

  return generic || "";
}

function parseWatchEntries(text) {
  const payload = commandPayload(text);
  const source = payload || text;
  const rows = String(source || "")
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s*;\s*/))
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  const entries = [];
  const seen = new Set();

  rows.forEach((row) => {
    const parts = row.split(/\s*[|=]\s*/).filter(Boolean);
    let code = "";
    let label = "";

    if (parts.length > 1) {
      const codeIndex = parts.findIndex((part) => extractTrackingCode(part));
      if (codeIndex >= 0) {
        code = extractTrackingCode(parts[codeIndex]);
        label = parts.filter((_, index) => index !== codeIndex).join(" - ").trim();
      }
    }

    if (!code) {
      code = extractTrackingCode(row);
      if (code) {
        label = row
          .replace(new RegExp(code, "i"), "")
          .replace(/^[\s:|=\-–—]+|[\s:|=\-–—]+$/g, "")
          .trim();
      }
    }

    if (!code) return;
    const normalized = normalizeTrackingNumber(code);
    if (seen.has(normalized)) return;
    seen.add(normalized);

    entries.push({
      code: normalized,
      carrier: detectCarrier(normalized, "auto"),
      label,
    });
  });

  return entries;
}

function parseTelegramIntent(text) {
  const raw = String(text || "").trim();
  const normalized = stripVietnamese(raw).toLowerCase();
  const command = normalized.split(/\s+/)[0] || "";
  const query = commandPayload(raw);
  const code = command.startsWith("/") ? commandCode(raw) : extractTrackingCode(raw);

  if (!raw || command === "/start") {
    return { action: "start", code, query };
  }
  if (command === "/help" || normalized === "help") {
    return { action: "help", code, query };
  }
  if (command === "/danhsach" || command === "/list" || /\b(danh sach|list|dang theo doi)\b/.test(normalized)) {
    return { action: "list", code, query };
  }
  if (command === "/thongke") {
    return { action: "stats", code, query };
  }
  if (command === "/caidat") {
    return { action: "settings", code, query };
  }
  if (command === "/batthongbao") {
    return { action: "notify_on", code, query };
  }
  if (command === "/tatthongbao") {
    return { action: "notify_off", code, query };
  }
  if (command === "/chitiet") {
    return { action: "detail", code, query };
  }
  if (command === "/tamdung") {
    return { action: "pause", code, query };
  }
  if (command === "/tieptuc") {
    return { action: "resume", code, query };
  }
  if (
    command === "/xoa" ||
    command === "/remove" ||
    command === "/delete" ||
    /\b(xoa|bo theo doi|huy theo doi|ngung theo doi)\b/.test(normalized)
  ) {
    return { action: "remove", code, query };
  }
  if (
    command === "/theodoi" ||
    command === "/watch" ||
    /\b(theo doi|theodoi|bao khi|canh bao|them don)\b/.test(normalized)
  ) {
    return { action: "watch", code, query };
  }
  if (
    command === "/kiemtra" ||
    command === "/check" ||
    code ||
    /\b(tra|kiem tra|check|hanh trinh|trang thai)\b/.test(normalized)
  ) {
    return { action: "check", code, query };
  }

  return { action: "unknown", code, query };
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

function collectArrays(value, output, name = "") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    output.push({ name, value });
    value.forEach((item) => collectArrays(item, output, name));
    return;
  }
  Object.keys(value).forEach((key) => collectArrays(value[key], output, key));
}

function getField(object, keys) {
  if (!object || typeof object !== "object") return "";
  for (const key of keys) {
    if (object[key] != null && object[key] !== "") return object[key];
  }
  return "";
}

async function promptTrackingNumber() {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question("Nhap ma van don SPX: ");
  } finally {
    rl.close();
  }
}

async function fetchTracking(trackingNumber) {
  const signed = signTrackingNumber(trackingNumber);
  const url = TRACKING_API + encodeURIComponent(signed);
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      referer: `https://spx.vn/track?tracking_number=${encodeURIComponent(
        trackingNumber,
      )}`,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      "x-language": "vi",
    },
  });

  if (!response.ok) {
    throw new Error(`SPX API tra ve HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.retcode !== 0 || !payload.data) {
    throw new Error(payload.message || `SPX API tra ve retcode ${payload.retcode}`);
  }

  return payload.data;
}

async function requestGhnJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      token: "",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = null;
  }

  if (!response.ok && !payload) {
    throw new Error(`GHN API tra ve HTTP ${response.status}`);
  }

  return payload;
}

async function fetchGhnTracking(orderCode) {
  const normalized = normalizeTrackingNumber(orderCode);
  const tracking = await requestGhnJson(`${GHN_API_BASE}/tracking-logs`, {
    method: "POST",
    body: JSON.stringify({ order_code: normalized }),
  });

  if (tracking.code !== 200) {
    throw new Error(
      tracking.code_message_value ||
        tracking.message ||
        `GHN API tra ve code ${tracking.code}`,
    );
  }

  let orderLogs = null;
  try {
    orderLogs = await requestGhnJson(
      `${GHN_API_BASE}/order-logs?order_code=${encodeURIComponent(normalized)}`,
      { method: "GET" },
    );
  } catch (_) {
    orderLogs = null;
  }

  return { tracking, orderLogs };
}

function extractGhnLogs(data, orderLogs) {
  const direct =
    data.tracking_logs ||
    data.trackingLogs ||
    data.logs ||
    data.histories ||
    (orderLogs && orderLogs.data && orderLogs.data.data);

  if (Array.isArray(direct)) return direct;

  const candidates = [];
  collectArrays(data, candidates);
  collectArrays(orderLogs && orderLogs.data, candidates);

  const named =
    candidates.find((item) => /tracking_logs|trackingLogs/i.test(item.name) && item.value.length) ||
    candidates.find((item) => /log|tracking|history/i.test(item.name) && item.value.length) ||
    candidates.find((item) => /data/i.test(item.name) && item.value.length);

  return named ? named.value : [];
}

function snapshotSpx(code, data) {
  const latest = Array.isArray(data.tracking_list) ? data.tracking_list[0] : null;
  const status = data.current_status || (latest && latest.status) || "";
  const statusLabel = statusText(status);
  const latestMessage = latest ? latest.message || statusText(latest.status) : "";
  const category = statusCategory(status, statusLabel, latestMessage);
  const history = Array.isArray(data.tracking_list)
    ? data.tracking_list.map((item) => {
        const title = statusText(item.status);
        const message = item.message || title;
        const itemCategory = statusCategory(item.status, title, message);
        return {
          status: item.status || "",
          title,
          category: itemCategory,
          message,
          location: extractLocationFromText(message),
          time: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : "",
        };
      })
    : [];

  return {
    carrier: "spx",
    code: data.sls_tracking_number || normalizeTrackingNumber(code),
    status,
    statusLabel,
    category,
    latestTime: latest && latest.timestamp ? new Date(latest.timestamp * 1000).toISOString() : "",
    latestMessage,
    latestLocation: latest ? extractLocationFromText(latestMessage) : "-",
    history,
    raw: data,
  };
}

function snapshotGhn(code, payload) {
  const tracking = payload.tracking || {};
  const orderLogs = payload.orderLogs || null;
  const data = tracking.data || {};
  const orderInfo = data.order_info || data.orderInfo || data;
  const logs = extractGhnLogs(data, orderLogs);
  const sortedLogs = Array.isArray(logs)
    ? [...logs].sort((a, b) => {
        const at = eventTimeMs(getField(a, ["action_at", "ACTION_AT", "datetime", "DATETIME", "created_at", "CREATED_AT", "updated_at", "UPDATED_AT", "time", "TIME", "timestamp"]));
        const bt = eventTimeMs(getField(b, ["action_at", "ACTION_AT", "datetime", "DATETIME", "created_at", "CREATED_AT", "updated_at", "UPDATED_AT", "time", "TIME", "timestamp"]));
        return bt - at;
      })
    : [];
  const latest = sortedLogs[0] || {};
  const status =
    getField(latest, ["status", "STATUS", "status_code", "statusCode"]) ||
    getField(orderInfo, ["status", "STATUS", "current_status", "currentStatus"]) ||
    "";
  const statusLabel =
    getField(latest, ["status_name", "statusName", "information", "INFORMATION", "action", "ACTION"]) ||
    getField(orderInfo, ["status_name", "statusName", "status", "STATUS"]) ||
    status ||
    "Da nhan du lieu";
  const latestMessage =
    getField(latest, ["content", "CONTENT", "message", "MESSAGE", "description", "DESCRIPTION", "reason", "REASON"]) ||
    statusLabel;
  const latestTime =
    getField(latest, ["action_at", "ACTION_AT", "datetime", "DATETIME", "created_at", "CREATED_AT", "updated_at", "UPDATED_AT", "time", "TIME", "timestamp"]) ||
    getField(orderInfo, ["updated_date", "UPDATED_DATE", "created_date", "CREATED_DATE", "updated_at", "UPDATED_AT"]);
  const category = statusCategory(status, statusLabel, latestMessage);
  const history = sortedLogs.map((item) => {
    const itemStatus = getField(item, ["status", "STATUS", "status_code", "statusCode"]);
    const itemTitle =
      getField(item, ["status_name", "statusName", "information", "INFORMATION", "action", "ACTION"]) ||
      itemStatus ||
      "Cập nhật";
    const itemMessage =
      getField(item, ["content", "CONTENT", "message", "MESSAGE", "description", "DESCRIPTION", "reason", "REASON"]) ||
      itemTitle;
    const itemCategory = statusCategory(itemStatus, itemTitle, itemMessage);
    const itemTime = getField(item, ["action_at", "ACTION_AT", "datetime", "DATETIME", "created_at", "CREATED_AT", "updated_at", "UPDATED_AT", "time", "TIME", "timestamp"]);

    return {
      status: safeString(itemStatus),
      title: safeString(itemTitle),
      category: itemCategory,
      message: safeString(itemMessage),
      location:
        locationText(getField(item, ["location", "LOCATION", "warehouse_name", "warehouseName", "current_warehouse"])) ||
        extractLocationFromText(itemMessage),
      time: itemTime ? safeString(itemTime) : "",
    };
  });
  const latestLocation =
    locationText(getField(latest, ["location", "LOCATION", "warehouse_name", "warehouseName", "current_warehouse"])) ||
    extractLocationFromText(latestMessage);

  return {
    carrier: "ghn",
    code:
      getField(orderInfo, ["order_code", "orderCode", "client_order_code"]) ||
      normalizeTrackingNumber(code),
    status,
    statusLabel: safeString(statusLabel),
    category,
    latestTime: latestTime ? safeString(latestTime) : "",
    latestMessage: safeString(latestMessage),
    latestLocation,
    history,
    raw: payload,
  };
}

async function fetchSnapshot(carrier, code) {
  if (carrier === "spx") {
    return snapshotSpx(code, await fetchTracking(code));
  }
  if (carrier === "ghn") {
    return snapshotGhn(code, await fetchGhnTracking(code));
  }
  throw new Error(`Nha van chuyen khong ho tro: ${carrier}`);
}

function snapshotKey(snapshot) {
  return [
    snapshot.status || "",
    snapshot.statusLabel || "",
    snapshot.latestTime || "",
    snapshot.latestMessage || "",
  ].join("|");
}

function telegramMessage(item, snapshot, oldStatusText) {
  if (snapshot.category === "delivered") {
    return [
      separator(),
      "🎉 GIAO HÀNG THÀNH CÔNG",
      separator(),
      "",
      `📦 ${snapshot.code}`,
      item.label ? `🏷 ${item.label}` : "",
      "",
      "👤 Người nhận đã nhận hàng",
      "",
      `📍 ${snapshot.latestLocation || "-"}`,
      "",
      `🕒 ${formatClock(snapshot.latestTime)}`,
      "",
      "🤖 Bot đã tự động",
      "ngừng theo dõi đơn này",
      "",
      separator(),
    ].join("\n");
  }

  const oldStatus = oldStatusText || "Trạng thái trước";
  const newStatus = displayStatus(snapshot.statusLabel, snapshot.category);

  return [
    separator(),
    "🔔 CẬP NHẬT VẬN ĐƠN",
    separator(),
    "",
    `📦 ${snapshot.code}`,
    item.label ? `🏷 ${item.label}` : "",
    "",
    `${categoryIcon(statusCategory("", oldStatus, ""))} ${oldStatus}`,
    "",
    "      ⬇️",
    "",
    `${categoryIcon(snapshot.category)} ${newStatus}`,
    "",
    `📍 ${snapshot.latestLocation || "-"}`,
    "",
    `🕒 ${formatClock(snapshot.latestTime)}`,
    "",
    separator(),
  ].join("\n");
}

function trackingReply(snapshot) {
  const status = displayStatus(snapshot.statusLabel, snapshot.category);

  return [
    `📦 ${snapshot.code}`,
    separator(),
    `${categoryIcon(snapshot.category)} Trạng thái hiện tại`,
    status,
    "📍 Vị trí",
    snapshot.latestLocation || "-",
    "🕒 Cập nhật",
    formatShortDateTime(snapshot.latestTime),
    "⏱️ Kiểm tra tiếp theo",
    snapshot.category === "delivered" || snapshot.category === "cancel"
      ? "Đã ngừng theo dõi"
      : formatClock(nextCheckAtFor(snapshot.category)),
  ].filter(Boolean).join("\n");
}

function startMessage(name, chatId = "") {
  const items = chatId ? watchItemsForChat(chatId) : loadWatchlist();
  const delivering = items.filter((item) => item.category === "delivering").length;

  return [
    "🤖 BOT THEO DÕI VẬN ĐƠN",
    separator(),
    "",
    `👤 Người dùng: ${name || "bạn"}`,
    "",
    `📦 Đang theo dõi: ${items.length} đơn`,
    `🔔 Thông báo hôm nay: ${todayNotificationCount(items)}`,
    `🛵 Đang giao: ${delivering} đơn`,
    "",
    separator(),
    "",
    "📦 /theodoi",
    "📋 /danhsach",
    "🔍 /kiemtra",
    "📊 /thongke",
    "⚙️ /caidat",
    "",
    separator(),
  ].join("\n");
}

function telegramHelpMessage() {
  return startMessage("bạn");
}

function watchAddedMessage(item) {
  const status = displayStatus(item.lastStatusText, item.category);

  return [
    "📦 THÊM VẬN ĐƠN",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "✅ Thành công: 1",
    "",
    `📦 ${item.code}`,
    item.label ? `└ 🏷 ${item.label}` : "",
    `└ ${categoryIcon(item.category)} ${status}`,
    item.lastLocation && item.lastLocation !== "-" ? `└ 📍 ${item.lastLocation}` : "",
    "",
    "━━━━━━━━━━━━━━",
    "",
    `⏱ Chu kỳ kiểm tra: ${intervalLabel(item.category)}`,
  ].filter((line) => line !== "").join("\n");
}

function batchWatchMessage(items, errors = []) {
  return [
    "📦 THÊM NHIỀU VẬN ĐƠN",
    "",
    "━━━━━━━━━━━━━━",
    "",
    `✅ Thành công: ${items.length}`,
    errors.length ? `⚠️ Lỗi: ${errors.length}` : "",
    "",
    ...items.flatMap((item) => [
      `📦 ${item.code}`,
      item.label ? `└ 🏷 ${item.label}` : "",
      `└ ${categoryIcon(item.category)} ${displayStatus(item.lastStatusText, item.category)}`,
      "",
    ]),
    ...errors.flatMap((error) => [
      `⚠️ ${error.code || "Không rõ mã"}`,
      `└ ${error.message || "Không thêm được vận đơn"}`,
      "",
    ]),
    "━━━━━━━━━━━━━━",
    "",
    `⏱ Chu kỳ kiểm tra: ${sharedIntervalLabel(items)}`,
  ].filter((line) => line !== "").join("\n");
}

function detailMessage(snapshot) {
  const events = Array.isArray(snapshot.history) ? snapshot.history.slice().reverse() : [];
  const lines = [];

  if (events.length) {
    events.forEach((event, index) => {
      lines.push(`🕒 ${formatShortDateTime(event.time)}`);
      lines.push(`${categoryIcon(event.category)} ${displayStatus(event.title, event.category)}`);
      if (index < events.length - 1) {
        lines.push("");
        lines.push("⬇️");
        lines.push("");
      }
    });
  } else {
    lines.push("🕒 Chờ cập nhật...");
  }

  if (!["delivered", "cancel"].includes(snapshot.category)) {
    lines.push("");
    lines.push("⬇️");
    lines.push("");
    lines.push("🕒 Chờ cập nhật...");
  }

  return [
    "📜 HÀNH TRÌNH ĐƠN HÀNG",
    separator(),
    "",
    ...lines,
    "",
    separator(),
  ].join("\n");
}

async function telegramApi(method, body = {}) {
  const config = loadConfig();
  const token = config.telegramBotToken;

  if (!token) {
    throw new Error("Chua cau hinh TELEGRAM_BOT_TOKEN.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error((payload && payload.description) || `Telegram HTTP ${response.status}`);
  }

  return payload;
}

async function sendTelegram(text, chatIdOverride, parseMode) {
  const config = loadConfig();
  const chatId = chatIdOverride || config.telegramChatId;

  if (!chatId) {
    throw new Error("Chua cau hinh TELEGRAM_CHAT_ID.");
  }

  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (parseMode) {
    payload.parse_mode = parseMode;
  }

  return telegramApi("sendMessage", payload);
}

async function checkWatchItem(item, options = {}) {
  const carrier = detectCarrier(item.code, item.carrier);
  const snapshot = await fetchSnapshot(carrier, item.code);
  const key = snapshotKey(snapshot);
  const changed = item.lastKey && item.lastKey !== key;
  const firstCheck = !item.lastKey;
  const oldStatusText = item.lastStatusText || "";
  const checkedAt = nowIso();
  const nextCheckAt = nextCheckAtFor(snapshot.category);
  const active = !item.paused && nextCheckAt !== null;
  let notified = false;
  let notifyError = "";

  if (changed || (firstCheck && options.notifyFirstCheck)) {
    try {
      await sendTelegram(telegramMessage(item, snapshot, changed ? oldStatusText : ""), item.chatId);
      notified = true;
    } catch (error) {
      notifyError = error.message || "Loi gui Telegram";
    }
  }

  return {
    ...item,
    carrier,
    code: snapshot.code,
    active,
    paused: Boolean(item.paused),
    category: snapshot.category,
    lastKey: key,
    lastStatus: snapshot.status,
    lastStatusText: snapshot.statusLabel,
    lastMessage: snapshot.latestMessage,
    lastEventTime: snapshot.latestTime,
    lastLocation: snapshot.latestLocation,
    lastCheckedAt: checkedAt,
    nextCheckAt,
    lastError: notifyError,
    lastNotifiedAt: notified ? checkedAt : item.lastNotifiedAt || "",
    updatedAt: checkedAt,
  };
}

async function upsertWatchItem(inputItem, options = {}) {
  const code = normalizeTrackingNumber(inputItem.code);
  const carrier = detectCarrier(code, inputItem.carrier || "auto");

  if (!code) throw new Error("Ban chua nhap ma van don.");
  if (!["spx", "ghn"].includes(carrier)) {
    throw new Error("Nha van chuyen khong hop le.");
  }

  const items = loadWatchlist();
  const existing = items.find((item) => item.code === code && item.carrier === carrier);
  const base = existing || {
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    lastKey: "",
    lastStatus: "",
    lastStatusText: "",
    lastMessage: "",
    lastEventTime: "",
    lastLocation: "",
    lastCheckedAt: "",
    nextCheckAt: "",
    lastError: "",
    lastNotifiedAt: "",
  };

  const item = {
    ...base,
    carrier,
    code,
    label: inputItem.label || base.label || "",
    chatId: inputItem.chatId || base.chatId || "",
    active: true,
    paused: false,
    updatedAt: nowIso(),
  };

  const checked = await checkWatchItem(item, {
    notifyFirstCheck: Boolean(options.notifyFirstCheck),
  });

  if (existing) {
    const index = items.findIndex((entry) => entry.id === existing.id);
    items[index] = checked;
  } else {
    items.push(checked);
  }
  saveWatchlist(items);

  return checked;
}

function removeWatchItem(code, carrier, chatId = "") {
  const normalized = normalizeTrackingNumber(code);
  const detectedCarrier = detectCarrier(normalized, carrier || "auto");
  const items = loadWatchlist();
  const nextItems = items.filter((item) => {
    const sameCode = item.code === normalized && item.carrier === detectedCarrier;
    const sameChat = !chatId || !item.chatId || String(item.chatId) === String(chatId);
    return !(sameCode && sameChat);
  });

  if (nextItems.length !== items.length) {
    saveWatchlist(nextItems);
    return true;
  }
  return false;
}

function updateWatchState(code, carrier, chatId, patch) {
  const normalized = normalizeTrackingNumber(code);
  const detectedCarrier = detectCarrier(normalized, carrier || "auto");
  const items = loadWatchlist();
  const index = items.findIndex((item) => {
    const sameCode = item.code === normalized && item.carrier === detectedCarrier;
    const sameChat = !chatId || !item.chatId || String(item.chatId) === String(chatId);
    return sameCode && sameChat;
  });

  if (index < 0) return null;

  items[index] = {
    ...items[index],
    ...patch,
    updatedAt: nowIso(),
  };
  saveWatchlist(items);
  return items[index];
}

function watchItemsForChat(chatId) {
  const config = loadConfig();
  return loadWatchlist().filter((item) => {
    if (item.chatId) return String(item.chatId) === String(chatId);
    return String(config.telegramChatId || "") === String(chatId);
  });
}

function normalizeLookup(value) {
  return stripVietnamese(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function resolveWatchTarget(chatId, query, explicitCode = "") {
  const code = normalizeTrackingNumber(explicitCode || extractTrackingCode(query));
  const lookup = normalizeLookup(query);
  const items = watchItemsForChat(chatId);

  if (code) {
    const byCode = items.find((item) => item.code === code) || loadWatchlist().find((item) => item.code === code);
    return byCode || { code, carrier: detectCarrier(code, "auto") };
  }

  if (!lookup) return null;

  return items.find((item) => normalizeLookup(item.label) === lookup) ||
    items.find((item) => normalizeLookup(item.label).includes(lookup)) ||
    items.find((item) => normalizeLookup(item.code).includes(lookup)) ||
    null;
}

function watchListMessage(chatId) {
  const items = watchItemsForChat(chatId);
  if (!items.length) {
    return [
      "📋 DANH SÁCH VẬN ĐƠN",
      "━━━━━━━━━━━━━━",
      "",
      "Chưa có vận đơn nào đang theo dõi.",
      "",
      "━━━━━━━━━━━━━━",
    ].join("\n");
  }

  const pageItems = items.slice(0, 10);
  return [
    "📋 DANH SÁCH VẬN ĐƠN",
    "━━━━━━━━━━━━━━",
    "",
    ...pageItems.flatMap((item, index) => {
      const status = item.paused ? "Đã tạm dừng" : displayStatus(item.lastStatusText, item.category);
      return [
        `📦 ${item.code}`,
        item.label ? `└ 🏷 ${item.label}` : "",
        `└ ${categoryIcon(item.paused ? "unknown" : item.category)} ${status}`,
        `└ 🕒 Kiểm tra sau: ${item.active ? minutesUntil(item.nextCheckAt) : "đã ngừng"}`,
        "",
        index < pageItems.length - 1 ? "━━━━━━━━━━━━━━" : "",
        "",
      ].filter((line) => line !== "");
    }),
    `Trang 1/${Math.max(1, Math.ceil(items.length / 10))}`,
    "",
    `⏱ Chu kỳ kiểm tra: ${sharedIntervalLabel(items)}`,
    "━━━━━━━━━━━━━━",
  ].join("\n");
}

function statsMessage(chatId) {
  const items = watchItemsForChat(chatId);
  const count = (category) => items.filter((item) => item.category === category).length;
  const warehouse = count("storing") + count("picked_to_storing");
  const transporting = count("transporting");
  const deliveryHub = count("at_delivery_hub");
  const delivering = count("delivering");
  const done = count("delivered");

  return [
    "📊 THỐNG KÊ",
    "",
    separator(),
    "",
    `📦 Tổng đơn      : ${items.length}`,
    "",
    `🏢 Kho           : ${warehouse}`,
    `🚛 Trung chuyển  : ${transporting}`,
    `🏬 Bưu cục giao  : ${deliveryHub}`,
    `🛵 Đang giao     : ${delivering}`,
    `🎉 Hoàn thành    : ${done}`,
    "",
    separator(),
  ].join("\n");
}

function settingsMessage(chatId) {
  const items = watchItemsForChat(chatId);

  return [
    "⚙️ CÀI ĐẶT",
    separator(),
    "",
    "🔔 Thông báo",
    "BẬT",
    "",
    "📱 Telegram",
    "Đã liên kết",
    "",
    "📧 Email",
    "Chưa liên kết",
    "",
    "📦 Theo dõi tối đa",
    "500 đơn",
    "",
    separator(),
    "",
    "/batthongbao",
    "/tatthongbao",
    "",
    separator(),
  ].join("\n");
}

async function handleTelegramText(chatId, text, message = {}) {
  const intent = parseTelegramIntent(text);
  let code = intent.code;
  const userName =
    (message.from && [message.from.first_name, message.from.last_name].filter(Boolean).join(" ")) ||
    (message.chat && message.chat.first_name) ||
    "bạn";

  if (intent.action === "start") {
    await sendTelegram(startMessage(userName, chatId), chatId);
    return;
  }

  if (intent.action === "help") {
    await sendTelegram(startMessage(userName, chatId), chatId);
    return;
  }

  if (intent.action === "list") {
    await sendTelegram(watchListMessage(chatId), chatId);
    return;
  }

  if (intent.action === "stats") {
    await sendTelegram(statsMessage(chatId), chatId);
    return;
  }

  if (intent.action === "settings") {
    await sendTelegram(settingsMessage(chatId), chatId);
    return;
  }

  if (intent.action === "notify_on") {
    await sendTelegram([
      "🔔 THÔNG BÁO",
      separator(),
      "",
      "Đã bật thông báo trạng thái mới.",
      "",
      separator(),
    ].join("\n"), chatId);
    return;
  }

  if (intent.action === "notify_off") {
    await sendTelegram([
      "🔕 THÔNG BÁO",
      separator(),
      "",
      "Đã tắt thông báo trạng thái mới.",
      "",
      separator(),
    ].join("\n"), chatId);
    return;
  }

  if (intent.action === "watch") {
    const entries = parseWatchEntries(text);

    if (!entries.length) {
      await sendTelegram(
        "Bạn chưa nhập mã vận đơn.\n\nĐúng mẫu:\n/theodoi MÃ_VẬN_ĐƠN | BÍ_DANH\n\nVí dụ:\n/theodoi SPXVN060678551306 | Shopee khách A",
        chatId,
      );
      return;
    }

    if (entries.length > 1) {
      const added = [];
      const errors = [];

      for (const entry of entries) {
        try {
          added.push(await upsertWatchItem({ ...entry, chatId }));
        } catch (error) {
          errors.push({
            code: entry.code,
            message: error.message || "Không thêm được vận đơn",
          });
        }
      }

      await sendTelegram(batchWatchMessage(added, errors), chatId);
      return;
    }

    const item = await upsertWatchItem({ ...entries[0], chatId });
    await sendTelegram(watchAddedMessage(item), chatId);
    return;
  }

  const target = resolveWatchTarget(chatId, intent.query, code);
  if (target && target.code) {
    code = target.code;
  }

  if (!code) {
    await sendTelegram(
      "Bạn chưa nhập mã vận đơn hoặc bí danh.\n\nĐúng mẫu:\n/theodoi MÃ_VẬN_ĐƠN | BÍ_DANH\n/kiemtra MÃ_VẬN_ĐƠN\n/kiemtra BÍ_DANH",
      chatId,
    );
    return;
  }

  const carrier = detectCarrier(code, target && target.carrier ? target.carrier : "auto");

  if (intent.action === "remove") {
    const removed = removeWatchItem(code, carrier, chatId);
    await sendTelegram(
      removed
        ? [
            "🗑 Đã xóa vận đơn khỏi danh sách theo dõi",
            separator(),
            "",
            `📦 ${code}`,
            "",
            separator(),
          ].join("\n")
        : `Không tìm thấy vận đơn ${code} trong danh sách theo dõi.`,
      chatId,
    );
    return;
  }

  if (intent.action === "pause") {
    const item = updateWatchState(code, carrier, chatId, {
      active: false,
      paused: true,
      nextCheckAt: "",
    });
    await sendTelegram(
      item
        ? [
            "⏸ Đã tạm dừng theo dõi",
            separator(),
            "",
            `📦 ${code}`,
            "",
            "Bot sẽ không kiểm tra vận đơn này cho đến khi bạn bật lại.",
            "",
            separator(),
          ].join("\n")
        : `Không tìm thấy vận đơn ${code} trong danh sách theo dõi.`,
      chatId,
    );
    return;
  }

  if (intent.action === "resume") {
    const current = updateWatchState(code, carrier, chatId, {
      paused: false,
      active: true,
    });
    if (!current) {
      await sendTelegram(`Không tìm thấy vận đơn ${code} trong danh sách theo dõi.`, chatId);
      return;
    }

    const item = await upsertWatchItem({ code, carrier, chatId });
    await sendTelegram(
      [
        "▶️ Đã tiếp tục theo dõi",
        separator(),
        "",
        `📦 ${item.code}`,
        "",
        "⏱ Chu kỳ kiểm tra:",
        intervalLabel(item.category),
        "",
        separator(),
      ].join("\n"),
      chatId,
    );
    return;
  }

  if (intent.action === "detail") {
    const snapshot = await fetchSnapshot(carrier, code);
    await sendTelegram(detailMessage(snapshot), chatId);
    return;
  }

  if (intent.action === "check") {
    const snapshot = await fetchSnapshot(carrier, code);
    await sendTelegram(trackingReply(snapshot), chatId);
    return;
  }

  await sendTelegram(telegramHelpMessage(), chatId);
}

async function pollTelegramUpdates() {
  const state = readJsonFile(TELEGRAM_STATE_FILE, { offset: 0 });
  const payload = await telegramApi("getUpdates", {
    offset: state.offset || 0,
    timeout: 0,
    allowed_updates: ["message"],
  });
  const updates = Array.isArray(payload.result) ? payload.result : [];

  for (const update of updates) {
    state.offset = update.update_id + 1;
    const message = update.message || {};
    const chatId = message.chat && message.chat.id;
    const text = message.text || "";

    if (!chatId || !text) continue;

    try {
      await handleTelegramText(chatId, text, message);
    } catch (error) {
      await sendTelegram(
        `Minh chua tra duoc don nay: ${error.message || "loi khong xac dinh"}`,
        chatId,
      ).catch(() => {});
    }
  }

  writeJsonFile(TELEGRAM_STATE_FILE, state);
}

let botChecking = false;
let telegramPolling = false;

async function runBotTick() {
  if (botChecking) return;
  botChecking = true;

  try {
    const items = loadWatchlist();
    let changedList = false;
    const now = Date.now();

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.active) continue;
      if (item.nextCheckAt && Date.parse(item.nextCheckAt) > now) continue;

      try {
        items[index] = await checkWatchItem(item);
      } catch (error) {
        items[index] = {
          ...item,
          lastCheckedAt: nowIso(),
          nextCheckAt: new Date(Date.now() + CHECK_INTERVALS.unknown).toISOString(),
          lastError: error.message || "Loi kiem tra don hang",
          updatedAt: nowIso(),
        };
      }
      changedList = true;
    }

    if (changedList) saveWatchlist(items);
  } finally {
    botChecking = false;
  }
}

function startBotScheduler() {
  runBotTick().catch((error) => console.error(`Bot tick loi: ${error.message}`));
  setInterval(() => {
    runBotTick().catch((error) => console.error(`Bot tick loi: ${error.message}`));
  }, BOT_TICK_MS);
}

function startTelegramPolling() {
  const config = loadConfig();
  if (!config.telegramPolling || !config.telegramBotToken) {
    console.log("Telegram polling dang tat hoac chua co token.");
    return;
  }

  const run = async () => {
    if (telegramPolling) return;
    telegramPolling = true;
    try {
      await pollTelegramUpdates();
    } catch (error) {
      console.error(`Telegram polling loi: ${error.message}`);
    } finally {
      telegramPolling = false;
    }
  };

  run();
  setInterval(run, TELEGRAM_POLL_MS);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body qua lon."));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(new Error("JSON body khong hop le."));
      }
    });
    request.on("error", reject);
  });
}

function publicWatchItem(item) {
  return {
    id: item.id,
    carrier: item.carrier,
    code: item.code,
    label: item.label || "",
    active: item.active,
    paused: Boolean(item.paused),
    category: item.category,
    lastStatus: item.lastStatus,
    lastStatusText: item.lastStatusText,
    lastMessage: item.lastMessage,
    lastEventTime: item.lastEventTime,
    lastLocation: item.lastLocation,
    lastCheckedAt: item.lastCheckedAt,
    nextCheckAt: item.nextCheckAt,
    lastError: item.lastError || "",
    lastNotifiedAt: item.lastNotifiedAt || "",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function createServer() {
  const htmlPath = path.join(__dirname, "tramvd.html");

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (url.pathname === "/" || url.pathname === "/tramvd.html") {
        const html = fs.readFileSync(htmlPath, "utf8");
        sendHtml(response, 200, html);
        return;
      }

      if (url.pathname === "/api/spx-track") {
        const trackingNumber = normalizeTrackingNumber(url.searchParams.get("code"));
        if (!trackingNumber) {
          sendJson(response, 400, {
            ok: false,
            message: "Ban chua nhap ma van don.",
          });
          return;
        }

        const data = await fetchTracking(trackingNumber);
        sendJson(response, 200, { ok: true, data });
        return;
      }

      if (url.pathname === "/api/ghn-track") {
        const orderCode = normalizeTrackingNumber(url.searchParams.get("code"));
        if (!orderCode) {
          sendJson(response, 400, {
            ok: false,
            message: "Ban chua nhap ma van don.",
          });
          return;
        }

        const data = await fetchGhnTracking(orderCode);
        sendJson(response, 200, { ok: true, data });
        return;
      }

      if (url.pathname === "/api/watch" && request.method === "GET") {
        sendJson(response, 200, {
          ok: true,
          data: loadWatchlist().map(publicWatchItem),
        });
        return;
      }

      if (url.pathname === "/api/watch" && request.method === "POST") {
        const body = await readRequestBody(request);
        const entries = Array.isArray(body.items) && body.items.length
          ? body.items.map((item) => ({
              code: item.code,
              carrier: item.carrier || body.carrier || "auto",
              label: item.label || "",
              chatId: item.chatId || body.chatId || "",
            }))
          : parseWatchEntries(body.code || "").map((item) => ({
              ...item,
              carrier: body.carrier || item.carrier || "auto",
              label: body.label || item.label || "",
              chatId: body.chatId || "",
            }));

        if (!entries.length && body.code) {
          entries.push({
            code: body.code,
            carrier: body.carrier || "auto",
            label: body.label || "",
            chatId: body.chatId || "",
          });
        }

        if (!entries.length) {
          sendJson(response, 400, { ok: false, message: "Ban chua nhap ma van don." });
          return;
        }

        const checkedItems = [];
        const errors = [];

        for (const entry of entries) {
          try {
            checkedItems.push(await upsertWatchItem(entry, {
              notifyFirstCheck: Boolean(body.notifyFirstCheck),
            }));
          } catch (error) {
            errors.push({
              code: entry.code || "",
              message: error.message || "Khong them duoc don theo doi.",
            });
          }
        }

        if (!checkedItems.length && errors.length) {
          sendJson(response, 400, { ok: false, message: errors[0].message, errors });
          return;
        }

        sendJson(response, 200, {
          ok: true,
          data: checkedItems.length === 1
            ? publicWatchItem(checkedItems[0])
            : checkedItems.map(publicWatchItem),
          errors,
        });
        return;
      }

      if (url.pathname.startsWith("/api/watch/") && request.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.replace("/api/watch/", ""));
        const items = loadWatchlist();
        const nextItems = items.filter((item) => item.id !== id);

        if (nextItems.length === items.length) {
          sendJson(response, 404, { ok: false, message: "Khong tim thay don theo doi." });
          return;
        }

        saveWatchlist(nextItems);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname.startsWith("/api/watch/") && url.pathname.endsWith("/check") && request.method === "POST") {
        const id = decodeURIComponent(url.pathname.replace("/api/watch/", "").replace("/check", ""));
        const items = loadWatchlist();
        const index = items.findIndex((item) => item.id === id);

        if (index < 0) {
          sendJson(response, 404, { ok: false, message: "Khong tim thay don theo doi." });
          return;
        }

        items[index] = await checkWatchItem(items[index]);
        saveWatchlist(items);
        sendJson(response, 200, { ok: true, data: publicWatchItem(items[index]) });
        return;
      }

      if (url.pathname === "/api/telegram/test" && request.method === "POST") {
        const body = await readRequestBody(request);
        await sendTelegram(body.text || "Test Telegram tu bot tracking.", body.chatId);
        sendJson(response, 200, { ok: true });
        return;
      }

      sendJson(response, 404, { ok: false, message: "Not found" });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || "Co loi khi tra cuu don hang.",
      });
    }
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(port);
    });
  });
}

async function serve() {
  const preferredPort = Number(process.env.PORT || 8787);

  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    const server = createServer();
    try {
      await listen(server, port);
      console.log(`Tracking server dang chay: http://127.0.0.1:${port}/tramvd.html`);
      startBotScheduler();
      console.log("Bot theo doi don hang da bat dau chay nen.");
      startTelegramPolling();
      console.log("Bot Telegram da bat dau nhan tin nhan.");
      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE") {
        throw error;
      }
    }
  }

  throw new Error(`Khong tim thay cong trong tu ${preferredPort} den ${preferredPort + 19}.`);
}

function printTracking(data) {
  const trackingNumber = data.sls_tracking_number || "-";
  const currentStatus = statusText(data.current_status);
  const latest = Array.isArray(data.tracking_list) ? data.tracking_list[0] : null;

  console.log("");
  console.log(`Ma van don: ${trackingNumber}`);
  console.log(`Loai don: ${data.delivery_type || "-"}`);
  console.log(`Trang thai hien tai: ${currentStatus}`);

  if (latest) {
    console.log(`Cap nhat moi nhat: ${formatVietnamTime(latest.timestamp)}`);
    console.log(`Noi dung: ${latest.message || statusText(latest.status)}`);
  }

  console.log("");
  console.log("Lich trinh:");

  if (!Array.isArray(data.tracking_list) || data.tracking_list.length === 0) {
    console.log("- Khong co du lieu lich trinh.");
    return;
  }

  for (const item of data.tracking_list) {
    console.log(
      `- ${formatVietnamTime(item.timestamp)} | ${statusText(item.status)} | ${
        item.message || "-"
      }`,
    );
  }
}

async function main() {
  if (process.argv.includes("--serve")) {
    await serve();
    return;
  }

  const inputTrackingNumber = process.argv[2] || (await promptTrackingNumber());
  const trackingNumber = normalizeTrackingNumber(inputTrackingNumber);

  if (!trackingNumber) {
    throw new Error("Ban chua nhap ma van don.");
  }

  const data = await fetchTracking(trackingNumber);
  printTracking(data);
}

main().catch((error) => {
  console.error(`Loi: ${error.message}`);
  process.exitCode = 1;
});
