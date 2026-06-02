import { apiRequest, clearTokens, getRole, isLoggedIn, saveTokens } from './api.js';

const q = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const goByRole = (role) => {
  if (role === 'admin') location.href = './dashboard/admin.html';
  else if (role === 'staff') location.href = './dashboard/staff.html';
  else location.href = params.get('next') || './index.html';
};

export const logout = () => {
  clearTokens();
  location.href = '/index.html';
};

export const guard = (roles = []) => {
  if (!isLoggedIn()) {
    location.href = `../login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return false;
  }
  if (roles.length && !roles.includes(getRole())) {
    location.href = '../login.html';
    return false;
  }
  return true;
};

const bindLogin = () => {
  const form = q('loginForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    q('loginError').textContent = '';
    const email = q('email').value.trim().toLowerCase();
    const password = q('password').value;
    try {
      const data = await apiRequest('/api/auth/login/', 'POST', { email, password });
      saveTokens(data.access, data.refresh, data.role, data.name, data.is_verified);
      goByRole(data.role);
    } catch (err) {
      q('loginError').textContent = err?.payload?.detail || 'Login failed.';
    }
  });
};

const bindRegister = () => {
  const form = q('registerForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    q('registerError').textContent = '';
    const name    = q('name').value.trim();
    const email   = q('email').value.trim().toLowerCase();
    const password = q('password').value;
    const confirm  = q('confirmPassword').value;
    if (password !== confirm) {
      q('registerError').textContent = 'Passwords do not match.';
      return;
    }
    try {
      await apiRequest('/api/auth/register/', 'POST', { name, email, password });
      sessionStorage.setItem('verify_email', email);
      location.href = './verify-email.html';
    } catch (err) {
      q('registerError').textContent = err?.payload?.detail || JSON.stringify(err?.payload || {}) || 'Registration failed.';
    }
  });
};

const bindVerify = () => {
  const form = q('verifyForm');
  if (!form) return;
  const email = sessionStorage.getItem('verify_email') || '';
  q('verifyEmailTarget').textContent = email;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    q('verifyError').textContent = '';
    const code = q('code').value.trim();
    try {
      const data = await apiRequest('/api/auth/verify-email/', 'POST', { email, code });
      saveTokens(data.access, data.refresh, data.role, data.name, true);
      location.href = './index.html';
    } catch (err) {
      q('verifyError').textContent = err?.payload?.detail || 'Verification failed.';
    }
  });

  const resend = q('resendOtp');
  if (resend) {
    let sec = 0;
    const tick = () => {
      if (sec <= 0) {
        resend.disabled = false;
        resend.textContent = 'Resend code';
        return;
      }
      resend.disabled = true;
      resend.textContent = `Resend in ${sec}s`;
      sec -= 1;
      setTimeout(tick, 1000);
    };

    resend.addEventListener('click', async () => {
      try {
        await apiRequest('/api/auth/resend-otp/', 'POST', { email });
        sec = 60;
        tick();
      } catch (err) {
        q('verifyError').textContent = err?.payload?.detail || 'Could not resend.';
      }
    });
  }
};

bindLogin();
bindRegister();
bindVerify();
