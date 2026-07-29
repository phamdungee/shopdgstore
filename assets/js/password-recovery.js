(function () {
  'use strict';

  const shell = document.querySelector('.recovery-shell');
  const steps = [...document.querySelectorAll('[data-step]')];
  const progressItems = [...document.querySelectorAll('[data-progress-step]')];
  const sendForm = document.getElementById('send-otp-form');
  const verifyForm = document.getElementById('verify-otp-form');
  const resetForm = document.getElementById('reset-password-form');
  const emailInput = document.getElementById('recovery-email');
  const emailError = document.getElementById('email-error');
  const otpError = document.getElementById('otp-error');
  const passwordError = document.getElementById('password-error');
  const otpInputs = [...document.querySelectorAll('#otp-inputs input')];
  const maskedEmail = document.getElementById('masked-email');
  const countdownNode = document.getElementById('otp-countdown');
  const resendButton = document.getElementById('resend-otp-button');
  const changeEmailButton = document.getElementById('change-email-button');
  const passwordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const strengthBar = document.getElementById('password-strength-bar');
  const toastContainer = document.getElementById('recovery-toasts');

  const state = {
    email: '',
    resetToken: '',
    otpExpiresAt: 0,
    resendAvailableAt: 0,
    timer: null,
    otpTtlSeconds: Number(shell?.dataset.otpTtl || 300),
    resendDelaySeconds: Number(shell?.dataset.resendDelay || 60)
  };

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
  }

  function passwordRules(value) {
    return {
      length: value.length >= 10 && value.length <= 128,
      uppercase: /[A-Z]/.test(value),
      lowercase: /[a-z]/.test(value),
      number: /\d/.test(value),
      symbol: /[^A-Za-z0-9\s]/.test(value),
      noWhitespace: !/\s/.test(value)
    };
  }

  function maskEmail(email) {
    const [name, domain] = String(email).split('@');
    if (!name || !domain) return 'email của bạn';
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${'*'.repeat(Math.max(2, name.length - visible.length))}@${domain}`;
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `recovery-toast${type === 'error' ? ' is-error' : ''}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
      <i class="fa-solid ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
      <p></p>
      <button type="button" aria-label="Đóng thông báo"><i class="fa-solid fa-xmark"></i></button>`;
    toast.querySelector('p').textContent = message;
    const closeButton = toast.querySelector('button');
    const removeToast = () => toast.remove();
    closeButton.addEventListener('click', removeToast);
    toastContainer.appendChild(toast);
    window.setTimeout(removeToast, 4500);
  }

  function setLoading(button, loading) {
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
    button.setAttribute('aria-busy', String(loading));
  }

  async function postJson(url, body, token = '') {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false || payload.ok === false) {
      const error = new Error(payload.message || 'Không thể xử lý yêu cầu lúc này.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function showStep(stepNumber) {
    steps.forEach((step) => {
      const active = Number(step.dataset.step) === stepNumber;
      step.hidden = !active;
      step.classList.toggle('is-active', active);
    });
    progressItems.forEach((item) => {
      const current = Number(item.dataset.progressStep);
      item.classList.toggle('is-active', current === stepNumber);
      item.classList.toggle('is-complete', current < stepNumber || stepNumber === 4);
    });
  }

  function formatCountdown(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function updateTimers() {
    const now = Date.now();
    const otpRemaining = Math.ceil((state.otpExpiresAt - now) / 1000);
    const resendRemaining = Math.ceil((state.resendAvailableAt - now) / 1000);
    countdownNode.textContent = formatCountdown(otpRemaining);
    countdownNode.classList.toggle('is-expired', otpRemaining <= 0);
    resendButton.disabled = resendRemaining > 0;
    resendButton.textContent = resendRemaining > 0 ? `Gửi lại sau ${resendRemaining}s` : 'Gửi lại OTP';
    if (otpRemaining <= 0 && resendRemaining <= 0 && state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function startTimers(otpTtl = state.otpTtlSeconds, resendDelay = state.resendDelaySeconds) {
    state.otpExpiresAt = Date.now() + otpTtl * 1000;
    state.resendAvailableAt = Date.now() + resendDelay * 1000;
    if (state.timer) window.clearInterval(state.timer);
    updateTimers();
    state.timer = window.setInterval(updateTimers, 1000);
  }

  function clearOtp() {
    otpInputs.forEach((input) => { input.value = ''; });
  }

  function getOtp() {
    return otpInputs.map((input) => input.value).join('');
  }

  function validateEmailField() {
    const email = emailInput.value.trim().toLowerCase();
    const valid = isValidEmail(email);
    const wrapper = emailInput.closest('.recovery-input');
    wrapper.classList.toggle('is-valid', valid);
    wrapper.classList.toggle('is-invalid', email.length > 0 && !valid);
    emailError.textContent = email.length > 0 && !valid ? 'Email chưa đúng định dạng.' : '';
    emailInput.setAttribute('aria-invalid', String(email.length > 0 && !valid));
    return valid;
  }

  function updatePasswordStrength() {
    const rules = passwordRules(passwordInput.value);
    const ruleKeys = ['length', 'uppercase', 'lowercase', 'number', 'symbol'];
    const score = ruleKeys.filter((key) => rules[key]).length;
    document.querySelectorAll('#password-rules [data-rule]').forEach((item) => {
      item.classList.toggle('is-valid', Boolean(rules[item.dataset.rule]));
      const icon = item.querySelector('i');
      icon.className = `fa-solid ${rules[item.dataset.rule] ? 'fa-circle-check' : 'fa-circle'}`;
    });
    strengthBar.style.width = `${score * 20}%`;
    strengthBar.style.background = score < 3 ? 'var(--recovery-danger)' : score < 5 ? '#d97706' : 'var(--recovery-success)';
    return Object.values(rules).every(Boolean);
  }

  emailInput.addEventListener('input', validateEmailField);

  sendForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateEmailField()) {
      emailInput.focus();
      return;
    }
    const button = sendForm.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      state.email = emailInput.value.trim().toLowerCase();
      const payload = await postJson('/api/auth/send-reset-otp', { email: state.email });
      maskedEmail.textContent = maskEmail(state.email);
      clearOtp();
      startTimers(payload.otp_expires_in || state.otpTtlSeconds, payload.resend_after || state.resendDelaySeconds);
      showStep(2);
      otpInputs[0].focus();
      showToast(payload.message || 'Nếu email hợp lệ, mã OTP đã được gửi.');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(button, false);
    }
  });

  otpInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(-1);
      otpError.textContent = '';
      if (input.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && index > 0) otpInputs[index - 1].focus();
      if (event.key === 'ArrowLeft' && index > 0) otpInputs[index - 1].focus();
      if (event.key === 'ArrowRight' && index < otpInputs.length - 1) otpInputs[index + 1].focus();
    });
    input.addEventListener('paste', (event) => {
      const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (!digits) return;
      event.preventDefault();
      digits.split('').forEach((digit, position) => {
        if (otpInputs[position]) otpInputs[position].value = digit;
      });
      otpInputs[Math.min(digits.length, 6) - 1].focus();
    });
  });

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const otp = getOtp();
    if (!/^\d{6}$/.test(otp)) {
      otpError.textContent = 'Vui lòng nhập đủ 6 chữ số.';
      return;
    }
    const button = verifyForm.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const payload = await postJson('/api/auth/verify-reset-otp', { email: state.email, otp });
      state.resetToken = payload.reset_token;
      if (state.timer) window.clearInterval(state.timer);
      state.timer = null;
      showStep(3);
      passwordInput.focus();
      showToast('OTP hợp lệ. Hãy tạo mật khẩu mới.');
    } catch (error) {
      clearOtp();
      otpInputs[0].focus();
      otpError.textContent = error.message;
      showToast(error.message, 'error');
    } finally {
      setLoading(button, false);
    }
  });

  resendButton.addEventListener('click', async () => {
    if (resendButton.disabled || !state.email) return;
    resendButton.disabled = true;
    resendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi';
    try {
      const payload = await postJson('/api/auth/send-reset-otp', { email: state.email });
      clearOtp();
      startTimers(payload.otp_expires_in || state.otpTtlSeconds, payload.resend_after || state.resendDelaySeconds);
      showToast(payload.message || 'Mã OTP mới đã được gửi.');
    } catch (error) {
      showToast(error.message, 'error');
      updateTimers();
    }
  });

  changeEmailButton.addEventListener('click', () => {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    state.email = '';
    state.resetToken = '';
    clearOtp();
    showStep(1);
    emailInput.focus();
  });

  passwordInput.addEventListener('input', () => {
    updatePasswordStrength();
    passwordError.textContent = '';
  });
  confirmPasswordInput.addEventListener('input', () => {
    passwordError.textContent = confirmPasswordInput.value && confirmPasswordInput.value !== passwordInput.value
      ? 'Mật khẩu nhập lại chưa khớp.'
      : '';
  });

  document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const input = button.closest('.recovery-input').querySelector('input');
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.setAttribute('aria-label', visible ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
      button.querySelector('i').className = `fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`;
    });
  });

  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const strong = updatePasswordStrength();
    if (!strong) {
      passwordError.textContent = 'Mật khẩu chưa đáp ứng đầy đủ yêu cầu bảo mật.';
      passwordInput.focus();
      return;
    }
    if (passwordInput.value !== confirmPasswordInput.value) {
      passwordError.textContent = 'Mật khẩu nhập lại chưa khớp.';
      confirmPasswordInput.focus();
      return;
    }
    if (!state.resetToken) {
      showToast('Phiên khôi phục không hợp lệ. Vui lòng gửi OTP mới.', 'error');
      showStep(1);
      return;
    }
    const button = resetForm.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const payload = await postJson('/api/auth/reset-password', {
        password: passwordInput.value,
        confirmPassword: confirmPasswordInput.value
      }, state.resetToken);
      state.resetToken = '';
      resetForm.reset();
      showStep(4);
      showToast(payload.message || 'Khôi phục mật khẩu thành công.');
    } catch (error) {
      passwordError.textContent = error.message;
      showToast(error.message, 'error');
      if (error.status === 401) {
        state.resetToken = '';
        window.setTimeout(() => showStep(1), 1200);
      }
    } finally {
      setLoading(button, false);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.timer) window.clearInterval(state.timer);
  });
}());
