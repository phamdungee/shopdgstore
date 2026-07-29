// ===== JS tách từ index.html =====
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxUQLFSgSsXurtfPwesoYq0WkyecF7bXtkzQMj6xni5yvWTfvLiTAzx6d7eVYNUxJ9F7Q/exec"; 

        // BIẾN TRẠNG THÁI HỆ THỐNG
        let isLoggedIn = false; // Mặc định CHƯA đăng nhập để kích hoạt Auth Gate bảo vệ
        let globalOrderId = null;
        let pollingInterval = null;
        let duration = 600; 
        let countdownTimer = null;
        let isSuccessNotified = false; 

        function setLegacyText(id, value) {
            const element = document.getElementById(id);
            if (!element) return null;
            element.innerText = value;
            return element;
        }

        // KHỞI TẠO HOÀN CẢNH GIAO DIỆN AUTH BAN ĐẦU
        function renderAuthUI() {
            const authZone = document.getElementById('header-auth-zone');
            if (!isLoggedIn) {
                // Trạng thái chưa đăng nhập: Ẩn số dư, hiện nút Đăng nhập
                authZone.innerHTML = `
                    <button onclick="openAuthModal()" class="bg-gradient-to-r from-brand-blue to-brand-purple text-white font-bold text-xs px-5 py-2.5 rounded-full shadow-md shadow-blue-100 hover:opacity-90 transition transform hover:scale-105">
                        <i class="fa-solid fa-right-to-bracket mr-1.5"></i> Đăng nhập
                    </button>
                `;
            } else {
                // Trạng thái đã đăng nhập: Hiện số dư 500,000đ và Avatar mới
                authZone.innerHTML = `
                    <div onclick="switchTab('deposit')" class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-full px-4 py-1.5 items-center gap-2 flex cursor-pointer hover:opacity-80 transition">
                        <i class="fa-solid fa-wallet text-brand-blue"></i>
                        <div class="text-right">
                            <p class="text-[10px] text-slate-400 uppercase font-semibold leading-tight">Số dư</p>
                            <p class="text-xs font-bold text-brand-blue leading-tight">500,000đ</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 pl-1">
                        <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop" alt="User Avatar" class="w-10 h-10 rounded-full border-2 border-brand-blue/30 object-cover cursor-pointer hover:scale-105 transition duration-300">
                    </div>
                `;
            }
        }

        // ĐIỀU HƯỚNG VÀ CHẶN AUTH GATE NẾU YÊU CẦU CẦN QUYỀN RIÊNG TƯ
        function handleSecuredAction(successCallback) {
            if (!isLoggedIn) {
                triggerToast("Vui lòng đăng nhập hệ thống để thực hiện hành động này!");
                openAuthModal();
            } else {
                successCallback();
            }
        }

        // Mở / Đóng Modal Auth Gate
        function openAuthModal() {
            const modal = document.getElementById('auth-modal');
            const inner = modal.querySelector('div');
            modal.classList.remove('opacity-0', 'pointer-events-none');
            inner.classList.remove('scale-95');
        }

        function closeAuthModal() {
            const modal = document.getElementById('auth-modal');
            const inner = modal.querySelector('div');
            modal.classList.add('opacity-0', 'pointer-events-none');
            inner.classList.add('scale-95');
        }

        // Chuyển đổi tab Đăng nhập / Đăng ký mượt mà bên trong Modal
        function switchAuthTab(type) {
            const tabLogin = document.getElementById('tab-btn-login');
            const tabRegister = document.getElementById('tab-btn-register');
            const formLogin = document.getElementById('auth-form-login');
            const formRegister = document.getElementById('auth-form-register');

            if(type === 'login') {
                tabLogin.className = "font-bold text-sm text-brand-blue border-b-2 border-brand-blue pb-2 transition-all";
                tabRegister.className = "font-semibold text-sm text-slate-400 hover:text-slate-600 pb-2 transition-all";
                formLogin.classList.remove('hidden');
                formRegister.classList.add('hidden');
            } else {
                tabRegister.className = "font-bold text-sm text-brand-blue border-b-2 border-brand-blue pb-2 transition-all";
                tabLogin.className = "font-semibold text-sm text-slate-400 hover:text-slate-600 pb-2 transition-all";
                formRegister.classList.remove('hidden');
                formLogin.classList.add('hidden');
            }
        }

        // Giả lập Đăng nhập thành công và cập nhật UI ngay lập tức
        function simulateLoginSuccess() {
            isLoggedIn = true;
            renderAuthUI();
            closeAuthModal();
            triggerToast("Đăng nhập thành công! Tài khoản được cộng: 500,000đ");
        }

        // CHUYỂN TAB CHÍNH VÀ ĐỒNG BỘ TRẠNG THÁI MENUBAR SIDEBAR
        function switchTab(tabName) {
            const tabHome = document.getElementById('tab-home');
            const tabDeposit = document.getElementById('tab-deposit');
            const tabFallback = document.getElementById('tab-fallback');
            
            // Các tab chức năng cần chặn bảo mật Auth Gate
            if (['deposit', 'account', 'orders', 'history'].includes(tabName)) {
                if (!isLoggedIn) {
                    openAuthModal();
                    triggerToast("Hệ thống chặn: Vui lòng đăng nhập trước khi truy cập tính năng này!");
                    return;
                }
            }

            // Reset classes menu sidebar
            const activeClass = "sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm group bg-blue-50/50 text-brand-blue";
            const normalClass = "sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 font-medium text-sm group";
            
            document.getElementById('menu-home').className = normalClass;
            document.getElementById('menu-deposit').className = normalClass;
            document.getElementById('menu-account').className = normalClass;
            document.getElementById('menu-orders').className = normalClass;
            document.getElementById('menu-history').className = normalClass;
            document.getElementById('menu-policy').className = normalClass;

            // Ẩn toàn bộ các khối nội dung tab
            tabHome.classList.add('hidden');
            tabDeposit.classList.add('hidden');
            tabFallback.classList.add('hidden');

            // Hiển thị tab tương ứng
            if (tabName === 'home') {
                tabHome.classList.remove('hidden');
                document.getElementById('menu-home').className = activeClass;
            } else if (tabName === 'deposit') {
                tabDeposit.classList.remove('hidden');
                document.getElementById('menu-deposit').className = activeClass;
            } else {
                tabFallback.classList.remove('hidden');
                if(document.getElementById(`menu-${tabName}`)) {
                    document.getElementById(`menu-${tabName}`).className = activeClass;
                }
            }
            
            if(window.innerWidth < 1024) {
                document.getElementById('sidebar').classList.add('hidden');
            }
        }

        // Đóng mở preloader
        window.addEventListener('DOMContentLoaded', () => {
            renderAuthUI(); // Chạy giao diện Auth Gate
            setTimeout(() => {
                const preloader = document.getElementById('preloader');
                if(preloader) {
                    preloader.classList.add('opacity-0');
                    setTimeout(() => preloader.remove(), 500);
                }
            }, 800);
        });

        // Mobile Menu Drawer Handler
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('hidden');
            sidebar.classList.toggle('bg-white');
            sidebar.classList.toggle('shadow-2xl');
            sidebar.classList.toggle('fixed');
            sidebar.classList.toggle('top-24');
            sidebar.classList.toggle('left-4');
        });

        // Khởi tạo hóa đơn nạp tiền kết nối GAS
        function createDepositOrder() {
            const uidInput = document.getElementById('input-uid');
            const amountInput = document.getElementById('input-amount');
            const btn = document.getElementById('btn-init-order');

            // This legacy widget was removed from the current store page. If an
            // old cached button still calls it, use the dedicated deposit page.
            if (!uidInput || !amountInput || !btn) {
                window.location.href = '/nap-tien.html';
                return;
            }

            const uid = uidInput.value.trim();
            const amount = amountInput.value.trim();

            if (!uid || !amount || amount < 10000) {
                triggerToast("Vui lòng nhập UID tài khoản và số tiền nạp tối thiểu 10.000đ");
                return;
            }

            isSuccessNotified = false; 
            globalOrderId = null;

            btn.disabled = true;
            btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Đang tạo hóa đơn...";
            
            const apiEndpoint = `${GAS_WEB_APP_URL}?action=createBotOrder&uid=${encodeURIComponent(uid)}&type=TOPUP&amount=${amount}`;

            fetch(apiEndpoint)
            .then(res => res.json())
            .then(data => {
                btn.disabled = false;
                btn.innerHTML = "<i class='fa-solid fa-rotate'></i> Khởi Tạo Hóa Đơn Thanh Toán";

                if (data.ok && data.order) {
                    const order = data.order;
                    globalOrderId = order.orderId; 
                    
                    setLegacyText('record-memo', order.payContent);
                    setLegacyText('record-account', order.bank.acc);
                    setLegacyText('record-owner', order.bank.owner);
                    setLegacyText('record-bank', order.bank.name);
                    
                    const qrUrl = `https://img.vietqr.io/image/${order.bank.bin}-${order.bank.acc}-compact2.png?amount=${order.total}&addInfo=${encodeURIComponent(order.payContent)}&accountName=${encodeURIComponent(order.bank.owner)}`;
                    const qrImgDom = document.getElementById('img-vietqr');
                    qrImgDom.src = qrUrl;
                    qrImgDom.classList.remove('opacity-40', 'blur-[1px]');

                    const floatBar = document.getElementById('order-status-float');
                    floatBar.classList.remove('hidden');

                    document.getElementById('ping-indicator').className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75";
                    document.getElementById('core-indicator').className = "relative inline-flex rounded-full h-2 w-2 bg-emerald-500";
                    const waitingStatus = setLegacyText('txt-status', "Đang chờ thanh toán...");
                    if (waitingStatus) waitingStatus.className = "text-emerald-600 animate-pulse font-medium truncate max-w-[150px] sm:max-w-[180px]";

                    startTimer();
                    startPolling(order.orderId);
                    triggerToast("Khởi tạo hóa đơn thành công! Vui lòng quét mã QR.");
                } else {
                    triggerToast("Lỗi hệ thống: " + data.message);
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.innerHTML = "<i class='fa-solid fa-rotate'></i> Khởi Tạo Hóa Đơn Thanh Toán";
                triggerToast("Không thể kết nối đến máy chủ API");
                console.error(err);
            });
        }

        // KIỂM TRA TRẠNG THÁI VÀ TỰ ĐỘNG ẨN KHỐI ĐẾM NGƯỢC SAU 4 GIÂY THÀNH CÔNG
        function startPolling(orderId) {
            if (pollingInterval) clearInterval(pollingInterval);

            pollingInterval = setInterval(() => {
                if (orderId !== globalOrderId) {
                    clearInterval(pollingInterval);
                    return;
                }

                const checkUrl = `${GAS_WEB_APP_URL}?action=getOrder&orderId=${orderId}`;

                fetch(checkUrl)
                .then(res => res.json())
                .then(data => {
                    if (orderId !== globalOrderId) {
                        clearInterval(pollingInterval);
                        return;
                    }

                    const isPaid = data?.paid === true;
                    const isOrderStatusPaid = data?.order?.status === "PAID" || data?.order?.status === "DELIVERED";

                    if (data?.ok && (isPaid || isOrderStatusPaid)) {
                        clearInterval(pollingInterval);
                        clearInterval(countdownTimer);
                        pollingInterval = null; 
                        
                        document.getElementById('ping-indicator').className = "absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-0";
                        document.getElementById('core-indicator').className = "relative inline-flex rounded-full h-2 w-2 bg-emerald-500";
                        const paidStatus = setLegacyText('txt-status', "Thành công! Đã cộng tiền.");
                        if (paidStatus) paidStatus.className = "text-emerald-600 font-bold truncate max-w-[150px] sm:max-w-[180px]";
                        
                        const pBar = document.getElementById('progress-bar');
                        pBar.className = "bg-emerald-500 h-full transition-all duration-300";
                        
                        if (!isSuccessNotified) {
                            isSuccessNotified = true; 
                            triggerToast("Hệ thống đã nhận được tiền! Nạp quỹ thành công.");
                            
                            // Thực hiện chờ đúng 4 giây để người dùng quan sát, sau đó tự động ẩn đi một cách gọn gàng
                            setTimeout(() => {
                                const floatBar = document.getElementById('order-status-float');
                                floatBar.classList.add('opacity-0', 'translate-y-4');
                                setTimeout(() => {
                                    floatBar.classList.add('hidden');
                                    floatBar.classList.remove('opacity-0', 'translate-y-4');
                                }, 500);
                            }, 4000);
                        }
                    }
                })
                .catch(err => console.log("Lỗi xử lý API: ", err));
            }, 4000); 
        }

        // Logic đồng bộ Thanh tiến trình đếm ngược thời gian
        function startTimer() {
            duration = 600; 
            if (countdownTimer) clearInterval(countdownTimer);
            
            const label = document.getElementById('countdown-timer');
            const pBar = document.getElementById('progress-bar');

            if (!label || !pBar) return;
            
            label.className = "text-emerald-600 font-mono text-xs border-l border-slate-200 pl-3 flex-shrink-0";
            pBar.className = "bg-gradient-to-r from-brand-blue to-brand-purple h-full w-full transition-all duration-1000 ease-linear";
            pBar.style.width = "100%";

            countdownTimer = setInterval(() => {
                let min = Math.floor(duration / 60);
                let sec = duration % 60;
                label.innerText = `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
                
                let percent = (duration / 600) * 100;
                pBar.style.width = percent + "%";
                
                if (--duration < 0) {
                    clearInterval(countdownTimer);
                    clearInterval(pollingInterval);
                    label.innerText = "Hết hạn";
                    label.className = "text-red-500 font-mono text-xs border-l border-slate-200 pl-3 flex-shrink-0";
                    const expiredStatus = setLegacyText('txt-status', "Hóa đơn đã quá hạn.");
                    if (expiredStatus) expiredStatus.className = "text-red-500 font-medium truncate max-w-[150px] sm:max-w-[180px]";
                    
                    pBar.className = "bg-red-500 h-full transition-all duration-300";
                    pBar.style.width = "0%";
                }
            }, 1000);
        }

        // Sao chép dữ liệu nhanh vào bộ nhớ tạm
        function copyData(elementId, labelName) {
            const text = document.getElementById(elementId).innerText.trim();
            if(text === "------" || text === "---") return;
            navigator.clipboard.writeText(text).then(() => {
                triggerToast(`Đã sao chép ${labelName} thành công!`);
            });
        }

        // Công cụ hiển thị thông báo Toast nhanh
        function triggerToast(message) {
            if (window.showToast) window.showToast(message);
        }

        // Kiểm soát Giỏ hàng Drawer
        const cartPopup = document.getElementById('cart-popup');
        function toggleCartPopup() {
            const innerModal = cartPopup.querySelector('div');
            if (cartPopup.classList.contains('opacity-0')) {
                cartPopup.classList.remove('opacity-0', 'pointer-events-none');
                innerModal.classList.remove('translate-x-full');
            } else {
                cartPopup.classList.add('opacity-0', 'pointer-events-none');
                innerModal.classList.add('translate-x-full');
            }
        }
        
        cartPopup.addEventListener('click', (e) => {
            if(e.target === cartPopup) toggleCartPopup();
        });

        // Nút cuộn lên đầu mượt mà
        const backToTopBtn = document.getElementById('back-to-top');
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.remove('opacity-0', 'translate-y-10', 'pointer-events-none');
            } else {
                backToTopBtn.classList.add('opacity-0', 'translate-y-10', 'pointer-events-none');
            }
        });
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });


/* =========================================================
   TÍCH HỢP AUTH THẬT VỚI server.js + Supabase
   Ghi đè phần login giả lập cũ.
========================================================= */

const AUTH_API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
let currentAuthUser = JSON.parse(localStorage.getItem('user') || 'null');
isLoggedIn = Boolean(localStorage.getItem('token'));

function authToast(message, isError = false) {
  if (typeof triggerToast === 'function') {
    triggerToast(message);
    return;
  }
  alert(message);
}

function formatMoneyAuth(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function authSaveSession(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  localStorage.setItem('isLoggedIn', 'true');
  currentAuthUser = data.user;
  isLoggedIn = true;
}

function authClearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('isLoggedIn');
  currentAuthUser = null;
  isLoggedIn = false;
}

async function authPost(path, body) {
  const res = await fetch(`${AUTH_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || data.error || 'Có lỗi xảy ra');
  }
  return data;
}

async function refreshAuthUser() {
  const token = localStorage.getItem('token');
  if (!token) {
    authClearSession();
    return null;
  }

  try {
    const res = await fetch(`${AUTH_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      authClearSession();
      return null;
    }

    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('isLoggedIn', 'true');
    currentAuthUser = data.user;
    isLoggedIn = true;
    return data.user;
  } catch {
    return currentAuthUser;
  }
}

// Ghi đè renderAuthUI cũ
function renderAuthUI() {
  const authZone = document.getElementById('header-auth-zone');
  if (!authZone) return;

  const user = currentAuthUser;

  if (!isLoggedIn || !user) {
    authZone.innerHTML = `
      <button onclick="openAuthModal()" class="bg-gradient-to-r from-brand-blue to-brand-purple text-white font-bold text-xs px-5 py-2.5 rounded-full shadow-md shadow-blue-100 hover:opacity-90 transition transform hover:scale-105">
        <i class="fa-solid fa-right-to-bracket mr-1.5"></i> Đăng nhập
      </button>
    `;
    return;
  }

  authZone.innerHTML = `
    <a href="nap-tien.html" class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-full px-4 py-1.5 items-center gap-2 flex cursor-pointer hover:opacity-80 transition">
      <i class="fa-solid fa-wallet text-brand-blue"></i>
      <div class="text-right">
        <p class="text-[10px] text-slate-400 uppercase font-semibold leading-tight">Số dư</p>
        <p class="text-xs font-bold text-brand-blue leading-tight">${formatMoneyAuth(user.balance)}</p>
      </div>
    </a>
    <a href="profile.html" class="flex items-center gap-3 pl-1" title="${user.fullName || user.username}">
      <div class="w-10 h-10 rounded-full border-2 border-brand-blue/30 bg-blue-50 text-brand-blue flex items-center justify-center font-black text-sm hover:scale-105 transition duration-300">
        ${(user.username || 'U').charAt(0).toUpperCase()}
      </div>
    </a>
    <button onclick="handleLogout()" class="text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-full transition">
      <i class="fa-solid fa-right-from-bracket"></i>
    </button>
  `;
}

// Ghi đè action bảo vệ cũ
function handleSecuredAction(successCallback) {
  if (!isLoggedIn) {
    authToast('Vui lòng đăng nhập hệ thống để thực hiện hành động này!');
    openAuthModal();
    return;
  }
  successCallback();
}

async function simulateLoginSuccess() {
  const usernameOrEmail = document.getElementById('login-username')?.value.trim();
  const password = document.getElementById('login-password')?.value;

  if (!usernameOrEmail || !password) {
    authToast('Vui lòng nhập tài khoản và mật khẩu');
    return;
  }

  try {
    const data = await authPost('/login', { usernameOrEmail, password });
    authSaveSession(data);
    renderAuthUI();
    closeAuthModal();
    authToast(`Đăng nhập thành công! Chào ${data.user.fullName || data.user.username}`);
  } catch (err) {
    authToast(err.message, true);
  }
}

async function simulateRegisterFromModal() {
  const username = document.getElementById('modal-register-username')?.value.trim();
  const email = document.getElementById('modal-register-email')?.value.trim();
  const password = document.getElementById('modal-register-password')?.value;

  if (!username || !email || !password) {
    authToast('Vui lòng nhập đầy đủ thông tin đăng ký');
    return;
  }

  try {
    await authPost('/register', {
      username,
      email,
      password,
      fullName: username
    });
    authToast('Đăng ký thành công! Hãy đăng nhập.');
    switchAuthTab('login');
    const loginInput = document.getElementById('login-username');
    if (loginInput) loginInput.value = username;
  } catch (err) {
    authToast(err.message, true);
  }
}

function handleLogout() {
  authClearSession();
  renderAuthUI();
  authToast('Đã đăng xuất tài khoản');
}

document.addEventListener('DOMContentLoaded', async () => {
  await refreshAuthUser();
  renderAuthUI();
});
