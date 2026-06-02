/**
 * ui.js — Shared toast + confirm dialog helpers
 * Self-injects its own CSS so it works in any page that imports it.
 */

// ── Inject styles once ────────────────────────────────────────────────────────
if (!document.getElementById('seren-ui-styles')) {
  const s = document.createElement('style');
  s.id = 'seren-ui-styles';
  s.textContent = `
/* ── Toast container ───────────────────────────────────────────────────── */
#seren-toast-root {
  position: fixed;
  top: 1.3rem;
  right: 1.3rem;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  pointer-events: none;
}

/* ── Single toast ──────────────────────────────────────────────────────── */
.seren-toast {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.95rem 1.1rem 0.95rem 0.9rem;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
  border-left-width: 3px;
  backdrop-filter: blur(20px);
  min-width: 260px;
  max-width: 360px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
  transform: translateX(calc(100% + 1.5rem));
  opacity: 0;
  transition: transform 0.38s cubic-bezier(0.34,1.4,0.64,1), opacity 0.3s ease;
  pointer-events: auto;
}
.seren-toast.toast-in {
  transform: translateX(0);
  opacity: 1;
}
.seren-toast.toast-out {
  transform: translateX(calc(100% + 1.5rem));
  opacity: 0;
  transition: transform 0.28s ease-in, opacity 0.22s ease;
}
.toast-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 900;
}
.toast-body { flex: 1; }
.toast-title {
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 0.18rem;
}
.toast-msg {
  font-size: 0.86rem;
  color: #ccc;
  line-height: 1.45;
}
.toast-close {
  background: none;
  border: none;
  color: #444;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
  flex-shrink: 0;
  margin-top: 0.1rem;
  transition: color 0.2s;
  line-height: 1;
}
.toast-close:hover { color: #aaa; }

/* Progress bar */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 0 0 12px 12px;
  animation: toastProgress linear forwards;
}
.seren-toast { position: relative; overflow: hidden; }
@keyframes toastProgress {
  from { width: 100%; }
  to   { width: 0%; }
}

/* ── Confirm overlay ────────────────────────────────────────────────────── */
.seren-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 99998;
  background: rgba(0,0,0,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  opacity: 0;
  transition: opacity 0.22s ease;
}
.seren-confirm-overlay.confirm-in { opacity: 1; }

.seren-confirm {
  background: linear-gradient(160deg, #141414, #0e0e0e);
  border: 1px solid #282828;
  border-radius: 18px;
  padding: 2rem 2rem 1.6rem;
  max-width: 400px;
  width: 92%;
  box-shadow: 0 32px 80px rgba(0,0,0,0.75);
  transform: scale(0.88) translateY(20px);
  transition: transform 0.3s cubic-bezier(0.34,1.4,0.64,1);
}
.seren-confirm-overlay.confirm-in .seren-confirm {
  transform: scale(1) translateY(0);
}

.confirm-icon {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  margin-bottom: 1.1rem;
}
.confirm-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.35rem;
  letter-spacing: 0.05em;
  color: #fff;
  margin-bottom: 0.5rem;
  line-height: 1;
}
.confirm-msg {
  color: #999;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1.6rem;
}
.confirm-btns {
  display: flex;
  gap: 0.65rem;
  justify-content: flex-end;
}
.confirm-cancel {
  padding: 0.62rem 1.25rem;
  background: #1a1a1a;
  border: 1px solid #303030;
  border-radius: 9px;
  color: #888;
  cursor: pointer;
  font-size: 0.88rem;
  font-family: inherit;
  transition: border-color 0.2s, color 0.2s;
}
.confirm-cancel:hover { border-color: #555; color: #ddd; }
.confirm-ok {
  padding: 0.62rem 1.4rem;
  border-radius: 9px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid;
  transition: background 0.2s, box-shadow 0.2s;
}
`;
  document.head.appendChild(s);
}

// ── Toast root container ──────────────────────────────────────────────────────
const getRoot = () => {
  let root = document.getElementById('seren-toast-root');
  if (!root) { root = document.createElement('div'); root.id = 'seren-toast-root'; document.body.appendChild(root); }
  return root;
};

