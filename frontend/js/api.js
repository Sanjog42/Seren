export const BASE_URL = window.__API_BASE_URL__ || 'http://serennp.com';

const ACCESS_KEY = 'seren_access';
const REFRESH_KEY = 'seren_refresh';
const ROLE_KEY = 'seren_role';
const NAME_KEY = 'seren_name';
const VERIFIED_KEY = 'seren_verified';

const decodePayload = (token) => {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
};

export const getAccessToken = () => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
export const getRole = () => localStorage.getItem(ROLE_KEY) || decodePayload(getAccessToken() || '').role || null;
export const getUserName = () => localStorage.getItem(NAME_KEY) || decodePayload(getAccessToken() || '').name || '';
export const isVerified = () => (localStorage.getItem(VERIFIED_KEY) || 'false') === 'true';
export const isLoggedIn = () => Boolean(getAccessToken());

export const clearTokens = () => {
  [ACCESS_KEY, REFRESH_KEY, ROLE_KEY, NAME_KEY, VERIFIED_KEY].forEach((k) => localStorage.removeItem(k));
};

export const saveTokens = (access, refresh, role, name, verified = false) => {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(ROLE_KEY, role || decodePayload(access).role || 'customer');
  localStorage.setItem(NAME_KEY, name || decodePayload(access).name || '');
  localStorage.setItem(VERIFIED_KEY, String(verified || decodePayload(access).is_verified || false));
};

const goLogin = () => {
  const base = location.pathname.includes('/dashboard/') ? '../login.html' : './login.html';
  location.href = `${base}?next=${encodeURIComponent(location.pathname + location.search)}`;
};

export async function apiRequest(endpoint, method = 'GET', body = null, requiresAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (requiresAuth) {
    const token = getAccessToken();
    if (!token) {
      clearTokens();
      goLogin();
      throw new Error('Unauthorized');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (res.status === 401) {
    clearTokens();
    goLogin();
    throw new Error('Unauthorized');
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.detail || 'Request failed');
    err.payload = payload;
    throw err;
  }
  return payload;
}

export async function apiUpload(endpoint, formData, method = 'POST') {
  const token = getAccessToken();
  if (!token) {
    clearTokens();
    goLogin();
    throw new Error('Unauthorized');
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.detail || 'Upload failed');
    err.payload = payload;
    throw err;
  }
  return payload;
}
