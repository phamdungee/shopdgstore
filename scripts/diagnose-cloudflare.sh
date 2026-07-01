#!/bin/bash
# ══════════════════════════════════════════════════════════
# DG Store - Script chẩn đoán kết nối Cloudflare → Origin
# Chạy trực tiếp trên VPS: bash scripts/diagnose-cloudflare.sh
# ══════════════════════════════════════════════════════════

PORT="${1:-3000}"
echo "═══════════════════════════════════════════════════"
echo "  DG Store - Chẩn đoán kết nối Cloudflare"
echo "  Port kiểm tra: $PORT"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Kiểm tra Node.js process ──
echo "▶ [1/6] Kiểm tra process Node.js đang chạy..."
NODE_PROCS=$(ps aux | grep -E "node|pm2" | grep -v grep)
if [ -z "$NODE_PROCS" ]; then
  echo "  ❌ KHÔNG tìm thấy process Node.js nào đang chạy!"
  echo "  → Hãy khởi động lại: pm2 start server.js hoặc node server.js"
else
  echo "  ✅ Tìm thấy process:"
  echo "$NODE_PROCS" | head -5 | sed 's/^/     /'
fi
echo ""

# ── 2. Kiểm tra PM2 (nếu có) ──
echo "▶ [2/6] Kiểm tra PM2 status..."
if command -v pm2 &> /dev/null; then
  pm2 status 2>/dev/null | head -15 | sed 's/^/     /'
else
  echo "  ℹ PM2 chưa được cài đặt (không bắt buộc)"
fi
echo ""

# ── 3. Kiểm tra port đang lắng nghe ──
echo "▶ [3/6] Kiểm tra port $PORT có đang lắng nghe không..."
PORT_CHECK=$(ss -tlnp 2>/dev/null | grep ":$PORT" || netstat -tlnp 2>/dev/null | grep ":$PORT")
if [ -z "$PORT_CHECK" ]; then
  echo "  ❌ Port $PORT KHÔNG có process nào lắng nghe!"
  echo "  → Ứng dụng chưa khởi động hoặc đang dùng port khác."
else
  echo "  ✅ Port $PORT đang được lắng nghe:"
  echo "$PORT_CHECK" | sed 's/^/     /'
fi
echo ""

# ── 4. Kiểm tra kết nối localhost ──
echo "▶ [4/6] Thử kết nối localhost:$PORT..."
if command -v curl &> /dev/null; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:$PORT/api/health" 2>/dev/null)
  if [ "$HTTP_CODE" = "000" ]; then
    echo "  ❌ Không thể kết nối tới http://localhost:$PORT (Connection refused/timeout)"
    echo "  → Ứng dụng chưa chạy hoặc bị crash."
  else
    echo "  ✅ HTTP Response Code: $HTTP_CODE"
    BODY=$(curl -s --max-time 5 "http://localhost:$PORT/api/health" 2>/dev/null)
    echo "  Response: $BODY"
  fi
else
  echo "  ℹ curl chưa cài đặt, bỏ qua bước này."
fi
echo ""

# ── 5. Kiểm tra firewall ──
echo "▶ [5/6] Kiểm tra firewall (ufw / iptables)..."
if command -v ufw &> /dev/null; then
  UFW_STATUS=$(sudo ufw status 2>/dev/null)
  echo "  UFW Status:"
  echo "$UFW_STATUS" | head -10 | sed 's/^/     /'
  
  # Kiểm tra port có được mở không
  if echo "$UFW_STATUS" | grep -qE "$PORT.*ALLOW|inactive"; then
    echo "  ✅ Port $PORT có vẻ được cho phép (hoặc firewall tắt)"
  else
    echo "  ⚠️  Port $PORT có thể bị chặn bởi firewall!"
    echo "  → Chạy: sudo ufw allow $PORT"
  fi
else
  echo "  ℹ ufw không có sẵn, kiểm tra iptables..."
  sudo iptables -L -n 2>/dev/null | grep -E "ACCEPT.*$PORT|Chain" | head -10 | sed 's/^/     /'
fi
echo ""

# ── 6. Kiểm tra DNS (resolve domain) ──
echo "▶ [6/6] Kiểm tra IP public của VPS..."
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 icanhazip.com 2>/dev/null)
if [ -n "$PUBLIC_IP" ]; then
  echo "  ✅ IP public VPS: $PUBLIC_IP"
  echo "  → Đảm bảo bản ghi A trong Cloudflare DNS trỏ đúng IP này."
else
  echo "  ⚠️  Không thể xác định IP public (VPS có thể không có internet)."
fi
echo ""

echo "═══════════════════════════════════════════════════"
echo "  CHECKLIST CLOUDFLARE DNS (kiểm tra thủ công):"
echo "═══════════════════════════════════════════════════"
echo "  □ Bản ghi A trỏ đúng IP VPS: $PUBLIC_IP"
echo "  □ Biểu tượng đám mây cam (Proxied) đã bật"
echo "  □ SSL/TLS mode: Full (strict) nếu VPS có SSL"
echo "  □ SSL/TLS mode: Flexible nếu VPS chỉ chạy HTTP"
echo "  □ Thử tạm tắt Proxy (đám mây xám) để test trực tiếp"
echo ""
echo "  Nếu VPS chỉ chạy HTTP (port $PORT) mà Cloudflare"
echo "  đang dùng SSL Full/Strict → sẽ bị lỗi 521/522/525."
echo "  → Đổi SSL mode sang 'Flexible' hoặc cài SSL trên VPS."
echo "═══════════════════════════════════════════════════"