// ── Toast ─────────────────────────────────────────────────────────────────────
const TOAST_THEMES = {
  success: { border: '#25d366', bg: 'rgba(37,211,102,0.07)',  iconBg: 'rgba(37,211,102,0.15)',  iconColor: '#25d366', label: 'Success', symbol: '✓' },
  error:   { border: '#ff3d3d', bg: 'rgba(255,61,61,0.07)',   iconBg: 'rgba(255,61,61,0.15)',   iconColor: '#ff3d3d', label: 'Error',   symbol: '✕' },
  warning: { border: '#ff8a3d', bg: 'rgba(255,138,61,0.07)',  iconBg: 'rgba(255,138,61,0.15)',  iconColor: '#ff8a3d', label: 'Warning', symbol: '!' },
  info:    { border: '#00e5ff', bg: 'rgba(0,229,255,0.07)',   iconBg: 'rgba(0,229,255,0.15)',   iconColor: '#00e5ff', label: 'Notice',  symbol: 'i' },
};

export const showToast = (message, type = 'info', duration = 4000) => {
  const t = TOAST_THEMES[type] || TOAST_THEMES.info;
  const toast = document.createElement('div');
  toast.className = 'seren-toast';
  toast.style.cssText = `border-left-color:${t.border};background:linear-gradient(135deg,${t.bg},rgba(13,13,13,0.97))`;
  toast.innerHTML = `
    <div class="toast-icon-wrap" style="background:${t.iconBg};color:${t.iconColor}">${t.symbol}</div>
    <div class="toast-body">
      <p class="toast-title" style="color:${t.iconColor}">${t.label}</p>
      <p class="toast-msg">${message}</p>
    </div>
    <button class="toast-close" aria-label="Dismiss">✕</button>
    <div class="toast-progress" style="background:${t.border};animation-duration:${duration}ms"></div>`;

  getRoot().appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast-in')));

  const dismiss = () => {
    toast.classList.remove('toast-in');
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 320);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
};

// ── Confirm dialog ────────────────────────────────────────────────────────────
const CONFIRM_THEMES = {
  default: { iconBg: 'rgba(0,229,255,0.12)', iconColor: '#00e5ff', okBg: 'rgba(0,229,255,0.1)', okBorder: 'rgba(0,229,255,0.45)', okColor: '#00e5ff', symbol: '?' },
  danger:  { iconBg: 'rgba(255,61,61,0.12)', iconColor: '#ff3d3d', okBg: 'rgba(255,61,61,0.1)', okBorder: 'rgba(255,61,61,0.45)', okColor: '#ff3d3d', symbol: '!' },
  warning: { iconBg: 'rgba(255,138,61,0.12)', iconColor: '#ff8a3d', okBg: 'rgba(255,138,61,0.1)', okBorder: 'rgba(255,138,61,0.45)', okColor: '#ff8a3d', symbol: '⚠' },
};

export const showConfirm = (message, opts = {}) => new Promise(resolve => {
  const {
    title         = 'Are you sure?',
    confirmLabel  = 'Confirm',
    cancelLabel   = 'Cancel',
    danger        = false,
    warning       = false,
    accentColor   = null,
  } = opts;

  const themeKey = danger ? 'danger' : warning ? 'warning' : 'default';
  const th = CONFIRM_THEMES[themeKey];
  const okBorder  = accentColor ? accentColor + '99' : th.okBorder;
  const okColor   = accentColor || th.okColor;
  const okBg      = accentColor ? accentColor + '1a' : th.okBg;

  const overlay = document.createElement('div');
  overlay.className = 'seren-confirm-overlay';
  overlay.innerHTML = `
    <div class="seren-confirm">
      <div class="confirm-icon" style="background:${th.iconBg};color:${th.iconColor}">${th.symbol}</div>
      <p class="confirm-title">${title}</p>
      <p class="confirm-msg">${message}</p>
      <div class="confirm-btns">
        <button class="confirm-cancel">${cancelLabel}</button>
        <button class="confirm-ok" style="background:${okBg};border-color:${okBorder};color:${okColor}">${confirmLabel}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('confirm-in')));

  const close = result => {
    overlay.classList.remove('confirm-in');
    setTimeout(() => overlay.remove(), 250);
    resolve(result);
  };

  overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(false));
  overlay.querySelector('.confirm-ok').addEventListener('click', () => close(true));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
});
