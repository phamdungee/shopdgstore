// assets/js/login.js
// Kết nối login.html với backend server.js

const API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:4000/api' : '/api');
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
  toast.className = isError ? 'error' : 'success';
  
  const iconClass = isError ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-check';
  
  toast.innerHTML = `
    <div class="toast-icon">
      <i class="${iconClass}"></i>
    </div>
    <div class="toast-message" style="flex: 1;">
      ${message}
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Trigger slide-in animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Slide-out and remove after 3.5s
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3500);
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

let signupTurnstileWidgetId = null;
let signinTurnstileWidgetId = null;

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

    const turnstileToken = signupTurnstileWidgetId !== null ? turnstile.getResponse(signupTurnstileWidgetId) : '';
    if (signupTurnstileWidgetId !== null && !turnstileToken) {
      showMessage('Vui lòng hoàn thành xác thực chống bot (Turnstile).');
      return;
    }

    const restoreButton = setButtonLoading(formSignUp.querySelector('button[type="submit"]'), 'Đang tạo tài khoản...');

    try {
      await apiPost('/register', { username, fullName, email, password, 'cf-turnstile-response': turnstileToken });
      showMessage('Đăng ký thành công! Hãy đăng nhập.', false);
      formSignUp.reset();
      if (signupTurnstileWidgetId !== null) turnstile.reset(signupTurnstileWidgetId);
      if (signinTurnstileWidgetId !== null) turnstile.reset(signinTurnstileWidgetId);
      if (container) container.classList.remove('active');
    } catch (err) {
      showMessage(err.message);
      if (signupTurnstileWidgetId !== null) turnstile.reset(signupTurnstileWidgetId);
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

    const turnstileToken = signinTurnstileWidgetId !== null ? turnstile.getResponse(signinTurnstileWidgetId) : '';
    if (signinTurnstileWidgetId !== null && !turnstileToken) {
      showMessage('Vui lòng hoàn thành xác thực chống bot (Turnstile).');
      return;
    }

    const restoreButton = setButtonLoading(formSignIn.querySelector('button[type="submit"]'), 'Đang xác thực...');

    try {
      const data = await apiPost('/login', { usernameOrEmail, password, 'cf-turnstile-response': turnstileToken });
      saveAuthSession(data);
      showMessage(`Đăng nhập thành công! Chào ${data.user.fullName || data.user.username}`, false);
      const nextPage = data.user?.role === 'admin' ? 'admin.html' : HOME_PAGE_URL;
      setTimeout(() => {
        window.location.href = nextPage;
      }, 600);
    } catch (err) {
      showMessage(err.message);
      if (signinTurnstileWidgetId !== null) turnstile.reset(signinTurnstileWidgetId);
    } finally {
      restoreButton();
    }
  });
}

// Password strength bar listener
document.addEventListener('DOMContentLoaded', () => {
  // Bind eye icons programmatically to avoid inline onclick ReferenceErrors
  document.querySelectorAll('.sk-password-field button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const input = btn.previousElementSibling;
      if (input && (input.tagName === 'INPUT' || input.tagName === 'input')) {
        const showPassword = input.type === 'password';
        input.type = showPassword ? 'text' : 'password';
        btn.setAttribute('aria-label', showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
        btn.innerHTML = showPassword
          ? '<i class="fa-solid fa-eye-slash"></i>'
          : '<i class="fa-solid fa-eye"></i>';
      }
    });
  });

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

  // Real-time password match validator
  const signupConfirmPass = document.getElementById('signup-confirm-password');
  const matchText = document.getElementById('password-match-text');

  if (signupPass && signupConfirmPass && matchText) {
    const checkMatch = () => {
      const p1 = signupPass.value;
      const p2 = signupConfirmPass.value;
      
      if (p2.length === 0) {
        matchText.innerText = '';
        signupConfirmPass.style.border = '';
      } else if (p1 === p2) {
        matchText.innerText = '✓ Mật khẩu trùng khớp';
        matchText.style.color = 'var(--success)';
        signupConfirmPass.style.border = '1px solid var(--success)';
      } else {
        matchText.innerText = '✗ Mật khẩu xác nhận chưa khớp';
        matchText.style.color = 'var(--danger)';
        signupConfirmPass.style.border = '1px solid var(--danger)';
      }
    };

    signupPass.addEventListener('input', checkMatch);
    signupConfirmPass.addEventListener('input', checkMatch);
  }
});


let tokenClient;
let githubClientId = '';

window.handleGoogleCustomLogin = function() {
  if (tokenClient) {
    tokenClient.requestAccessToken();
  } else {
    showMessage('Chưa tải xong cấu hình Google, vui lòng thử lại sau.');
  }
};

window.handleGithubCustomLogin = function() {
  if (githubClientId) {
    const redirectUri = encodeURIComponent(`${window.location.origin}/login.html`);
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${redirectUri}&scope=user:email`;
  } else {
    showMessage('Chưa cấu hình GitHub Client ID trên server.');
  }
};

