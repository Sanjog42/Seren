import { apiRequest } from './api.js';

const DETAIL = {
  kits:     './product-kits.html',
  clothing: './product-clothing.html',
  crochet:  './product-crochet.html',
};

export function initNavSearch() {
  const input = document.querySelector('.nav-search-input');
  if (!input) return;

  // ── Build overlay ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'nso';
  overlay.innerHTML = '<div class="nso-inner"></div>';
  document.body.appendChild(overlay);

  const inner = overlay.querySelector('.nso-inner');

  // Position overlay below nav once nav height is known
  const nav = document.querySelector('.nav');
  function positionOverlay() {
    overlay.style.top = (nav?.offsetHeight || 72) + 'px';
  }
  positionOverlay();
  window.addEventListener('resize', positionOverlay);

  // ── Open / close helpers ───────────────────────────────────────────────────
  function open()  { overlay.classList.add('nso-open'); }
  function close() { overlay.classList.remove('nso-open'); }

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!overlay.contains(e.target) && !input.closest('.nav-search-wrap').contains(e.target)) {
      close();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); input.blur(); }
  });

  // Re-open if user focuses back and there's a query
  input.addEventListener('focus', () => {
    if (input.value.trim()) open();
  });

  // ── Search ─────────────────────────────────────────────────────────────────
  let timer;
  let lastQuery = '';

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { close(); return; }
    if (q === lastQuery) { open(); return; }
    inner.innerHTML = '<p class="nso-msg">Searching…</p>';
    open();
    timer = setTimeout(() => doSearch(q), 280);
  });

  async function doSearch(q) {
    lastQuery = q;
    try {
      const results = await apiRequest(`/api/products/?search=${encodeURIComponent(q)}&limit=6`);
      if (!results.length) {
        inner.innerHTML = '<p class="nso-msg">No products found.</p>';
        return;
      }
      inner.innerHTML = `
        <p class="nso-section-label">PRODUCTS</p>
        <div class="nso-grid">
          ${results.map(p => {
            const href = `${DETAIL[p.category] || './product-kits.html'}?id=${p.id}`;
            return `
              <a class="nso-card" href="${href}">
                <div class="nso-card-img">
                  <img src="${p.primary_image || ''}" alt="${p.name}" loading="lazy" />
                </div>
                <div class="nso-card-info">
                  <span class="nso-name">${p.name}</span>
                  <span class="nso-price">NPR ${Number(p.price).toLocaleString()}</span>
                </div>
              </a>`;
          }).join('')}
        </div>`;
    } catch {
      inner.innerHTML = '<p class="nso-msg">Search failed — please try again.</p>';
    }
  }
}
