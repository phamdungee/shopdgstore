// assets/js/login.js
// Kết nối login.html với backend server.js

const API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
const HOME_PAGE_URL = 'index.html';

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

function showMessage(message, isError = true) {
  const oldToast = document.getElementById('auth-toast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.id = 'auth-toast';
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 99999;
    max-width: 360px;
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 13.5px;
    font-weight: 700;
    font-family: 'Outfit', sans-serif;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px ${isError ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'};
    background: rgba(17, 24, 39, 0.85);
    backdrop-filter: blur(12px);
    color: ${isError ? '#ef4444' : '#10b981'};
    border: 1px solid ${isError ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'};
    border-left: 4px solid ${isError ? '#ef4444' : '#10b981'};
    transition: all 0.3s ease;
  `;
  
  // Add icon
  const iconHtml = isError 
    ? '<span class="sk-icon sm" style="margin-right:8px; color:#ef4444;"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/></svg></span>'
    : '<span class="sk-icon sm" style="margin-right:8px; color:#10b981;"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/></svg></span>';
    
  toast.innerHTML = `<div style="display:flex; align-items:center;">${iconHtml}<span>${message}</span></div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function setButtonLoading(button, loadingText) {
  if (!button) return () => {};
  const oldHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`;
  return () => {
    button.disabled = false;
    button.innerHTML = oldHtml;
  };
}

function saveAuthSession(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  localStorage.setItem('isLoggedIn', 'true');
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
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

window.addEventListener('load', () => {
  const loader = document.getElementById('loader');
  if (loader) setTimeout(() => loader.classList.add('fade-out'), 600);
});

const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');
const mobileToRegister = document.getElementById('mobile-to-register');
const mobileToLogin = document.getElementById('mobile-to-login');

if (registerBtn && container) registerBtn.addEventListener('click', () => container.classList.add('active'));
if (loginBtn && container) loginBtn.addEventListener('click', () => container.classList.remove('active'));
if (mobileToRegister && container) {
  mobileToRegister.addEventListener('click', event => {
    event.preventDefault();
    container.classList.add('active');
  });
}
if (mobileToLogin && container) {
  mobileToLogin.addEventListener('click', event => {
    event.preventDefault();
    container.classList.remove('active');
  });
}

const formSignUp = document.getElementById('form-signup');
if (formSignUp) {
  formSignUp.addEventListener('submit', async event => {
    event.preventDefault();

    const fullName = document.getElementById('signup-name')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const password = document.getElementById('signup-password')?.value;
    const confirmPassword = document.getElementById('signup-confirm-password')?.value;

    if (!fullName || !email || !password || !confirmPassword) {
      showMessage('Vui lòng nhập đầy đủ thông tin đăng ký');
      return;
    }

    if (password !== confirmPassword) {
      showMessage('Mật khẩu xác nhận không khớp');
      return;
    }

    // Tự động tách phần đầu email để làm username (loại bỏ ký tự không hợp lệ)
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '');
    if (username.length < 3) {
      showMessage('Tên tài khoản trích xuất từ email quá ngắn (phải ít nhất 3 ký tự)');
      return;
    }

    const restoreButton = setButtonLoading(formSignUp.querySelector('button[type="submit"]'), 'Đang tạo tài khoản...');

    try {
      await apiPost('/register', { username, fullName, email, password });
      showMessage('Đăng ký thành công! Hãy đăng nhập.', false);
      formSignUp.reset();
      if (container) container.classList.remove('active');
    } catch (err) {
      showMessage(err.message);
    } finally {
      restoreButton();
    }
  });
}

const formSignIn = document.getElementById('form-signin');
if (formSignIn) {
  formSignIn.addEventListener('submit', async event => {
    event.preventDefault();

    const usernameOrEmail = document.getElementById('signin-uid')?.value.trim();
    const password = document.getElementById('signin-password')?.value;

    if (!usernameOrEmail || !password) {
      showMessage('Vui lòng nhập tài khoản và mật khẩu');
      return;
    }

    const restoreButton = setButtonLoading(formSignIn.querySelector('button[type="submit"]'), 'Đang xác thực...');

    try {
      const data = await apiPost('/login', { usernameOrEmail, password });
      saveAuthSession(data);
      showMessage(`Đăng nhập thành công! Chào ${data.user.fullName || data.user.username}`, false);
      const nextPage = data.user?.role === 'admin' ? 'admin.html' : HOME_PAGE_URL;
      setTimeout(() => {
        window.location.href = nextPage;
      }, 600);
    } catch (err) {
      showMessage(err.message);
    } finally {
      restoreButton();
    }
  });
}

// Password strength bar listener
document.addEventListener('DOMContentLoaded', () => {
  const signupPass = document.getElementById('signup-password');
  if (signupPass) {
    signupPass.addEventListener('input', () => {
      const val = signupPass.value;
      const bar = document.getElementById('password-strength-bar');
      const text = document.getElementById('password-strength-text');
      if (!bar || !text) return;
      
      let score = 0;
      if (val.length >= 6) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;
      
      if (val.length === 0) {
        bar.style.width = '0%';
        text.innerText = '';
      } else if (score <= 1) {
        bar.style.width = '25%';
        bar.style.background = 'var(--danger)';
        text.innerText = 'Mật khẩu yếu';
        text.style.color = 'var(--danger)';
      } else if (score === 2) {
        bar.style.width = '50%';
        bar.style.background = 'var(--warning)';
        text.innerText = 'Mật khẩu trung bình';
        text.style.color = 'var(--warning)';
      } else if (score === 3) {
        bar.style.width = '75%';
        bar.style.background = 'var(--brand-light)';
        text.innerText = 'Mật khẩu mạnh';
        text.style.color = 'var(--brand-light)';
      } else {
        bar.style.width = '100%';
        bar.style.background = 'var(--success)';
        text.innerText = 'Mật khẩu rất mạnh';
        text.style.color = 'var(--success)';
      }
    });
  }
});