async function handleGithubOAuthLogin(code) {
  try {
    const redirectUri = `${window.location.origin}/login.html`;
    const res = await fetch(`${API_BASE}/auth/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri })
    });

    const data = await readOAuthResponse(res, 'GitHub');
    if (!res.ok || data.ok === false) {
      console.error('GitHub login error response:', data);
      showMessage(formatOAuthError(data, 'Lỗi đăng nhập GitHub'));
      return;
    }

    saveLoginSession(data);
  } catch (err) {
    console.error('GitHub OAuth request failed:', err);
    showMessage(err.message || 'Không thể kết nối máy chủ để xác thực GitHub');
  }
}

async function readOAuthResponse(response, provider) {
  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();

  if (!contentType.includes('application/json')) {
    console.error(`${provider} OAuth returned a non-JSON response`, {
      status: response.status,
      contentType,
      body: rawBody.slice(0, 500)
    });
    throw new Error(
      `Máy chủ ${provider} trả về phản hồi không hợp lệ (HTTP ${response.status}). Vui lòng thử lại.`
    );
  }

  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    console.error(`${provider} OAuth returned invalid JSON`, error);
    throw new Error(`Không đọc được phản hồi xác thực ${provider} từ máy chủ.`);
  }
}

function formatOAuthError(data, fallback) {
  const message = data && (data.message || data.error) ? (data.message || data.error) : fallback;
  return data && data.requestId ? `${message} (Mã lỗi: ${data.requestId})` : message;
}

function saveLoginSession(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  localStorage.setItem('isLoggedIn', 'true');
  
  showMessage('Đăng nhập thành công, đang chuyển hướng...', false);
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1000);
}

// Initialize OAuth configs
async function initOAuth() {
  console.log('initOAuth: Fetching configurations...');
  try {
    const res = await fetch(`${API_BASE}/auth/config`);
    const data = await res.json();
    console.log('initOAuth: Server config loaded:', data);
    
    if (data.ok) {
      githubClientId = data.githubClientId;

      // Render Cloudflare Turnstile with async ready check (polling)
      if (data.cloudflareTurnstileSiteKey) {
        const renderWhenReady = () => {
          if (window.turnstile) {
            if (document.getElementById('signup-turnstile')) {
              signupTurnstileWidgetId = turnstile.render('#signup-turnstile', {
                sitekey: data.cloudflareTurnstileSiteKey,
                theme: 'dark'
              });
            }
            if (document.getElementById('signin-turnstile')) {
              signinTurnstileWidgetId = turnstile.render('#signin-turnstile', {
                sitekey: data.cloudflareTurnstileSiteKey,
                theme: 'dark'
              });
            }
          } else {
            setTimeout(renderWhenReady, 100);
          }
        };
        renderWhenReady();
      }

      // Initialize Google Client
      if (data.googleClientId) {
        console.log('initOAuth: Google Client ID present. Waiting for google library...');
        const checkGoogle = setInterval(() => {
          if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            console.log('initOAuth: Google GSI library loaded. Initializing tokenClient...');
            clearInterval(checkGoogle);
            tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: data.googleClientId,
              scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
              callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                  const accessToken = tokenResponse.access_token;
                  try {
                    const res2 = await fetch(`${API_BASE}/auth/google`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ accessToken })
                    });
                    
                    const data2 = await readOAuthResponse(res2, 'Google');
                    if (!res2.ok || data2.ok === false) {
                      console.error('Google login error response:', data2);
                      showMessage(formatOAuthError(data2, 'Lỗi đăng nhập Google'));
                      return;
                    }

                    saveLoginSession(data2);
                  } catch (err) {
                    console.error('Google OAuth request failed:', err);
                    showMessage(err.message || 'Không thể kết nối máy chủ để xác thực Google');
                  }
                }
              }
            });
          }
        }, 100);
      } else {
        console.warn('initOAuth: No googleClientId returned from server.');
      }
    }
  } catch (e) {
    console.error('Failed to load OAuth configurations', e);
  }

  // Bind custom OAuth buttons
  document.querySelectorAll('.btn-google-login-custom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleGoogleCustomLogin();
    });
  });

  document.querySelectorAll('.btn-github-login-custom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleGithubCustomLogin();
    });
  });
}

// Detect GitHub callback
const urlParams = new URLSearchParams(window.location.search);
const githubCode = urlParams.get('code');
if (githubCode) {
  window.history.replaceState({}, document.title, window.location.pathname);
  handleGithubOAuthLogin(githubCode);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOAuth);
} else {
  initOAuth();
}
