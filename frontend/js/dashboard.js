import { apiRequest, apiUpload, getRole } from './api.js';
import { guard, logout } from './auth.js';
import { showToast, showConfirm } from './ui.js';

// ── bootstrap ─────────────────────────────────────────────────────────────────
const role = getRole();
const isAdmin = role === 'admin';

if (!guard(['staff', 'admin'])) throw new Error('Unauthorized');

document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', logout));

const view = document.getElementById('view');
const $ = id => document.getElementById(id);
const currency = v => `NPR ${Number(v || 0).toFixed(2)}`;
const SIZES = ['M', 'L', 'XL', 'XXL'];

const STATUS_COLORS = {
  pending: '#a0a0a0',
  confirmed: '#ff9ec4',
  sent_for_delivery: '#00e5ff',
  completed: '#25d366',
  cancelled: '#ff3d3d',
};
const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  sent_for_delivery: 'Sent for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['sent_for_delivery', 'cancelled'],
  sent_for_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const TRANSITION_LABELS = {
  confirmed: 'Confirm Order',
  sent_for_delivery: 'Send for Delivery',
  completed: 'Mark Completed',
  cancelled: 'Cancel Order',
};
// Revert map: current status → what it reverts back to
const REVERT_STATUS = {
  confirmed:         'pending',
  sent_for_delivery: 'confirmed',
  completed:         'sent_for_delivery',
};

const stockColor = qty => {
  if (qty === 0) return '#ff3d3d';
  if (qty <= 3) return '#ff8a3d';
  if (qty > 10) return '#25d366';
  return '#e0e0e0';
};

// Normalise legacy "No Size" → "Free Size" and render stock chips.
// Crochet / free-size items show just the quantity with no size label.
const isFreeSize = s => s.size === 'Free Size' || s.size === 'No Size';
const renderSizeChips = sizes =>
  sizes.map(s =>
    '<span class="stock-chip" style="color:' + stockColor(s.quantity) + '">'
    + (isFreeSize(s) ? '' : s.size + ': ')
    + s.quantity + '</span>'
  ).join('');
// Display size in orders / tables — hide "Free Size" / "No Size" with a dash
const displaySize = size =>
  (size === 'Free Size' || size === 'No Size') ? '—' : size;


// ── OVERVIEW ──────────────────────────────────────────────────────────────────

const overviewView = async () => {
  view.innerHTML = '<p style="padding:1rem" class="muted">Loading…</p>';
  let stock = [], orders = [];
  try {
    [stock, orders] = await Promise.all([
      apiRequest('/api/staff/products/stock/', 'GET', null, true),
      apiRequest('/api/staff/orders/', 'GET', null, true),
    ]);
  } catch (e) {
    view.innerHTML = `<p class="text-red" style="padding:1rem">Failed to load dashboard: ${e.message}</p>`;
    return;
  }

  const total = stock.length;
  // Flatten to individual size variants — matches the stock view's per-row approach
  const allVariants = stock.flatMap(p => p.sizes || []);
  const low = allVariants.filter(s => s.quantity > 0 && s.quantity <= 3).length;
  const out = allVariants.filter(s => s.quantity === 0).length;
  const pending = orders.filter(o => o.status === 'pending').length;

  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const adminExtraCards = isAdmin ? `
      <button class="ov-nav-card" data-goto="users">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </span>
        <span class="ov-nav-label">Users</span>
        <span class="ov-nav-sub">Manage customer and staff accounts</span>
      </button>
      <button class="ov-nav-card" data-goto="unusedStock">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </span>
        <span class="ov-nav-label">Unused Stock</span>
        <span class="ov-nav-sub">Products idle for over 30 days</span>
      </button>` : '';

  const analyticsPanel = isAdmin ? `
    <section class="panel" style="margin-top:1.6rem">
      <div class="panel-head">
        <h3>Analytics</h3>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          <select id="anaMonth" class="field-input" style="width:140px">
            ${months.map((m, i) => '<option value="' + (i + 1) + '"' + (i + 1 === now.getMonth() + 1 ? ' selected' : '') + '>' + m + '</option>').join('')}
          </select>
          <input id="anaYear" class="field-input" type="number" value="${now.getFullYear()}" min="2020" style="width:90px" />
          <button id="loadAna" class="btn">Load</button>
        </div>
      </div>
      <div id="anaContent"><p class="muted">Press Load to fetch data.</p></div>
    </section>` : '';

  view.innerHTML = `
    <div class="stats-grid">
      <article class="stat-card"><h4>Total Products</h4><p>${total}</p></article>
      <article class="stat-card"><h4>Low Stock</h4><p class="text-orange">${low}</p></article>
      <article class="stat-card"><h4>Out of Stock</h4><p class="text-red">${out}</p></article>
      <article class="stat-card"><h4>Pending Orders</h4><p class="text-cyan">${pending}</p></article>
    </div>

    <div class="${isAdmin ? 'ov-nav-grid-admin' : 'ov-nav-grid'}" style="margin-top:1.6rem">
      <button class="ov-nav-card" data-goto="addProduct">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        </span>
        <span class="ov-nav-label">Add Product</span>
        <span class="ov-nav-sub">Upload a new product listing</span>
      </button>
      <button class="ov-nav-card" data-goto="editProducts">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </span>
        <span class="ov-nav-label">Edit Products</span>
        <span class="ov-nav-sub">Modify existing product details</span>
      </button>
      <button class="ov-nav-card" data-goto="stock">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        </span>
        <span class="ov-nav-label">Stock</span>
        <span class="ov-nav-sub">Track and update inventory levels</span>
      </button>
      <button class="ov-nav-card" data-goto="orders">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </span>
        <span class="ov-nav-label">Orders</span>
        <span class="ov-nav-sub">Manage and fulfil customer orders</span>
      </button>
      <button class="ov-nav-card" data-goto="hotPicks">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </span>
        <span class="ov-nav-label">Hot Picks</span>
        <span class="ov-nav-sub">Feature products on the homepage</span>
      </button>
      <button class="ov-nav-card" data-goto="offers">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        </span>
        <span class="ov-nav-label">Offers</span>
        <span class="ov-nav-sub">Manage homepage offer section</span>
      </button>
      <button class="ov-nav-card" data-goto="recordSale">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </span>
        <span class="ov-nav-label">Record Sale</span>
        <span class="ov-nav-sub">Log an in-person or offline sale</span>
      </button>
      <button class="ov-nav-card" data-goto="delivery">
        <span class="ov-nav-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </span>
        <span class="ov-nav-label">Delivery</span>
        <span class="ov-nav-sub">Manage delivery areas and charges</span>
      </button>
      ${adminExtraCards}
    </div>

    ${analyticsPanel}`;

  // Wire nav card buttons for everyone
  document.querySelectorAll('.ov-nav-card[data-goto]').forEach(card => {
    card.addEventListener('click', () => {
      const tabBtn = document.querySelector('[data-tab="' + card.dataset.goto + '"]');
      if (tabBtn) tabBtn.click();
    });
  });

  if (!isAdmin) return;

  const loadAnalytics = async () => {
    const month = $('anaMonth').value;
    const year = $('anaYear').value;
    $('anaContent').innerHTML = '<p>Loading…</p>';
    try {
      const d = await apiRequest(`/api/admin/analytics/orders/?month=${month}&year=${year}`, 'GET', null, true);
      [_qtyChart, _revChart, _statusChart].forEach(c => c?.destroy());
      $('anaContent').innerHTML = `
        <div class="stats-grid" style="margin-bottom:1.2rem">
          <article class="stat-card"><h4>Completed Orders</h4><p>${d.completed_orders_count}</p></article>
          <article class="stat-card"><h4>Total Revenue</h4><p style="font-size:1rem">${currency(d.total_revenue)}</p></article>
          <article class="stat-card"><h4>Items Sold</h4><p>${d.total_items_sold}</p></article>
          <article class="stat-card"><h4>Top Product</h4>
            <p style="font-size:0.85rem;line-height:1.3">
              ${d.most_selling_product?.name || '—'}
              ${d.most_selling_product?.quantity_sold ? `<br><span class="muted">(${d.most_selling_product.quantity_sold} sold)</span>` : ''}
            </p>
          </article>
        </div>
        <div class="charts-grid">
          <div class="chart-box"><h4>Quantity by Category</h4><canvas id="qtyChart"></canvas></div>
          <div class="chart-box"><h4>Revenue by Category</h4><canvas id="revChart"></canvas></div>
          <div class="chart-box"><h4>Order Status Breakdown</h4><canvas id="statusChart"></canvas></div>
        </div>`;

      const cats = ['Kits', 'Crochet', 'Clothing'];
      const catKeys = ['kits', 'crochet', 'clothing'];
      const catColors = ['#ff3d3d', '#ff9ec4', '#8a9ab0'];
      const pieBase = { plugins: { legend: { labels: { color: '#fff', font: { size: 13 } } } } };

      _qtyChart = new Chart($('qtyChart'), {
        type: 'pie',
        data: { labels: cats, datasets: [{ data: catKeys.map(c => d.category_quantity_breakdown[c] || 0), backgroundColor: catColors, borderWidth: 0 }] },
        options: pieBase,
      });
      _revChart = new Chart($('revChart'), {
        type: 'pie',
        data: { labels: cats, datasets: [{ data: catKeys.map(c => d.category_revenue_breakdown[c] || 0), backgroundColor: catColors, borderWidth: 0 }] },
        options: pieBase,
      });
      const sk = Object.keys(d.order_status_breakdown);
      _statusChart = new Chart($('statusChart'), {
        type: 'doughnut',
        data: {
          labels: sk.map(k => STATUS_LABELS[k] || k),
          datasets: [{ data: sk.map(k => d.order_status_breakdown[k]), backgroundColor: sk.map(k => STATUS_COLORS[k]), borderWidth: 0 }],
        },
        options: pieBase,
      });
    } catch (e) {
      $('anaContent').innerHTML = `<p class="text-red">Error: ${e.message}</p>`;
    }
  };

  $('loadAna').addEventListener('click', loadAnalytics);
  await loadAnalytics();
};

// ── ADD PRODUCT ───────────────────────────────────────────────────────────────

const addProductView = () => {
  view.innerHTML = `
    <section class="panel">
      <h3>Add Product</h3>
      <p class="muted" style="margin:0.3rem 0 1rem">Step 1 — Choose a category</p>
      <div class="cat-step">
        <button class="cat-btn" data-cat="kits">Kits</button>
        <button class="cat-btn" data-cat="crochet">Crochet</button>
        <button class="cat-btn" data-cat="clothing">Clothing</button>
        <button class="cat-btn" data-cat="bouquet">Wrapping Papers</button>
      </div>
      <div id="productFormWrap"></div>
    </section>`;

  view.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      view.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.cat === 'bouquet') {
        renderWrappingForm($('productFormWrap'));
      } else {
        await renderProductForm($('productFormWrap'), btn.dataset.cat, null);
      }
    });
  });
};

const renderWrappingForm = (wrap, existing = null) => {
  const existingImgHTML = existing?.image
    ? '<div class="img-row" style="margin-bottom:0.5rem"><img src="' + existing.image + '" class="thumb-prev is-primary" alt="Current image" /></div>'
    : '';

  wrap.innerHTML = `
    <form id="wrappingForm" style="margin-top:1.2rem">
      <div class="form-grid2">
        <div class="form-col">
          <p class="field-label">Wrapping Name *</p>
          <input id="wName" class="field-input" placeholder="e.g. Kraft Paper, Satin Ribbon…"
            value="${existing?.name || ''}" required />

          <p class="field-label">Price (NPR) *</p>
          <input id="wPrice" class="field-input" type="number" min="0" step="0.01" placeholder="0.00"
            value="${existing?.price || ''}" required />

          <label class="label-check" style="margin-top:0.8rem">
            <input type="checkbox" id="wActive" ${!existing || existing.is_active ? 'checked' : ''} />
            Active (visible in bouquet builder)
          </label>
        </div>
        <div class="form-col">
          <p class="field-label">${existing ? 'Image (upload to replace)' : 'Image *'}</p>
          ${existingImgHTML}
          <div id="wDropZone" class="drop-zone">
            <p>${existing?.image ? 'Drop a new image to replace, or ' : 'Drag & drop image here or '}<span class="drop-link">click to browse</span></p>
            <input type="file" id="wImgFile" accept="image/*" style="display:none" />
          </div>
          <div id="wPreview" class="img-row" style="margin-top:0.5rem"></div>
        </div>
      </div>

      <p id="wErr" class="error" style="margin-top:0.8rem"></p>
      <div style="display:flex;gap:0.7rem;margin-top:1rem">
        <button type="submit" class="btn">${existing ? 'Save Changes' : 'Add Wrapping Paper'}</button>
        ${existing ? '<button type="button" id="wCancelBtn" class="btn-ghost">Cancel</button>' : ''}
      </div>
    </form>`;

  $('wCancelBtn')?.addEventListener('click', editProductsView);

  // Image drop/browse
  const dropZone = $('wDropZone');
  const imgFile  = $('wImgFile');
  const preview  = $('wPreview');
  let selectedFile = null;

  const showPreview = (file) => {
    selectedFile = file;
    preview.innerHTML = `
      <div class="preview-wrap">
        <img src="${URL.createObjectURL(file)}" class="thumb-prev is-primary" />
        <div class="img-actions">
          <button type="button" class="btn-xs danger-xs" id="wRemoveImg">✕</button>
        </div>
      </div>`;
    $('wRemoveImg').addEventListener('click', () => { selectedFile = null; preview.innerHTML = ''; });
  };

  dropZone.addEventListener('click', () => imgFile.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) showPreview(e.dataTransfer.files[0]);
  });
  imgFile.addEventListener('change', () => { if (imgFile.files[0]) showPreview(imgFile.files[0]); });

  // Submit
  $('wrappingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('wErr');
    errEl.textContent = '';
    const name  = $('wName').value.trim();
    const price = $('wPrice').value.trim();
    if (!name || !price) { errEl.textContent = 'Name and price are required.'; return; }
    if (!existing && !selectedFile) { errEl.textContent = 'Please upload an image.'; return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
    try {
      if (existing) {
        if (selectedFile) {
          const fd = new FormData();
          fd.append('name', name);
          fd.append('price', price);
          fd.append('is_active', $('wActive').checked ? 'true' : 'false');
          fd.append('image', selectedFile);
          await apiUpload('/api/staff/bouquet/wrappings/' + existing.id + '/', fd, 'PATCH');
        } else {
          await apiRequest('/api/staff/bouquet/wrappings/' + existing.id + '/', 'PATCH',
            { name, price: parseFloat(price), is_active: $('wActive').checked }, true);
        }
        showToast('Wrapping paper updated!', 'success');
        editProductsView();
      } else {
        const fd = new FormData();
        fd.append('name', name);
        fd.append('price', price);
        fd.append('is_active', $('wActive').checked ? 'true' : 'false');
        fd.append('image', selectedFile);
        await apiUpload('/api/staff/bouquet/wrappings/', fd, 'POST');
        showToast('Wrapping paper added successfully!', 'success');
        wrap.innerHTML = '';
        view.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      }
    } catch (err) {
      errEl.textContent = err?.payload?.detail || Object.values(err?.payload || {}).flat().join(' ') || err.message || 'Failed to save.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = existing ? 'Save Changes' : 'Add Wrapping Paper';
    }
  });
};

const renderProductForm = async (wrap, category, existing) => {
  const bouquetCheckboxHTML = category === 'crochet' ? `
    <label class="label-check" style="margin-top:0.9rem">
      <input type="checkbox" id="addToFlowers" />
      Also add to Bouquet Builder as a flower
    </label>` : '';

  const labels = await apiRequest(`/api/products/labels/?category=${category}`).catch(() => []);
  const predefined = labels.filter(l => l.is_predefined);
  const custom = labels.filter(l => !l.is_predefined);
  const allLabels = [...predefined, ...custom];
  const existingLabelIds = existing ? (existing.labels || []).map(l => l.id) : [];
  const existingSizes = existing ? (existing.sizes || []) : [];
  const hasNoSize = existingSizes.some(s => isFreeSize(s));
  const noSizeEntry = existingSizes.find(s => isFreeSize(s));

  const LABEL_TYPE     = ['T-Shirt', 'Hoodie'];
  const LABEL_QUALITY  = ['Embroidery Set', 'Players Grade', 'Sublimation Print'];
  const LABEL_SPECIAL  = ['Retro', 'Special Edition', 'World Cup'];

  const makeLblCheck = l => `
    <label class="label-check">
      <input type="checkbox" class="lbl-cb" value="${l.id}" ${existingLabelIds.includes(l.id) ? 'checked' : ''} />
      <span class="lbl-name">${l.name}</span>
      ${isAdmin ? `<button type="button" class="lbl-del-btn" data-del-lbl="${l.id}" data-del-lbl-name="${l.name}" title="Delete label">✕</button>` : ''}
    </label>`;

  const typeLbls    = allLabels.filter(l => LABEL_TYPE.includes(l.name));
  const qualityLbls = allLabels.filter(l => LABEL_QUALITY.includes(l.name));
  const specialLbls = allLabels.filter(l => LABEL_SPECIAL.includes(l.name));
  const regularLbls = allLabels.filter(l =>
    !LABEL_TYPE.includes(l.name) &&
    !LABEL_QUALITY.includes(l.name) &&
    !LABEL_SPECIAL.includes(l.name)
  );

  const makeLblGroup = (items, groupId, placeholder) => `
    <div class="lbl-group" id="${groupId}">${items.map(makeLblCheck).join('')}</div>
    <div class="add-label-row lbl-add-row" style="margin-top:0.35rem">
      <input class="field-input new-lbl-input" style="font-size:0.82rem;padding:0.32rem 0.6rem"
        placeholder="${placeholder}" data-target="${groupId}" />
      <button type="button" class="btn-sm add-lbl-btn" data-target="${groupId}">+ Add</button>
    </div>`;

  const sizesHTML = SIZES.map(s => {
    const es = existingSizes.find(x => x.size === s);
    return `
      <label class="size-check">
        <input type="checkbox" class="size-cb" data-size="${s}"
          ${es ? 'checked' : ''} ${hasNoSize ? 'disabled' : ''} />
        <span class="size-label">${s}</span>
        <input type="number" class="qty-input" data-qty="${s}" min="0" placeholder="Qty"
          value="${es ? es.quantity : ''}" ${(es && !hasNoSize) ? '' : 'disabled'} />
      </label>`;
  }).join('');

  const existingImgHTML = existing && existing.images?.length ? `
    <div class="img-row" id="existingImgs">
      ${existing.images.map(img => `
        <div class="preview-wrap" data-img-id="${img.id}">
          <img src="${img.image}" class="thumb-prev ${img.is_primary ? 'is-primary' : ''}" />
          <div class="img-actions">
            <button type="button" class="btn-xs ${img.is_primary ? 'btn-xs-active' : ''}"
              data-set-primary="${img.id}" title="Set as primary">★</button>
            <button type="button" class="btn-xs danger-xs" data-del-img="${img.id}" title="Delete">✕</button>
          </div>
        </div>`).join('')}
    </div>` : '';

  wrap.innerHTML = `
    <form id="productForm" style="margin-top:1.2rem">
      <div class="form-grid2">
        <div class="form-col">
          <p class="field-label">Product Name *</p>
          <input id="pName" class="field-input" placeholder="Product name" value="${existing?.name || ''}" required />

          <p class="field-label" id="pPriceLabel">Price (NPR) *</p>
          <input id="pPrice" class="field-input" type="number" min="0" step="0.01"
            value="${existing?.price || ''}" required />
          <div id="originalPriceRow" style="${existing?.is_offer ? '' : 'display:none'}">
            <p class="field-label" style="margin-top:0.6rem">Original Price (NPR) <span class="muted" style="font-size:0.78rem;font-weight:400">— will show crossed out</span></p>
            <input id="pOriginalPrice" class="field-input" type="number" min="0" step="0.01"
              value="${existing?.original_price || ''}" placeholder="e.g. 1500" />
          </div>

          <p class="field-label">Description</p>
          <textarea id="pDesc" class="field-input field-textarea" rows="5"
            placeholder="Describe this product...">${existing?.description || ''}</textarea>

          <label class="label-check" style="margin-top:0.6rem">
            <input type="checkbox" id="pActive" ${!existing || existing.is_active ? 'checked' : ''} />
            Active (visible to customers)
          </label>
          <label class="label-check" style="margin-top:0.45rem">
            <input type="checkbox" id="pOffer" ${existing?.is_offer ? 'checked' : ''} />
            Mark as Offer (shown in Offers section on homepage)
          </label>
          ${category === 'kits' ? `
          <label class="label-check" style="margin-top:0.45rem">
            <input type="checkbox" id="pAllowPrint" ${existing?.allow_print ? 'checked' : ''} />
            Allow custom back print (jersey name &amp; number, +NPR 300)
          </label>` : ''}
        </div>
        <div class="form-col">
          <p class="field-label">Labels</p>
          <div class="label-sections-wrap">
            <p class="lbl-section-head">Type</p>
            ${makeLblGroup(typeLbls, 'lgType', 'Add type label…')}
            <p class="lbl-section-head">Other</p>
            ${makeLblGroup(regularLbls, 'lgRegular', 'Add label…')}
            <p class="lbl-section-head">Quality</p>
            ${makeLblGroup(qualityLbls, 'lgQuality', 'Add quality label…')}
            <p class="lbl-section-head">Special Edition</p>
            ${makeLblGroup(specialLbls, 'lgSpecial', 'Add special edition label…')}
          </div>
        </div>
      </div>

      <p class="field-label" style="margin-top:1.4rem">${category === 'crochet' ? 'Quantity *' : 'Sizes & Stock *'}</p>
      ${category === 'crochet' ? `
        <input id="crochetQty" class="field-input" type="number" min="0" placeholder="Quantity"
          value="${noSizeEntry ? noSizeEntry.quantity : ''}" style="max-width:180px" />
        ${bouquetCheckboxHTML}
      ` : `
        <div class="size-grid">
          <label class="size-check no-size-row">
            <input type="checkbox" id="noSizeCb" ${hasNoSize ? 'checked' : ''} />
            <span class="size-label">Free Size</span>
            <input type="number" id="noSizeQty" class="qty-input" min="0" placeholder="Qty"
              value="${noSizeEntry ? noSizeEntry.quantity : ''}" ${hasNoSize ? '' : 'disabled'} />
          </label>
          ${sizesHTML}
        </div>`}

      <p class="field-label" style="margin-top:1.4rem">Images</p>
      ${existingImgHTML}
      <div id="dropZone" class="drop-zone">
        ${('ontouchstart' in window || navigator.maxTouchPoints > 0)
          ? '<p>Tap to choose images from your gallery or camera</p>'
          : '<p>Drag & drop images here or <span class="drop-link">click to browse</span></p>'}
        <input type="file" id="imgFile" multiple accept="image/*" style="display:none" />
      </div>
      <div id="newPreviews" class="img-row" style="margin-top:0.5rem"></div>

      <p id="formErr" class="error" style="margin-top:0.8rem"></p>
      <div style="display:flex;gap:0.7rem;margin-top:1rem;flex-wrap:wrap">
        <button type="submit" class="btn">${existing ? 'Save Changes' : 'Create Product'}</button>
        ${existing ? '<button type="button" id="cancelEditBtn" class="btn-ghost">Cancel</button>' : ''}
      </div>
    </form>`;

  // ── add custom label (one handler for all three section buttons) ──
  wrap.querySelectorAll('.add-lbl-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row   = btn.closest('.lbl-add-row');
      const input = row.querySelector('.new-lbl-input');
      const name  = input.value.trim();
      if (!name) return;
      const targetId = btn.dataset.target;
      try {
        const lbl = await apiRequest('/api/staff/labels/', 'POST', { name, category, is_predefined: false }, true);
        const html = `
          <label class="label-check">
            <input type="checkbox" class="lbl-cb" value="${lbl.id}" checked />
            <span class="lbl-name">${lbl.name}</span>
            ${isAdmin ? `<button type="button" class="lbl-del-btn" data-del-lbl="${lbl.id}" data-del-lbl-name="${lbl.name}" title="Delete label">✕</button>` : ''}
          </label>`;
        document.getElementById(targetId).insertAdjacentHTML('beforeend', html);
        // wire delete btn on the newly inserted element
        const newDelBtn = document.getElementById(targetId).querySelector(`[data-del-lbl="${lbl.id}"]`);
        if (newDelBtn) wireLblDel(newDelBtn);
        input.value = '';
      } catch (e) { showToast(e.message || 'Failed to add label', 'error'); }
    });
  });

  // ── delete label (admin only) ──
  const wireLblDel = btn => {
    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const ok = await showConfirm(
        `Delete label "<strong>${btn.dataset.delLblName}</strong>"? It will be removed from all products.`,
        { title: 'Delete Label?', confirmLabel: 'Delete', danger: true }
      );
      if (!ok) return;
      try {
        await apiRequest(`/api/staff/labels/${btn.dataset.delLbl}/`, 'DELETE', null, true);
        btn.closest('.label-check').remove();
        showToast('Label deleted.', 'success');
      } catch (err) {
        showToast(err?.payload?.detail || err.message || 'Failed to delete label.', 'error');
      }
    });
  };

  if (isAdmin) {
    wrap.querySelectorAll('[data-del-lbl]').forEach(wireLblDel);
  }

  // ── no-size toggle (kits / clothing only) ──
  const noSizeCb = $('noSizeCb');
  noSizeCb?.addEventListener('change', () => {
    const on = noSizeCb.checked;
    $('noSizeQty').disabled = !on;
    wrap.querySelectorAll('.size-cb').forEach(cb => {
      cb.disabled = on;
      if (on) {
        cb.checked = false;
        cb.closest('.size-check').querySelector('.qty-input').disabled = true;
        cb.closest('.size-check').querySelector('.qty-input').value = '';
      }
    });
  });

  wrap.querySelectorAll('.size-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const qi = cb.closest('.size-check').querySelector('.qty-input');
      qi.disabled = !cb.checked;
      if (!cb.checked) qi.value = '';
    });
  });

  // ── drag & drop images ──
  const dropZone = $('dropZone');
  const imgFile = $('imgFile');
  const newPreviews = $('newPreviews');
  let pendingFiles = [];

  const renderPreviews = () => {
    newPreviews.innerHTML = pendingFiles.map((e, i) => `
      <div class="preview-wrap">
        <img src="${URL.createObjectURL(e.file)}" class="thumb-prev ${e.primary ? 'is-primary' : ''}" />
        <div class="img-actions">
          <button type="button" class="btn-xs ${e.primary ? 'btn-xs-active' : ''}" data-prim="${i}"
            title="Set as primary">★</button>
          <button type="button" class="btn-xs danger-xs" data-prm="${i}" title="Remove">✕</button>
        </div>
      </div>`).join('');

    newPreviews.querySelectorAll('[data-prim]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.prim);
      pendingFiles.forEach((e, j) => e.primary = j === i);
      renderPreviews();
    }));
    newPreviews.querySelectorAll('[data-prm]').forEach(b => b.addEventListener('click', () => {
      pendingFiles.splice(Number(b.dataset.prm), 1);
      if (pendingFiles.length && !pendingFiles.some(e => e.primary)) pendingFiles[0].primary = true;
      renderPreviews();
    }));
  };

  const addFiles = files => {
    [...files].forEach(f => {
      if (!f.type.startsWith('image/')) return;
      pendingFiles.push({ file: f, primary: pendingFiles.length === 0 });
    });
    renderPreviews();
  };

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); addFiles(e.dataTransfer.files); });
  dropZone.addEventListener('click', () => imgFile.click());
  wrap.querySelector('.drop-link').addEventListener('click', e => { e.stopPropagation(); imgFile.click(); });
  imgFile.addEventListener('change', () => { addFiles(imgFile.files); imgFile.value = ''; });

  // ── existing image actions ──
  if (existing) {
    wrap.querySelectorAll('[data-set-primary]').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/staff/products/${existing.id}/images/${b.dataset.setPrimary}/set-primary/`, 'PUT', {}, true);
          wrap.querySelectorAll('#existingImgs .thumb-prev').forEach(t => t.classList.remove('is-primary'));
          wrap.querySelectorAll('#existingImgs .btn-xs').forEach(x => x.classList.remove('btn-xs-active'));
          b.closest('.preview-wrap').querySelector('.thumb-prev').classList.add('is-primary');
          b.classList.add('btn-xs-active');
        } catch (e) { showToast(e.message || 'Failed to set primary image.', 'error'); }
      });
    });

    wrap.querySelectorAll('[data-del-img]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!await showConfirm('This image will be permanently deleted.', { title: 'Delete Image', confirmLabel: 'Delete', danger: true })) return;
        try {
          await apiRequest(`/api/staff/products/${existing.id}/images/${b.dataset.delImg}/`, 'DELETE', null, true);
          b.closest('.preview-wrap').remove();
          showToast('Image deleted.', 'info');
        } catch (e) { showToast(e.message || 'Failed to delete image.', 'error'); }
      });
    });

    $('cancelEditBtn')?.addEventListener('click', editProductsView);
  }

  // ── offer checkbox: show/hide original price field ──
  $('pOffer').addEventListener('change', () => {
    const row = $('originalPriceRow');
    if (row) {
      row.style.display = $('pOffer').checked ? '' : 'none';
      if (!$('pOffer').checked) $('pOriginalPrice').value = '';
    }
    $('pPriceLabel').textContent = $('pOffer').checked ? 'Offer Price (NPR) *' : 'Price (NPR) *';
  });
  // Set correct label on load
  if ($('pOffer').checked) $('pPriceLabel').textContent = 'Offer Price (NPR) *';

  // ── submit ──
  $('productForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('formErr').textContent = '';

    const name = $('pName').value.trim();
    const price = parseFloat($('pPrice').value);
    const description = $('pDesc').value.trim();
    const is_active    = $('pActive').checked;
    const is_offer     = $('pOffer').checked;
    const allow_print  = category === 'kits' ? ($('pAllowPrint')?.checked ?? false) : false;
    const labels = [...wrap.querySelectorAll('.lbl-cb:checked')].map(i => Number(i.value));

    let sizes = [];
    if (category === 'crochet') {
      sizes = [{ size: 'Free Size', quantity: parseInt($('crochetQty').value) || 0 }];
    } else if ($('noSizeCb').checked) {
      sizes = [{ size: 'Free Size', quantity: parseInt($('noSizeQty').value) || 0 }];
    } else {
      wrap.querySelectorAll('.size-cb:checked').forEach(cb => {
        sizes.push({
          size: cb.dataset.size,
          quantity: parseInt(cb.closest('.size-check').querySelector('.qty-input').value) || 0,
        });
      });
    }

    if (!name) { $('formErr').textContent = 'Product name is required.'; return; }
    if (!sizes.length) { $('formErr').textContent = 'Select at least one size or "Free Size".'; return; }

    try {
      const original_price = is_offer && $('pOriginalPrice').value
        ? parseFloat($('pOriginalPrice').value)
        : null;
      const payload = { name, description, category, price, labels, sizes, is_active, is_offer, original_price, allow_print };
      let product;
      if (existing) {
        product = await apiRequest(`/api/staff/products/${existing.id}/`, 'PUT', payload, true);
      } else {
        product = await apiRequest('/api/staff/products/', 'POST', payload, true);
      }

      if (pendingFiles.length) {
        const ordered = [...pendingFiles].sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
        const fd = new FormData();
        ordered.forEach(e => fd.append('images', e.file));
        await apiUpload(`/api/staff/products/${product.id}/images/`, fd);
      }

      // Also add to Bouquet Builder as a flower (crochet only)
      const addToFlowersCb = document.getElementById('addToFlowers');
      if (addToFlowersCb?.checked) {
        const primaryFile = pendingFiles.find(e => e.primary)?.file || pendingFiles[0]?.file;
        const flowerFd = new FormData();
        flowerFd.append('name', name);
        flowerFd.append('price_per_unit', price);
        flowerFd.append('max_quantity_per_bouquet', '20');
        flowerFd.append('is_active', 'true');
        if (primaryFile) flowerFd.append('image', primaryFile);
        try {
          await apiUpload('/api/staff/bouquet/flowers/', flowerFd, 'POST');
        } catch (flowerErr) {
          showToast('Product saved — but failed to add to Bouquet Builder: ' + (flowerErr?.payload?.detail || flowerErr.message || 'Unknown error'), 'warning');
        }
      }

      showToast(existing ? 'Product updated successfully!' : 'Product created successfully!', 'success');
      if (existing) editProductsView(); else addProductView();
    } catch (err) {
      $('formErr').textContent = err?.payload
        ? Object.values(err.payload).flat().join(' | ')
        : err.message;
    }
  });
};

// ── EDIT PRODUCTS ─────────────────────────────────────────────────────────────

let editSearch = '';
let editCat = 'all';

const editProductsView = async () => {
  view.innerHTML = `
    <section class="panel">
      <h3>Edit Products</h3>
      <div class="filter-row" style="margin-top:0.7rem">
        <input id="searchInput" class="field-input" placeholder="Search by name…"
          value="${editSearch}" style="flex:1;max-width:300px" />
        <select id="catFilter" class="field-input" style="width:180px">
          <option value="all">All Categories</option>
          <option value="kits">Kits</option>
          <option value="crochet">Crochet</option>
          <option value="clothing">Clothing</option>
          <option value="wrapping">Wrapping Papers</option>
        </select>
      </div>
      <div id="editTableWrap" class="table-wrap" style="margin-top:0.8rem">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Status</th><th></th></tr></thead>
          <tbody id="productsBody"><tr><td colspan="5">Loading…</td></tr></tbody>
        </table>
      </div>
    </section>
    <div id="editFormSection"></div>`;

  $('catFilter').value = editCat;

  const loadProducts = async () => {
    editSearch = $('searchInput').value.toLowerCase();
    editCat = $('catFilter').value;
    $('editFormSection').innerHTML = '';

    // ── Wrapping Papers branch ──────────────────────────────────────────────
    if (editCat === 'wrapping') {
      $('editTableWrap').innerHTML = `<div class="hp-grid ep-grid" id="productsBody"></div>`;
      try {
        let wrappings = await apiRequest('/api/staff/bouquet/wrappings/', 'GET', null, true);
        if (editSearch) wrappings = wrappings.filter(w => w.name.toLowerCase().includes(editSearch));
        const body = $('productsBody');
        body.innerHTML = wrappings.length
          ? wrappings.map(w => `
            <div class="hp-card ep-card${w.is_active ? '' : ' ep-inactive'}" data-id="${w.id}">
              <img src="${w.image || ''}" alt="${w.name}" class="hp-img" />
              <div class="hp-info">
                <p class="hp-name" title="${w.name}">${w.name}</p>
                <p class="hp-cat">Wrapping · NPR ${Number(w.price).toLocaleString()}</p>
                ${!w.is_active ? '<p class="ep-inactive-tag">Inactive</p>' : ''}
              </div>
              <div class="ep-actions">
                <button class="ep-edit-btn" data-edit-wrap="${w.id}">Edit</button>
                <button class="ep-del-btn"  data-del-wrap="${w.id}" data-del-wrap-name="${w.name}">Delete</button>
              </div>
            </div>`).join('')
          : '<p class="muted" style="padding:1rem">No wrapping papers found.</p>';

        body.querySelectorAll('[data-edit-wrap]').forEach(btn => {
          btn.addEventListener('click', () => {
            const w = wrappings.find(x => x.id === Number(btn.dataset.editWrap));
            const section = $('editFormSection');
            section.innerHTML = '<section class="panel" style="margin-top:1rem"><h3>Editing: ' + w.name + '</h3></section>';
            renderWrappingForm(section.querySelector('section'), w);
            section.scrollIntoView({ behavior: 'smooth' });
          });
        });

        body.querySelectorAll('[data-del-wrap]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const ok = await showConfirm(`Delete wrapping paper "<strong>${btn.dataset.delWrapName}</strong>"? This cannot be undone.`, {
              title: 'Delete Wrapping?', confirmLabel: 'Delete', danger: true,
            });
            if (!ok) return;
            try {
              await apiRequest('/api/staff/bouquet/wrappings/' + btn.dataset.delWrap + '/', 'DELETE', null, true);
              showToast('Wrapping paper deleted.', 'success');
              loadProducts();
            } catch (e) {
              showToast(e?.payload?.detail || e.message || 'Failed to delete wrapping.', 'error');
            }
          });
        });
      } catch (e) {
        $('editTableWrap').innerHTML = `<p class="text-red" style="padding:1rem">Failed to load wrapping papers.</p>`;
      }
      return;
    }

    // ── Regular products branch ─────────────────────────────────────────────
    $('editTableWrap').innerHTML = `<div class="hp-grid ep-grid" id="productsBody"></div>`;
    const body = $('productsBody');
    try {
      const all = await apiRequest('/api/staff/products/', 'GET', null, true);
      let filtered = all;
      if (editCat !== 'all') filtered = filtered.filter(p => p.category === editCat);
      if (editSearch) filtered = filtered.filter(p => p.name.toLowerCase().includes(editSearch));

      body.innerHTML = filtered.length
        ? filtered.map(p => `
          <div class="hp-card ep-card${p.is_active ? '' : ' ep-inactive'}" data-id="${p.id}">
            <img src="${p.primary_image || ''}" alt="${p.name}" class="hp-img" />
            <div class="hp-info">
              <p class="hp-name" title="${p.name}">${p.name}</p>
              <p class="hp-cat">${p.category} · NPR ${Number(p.price).toLocaleString()}</p>
              ${!p.is_active ? '<p class="ep-inactive-tag">Inactive</p>' : ''}
            </div>
            <div class="ep-actions">
              <button class="ep-edit-btn" data-edit="${p.id}">Edit</button>
              <button class="ep-del-btn"  data-del="${p.id}" data-del-name="${p.name}">Delete</button>
            </div>
          </div>`).join('')
        : '<p class="muted" style="padding:1rem">No products found.</p>';

      body.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const section = $('editFormSection');
          section.innerHTML = '<p style="margin-top:1rem" class="muted">Loading product…</p>';
          const full = await apiRequest('/api/staff/products/' + btn.dataset.edit + '/', 'GET', null, true);
          section.innerHTML = '<section class="panel" style="margin-top:1rem"><h3>Editing: ' + full.name + '</h3></section>';
          await renderProductForm(section.querySelector('section'), full.category, full);
          section.scrollIntoView({ behavior: 'smooth' });
        });
      });

      body.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await showConfirm(`Delete "<strong>${btn.dataset.delName}</strong>"? All images and stock data will be permanently removed.`, {
            title: 'Delete Product?', confirmLabel: 'Delete', danger: true,
          });
          if (!ok) return;
          try {
            await apiRequest('/api/staff/products/' + btn.dataset.del + '/', 'DELETE', null, true);
            showToast(`"${btn.dataset.delName}" deleted.`, 'success');
            $('editFormSection').innerHTML = '';
            loadProducts();
          } catch (e) {
            showToast(e?.payload?.detail || e.message || 'Failed to delete product.', 'error');
          }
        });
      });
    } catch (e) {
      body.innerHTML = `<p class="text-red" style="padding:1rem">Failed to load products.</p>`;
    }
  };

  $('searchInput').addEventListener('input', loadProducts);
  $('catFilter').addEventListener('change', loadProducts);
  await loadProducts();
};

// ── STOCK ─────────────────────────────────────────────────────────────────────

let stockFilter = 'none';
let stockCat    = 'all';
let stockSearch = '';

const stockView = async () => {
  view.innerHTML = `
    <section class="panel">
      <h3>Stock Management</h3>

      <div class="filter-row" style="margin-top:0.7rem">
        <button class="filter-chip ${stockCat === 'all'      ? 'active' : ''}" data-sc="all">All</button>
        <button class="filter-chip ${stockCat === 'kits'     ? 'active' : ''}" data-sc="kits">Kits</button>
        <button class="filter-chip ${stockCat === 'crochet'  ? 'active' : ''}" data-sc="crochet">Crochet</button>
        <button class="filter-chip ${stockCat === 'clothing' ? 'active' : ''}" data-sc="clothing">Clothing</button>
        <button class="filter-chip ${stockCat === 'wrapping' ? 'active' : ''}" data-sc="wrapping">Wrapping Papers</button>
      </div>

      <div class="filter-row" id="stockLevelFilters"
        style="margin-top:0.5rem${stockCat === 'wrapping' ? ';display:none' : ''}">
        <button class="filter-chip filter-chip-sm ${stockFilter === 'low'  ? 'active' : ''}" data-sf="low">Low (&lt;3)</button>
        <button class="filter-chip filter-chip-sm ${stockFilter === 'high' ? 'active' : ''}" data-sf="high">High (&gt;10)</button>
        <button class="filter-chip filter-chip-sm ${stockFilter === 'out'  ? 'active' : ''}" data-sf="out">Out of Stock</button>
      </div>

      <div style="margin-top:0.7rem">
        <input id="stockSearchInput" class="field-input" type="search"
          placeholder="Search by product name…"
          value="${stockSearch}"
          style="max-width:320px;width:100%" />
      </div>

      <div id="stockSummary" style="margin-top:0.8rem"></div>
      <div id="stockWrap" class="table-wrap" style="margin-top:0.6rem"><p>Loading…</p></div>
    </section>`;

  // Category chips
  view.querySelectorAll('[data-sc]').forEach(b => b.addEventListener('click', () => {
    stockCat = b.dataset.sc;
    view.querySelectorAll('[data-sc]').forEach(x => x.classList.toggle('active', x === b));
    // Hide/show stock-level filters for wrappings (they have no stock qty)
    const levelRow = $('stockLevelFilters');
    if (levelRow) levelRow.style.display = stockCat === 'wrapping' ? 'none' : '';
    loadStock();
  }));

  // Stock-level chips (toggle off on second click)
  view.querySelectorAll('[data-sf]').forEach(b => b.addEventListener('click', () => {
    const picked = b.dataset.sf;
    stockFilter = stockFilter === picked ? 'none' : picked;
    view.querySelectorAll('[data-sf]').forEach(x => x.classList.toggle('active', x.dataset.sf === stockFilter));
    loadStock();
  }));

  // Search input
  let stockSearchTimer;
  $('stockSearchInput').addEventListener('input', () => {
    clearTimeout(stockSearchTimer);
    stockSearchTimer = setTimeout(loadStock, 250);
  });

  let allStockProducts = [];

  const loadStock = async () => {
    stockSearch = ($('stockSearchInput')?.value || '').toLowerCase().trim();
    const wrap = $('stockWrap');
    try {
      // ── Wrapping Papers branch ────────────────────────────────────────────
      if (stockCat === 'wrapping') {
        let wrappings = await apiRequest('/api/staff/bouquet/wrappings/', 'GET', null, true);
        if (stockSearch) wrappings = wrappings.filter(w => w.name.toLowerCase().includes(stockSearch));
        wrap.innerHTML = wrappings.length ? `
          <table>
            <thead><tr><th>Name</th><th>Price</th><th>Status</th></tr></thead>
            <tbody>
              ${wrappings.map(w => `
                <tr>
                  <td>${w.name}</td>
                  <td>${currency(w.price)}</td>
                  <td class="${w.is_active ? 'text-green' : 'text-red'}">${w.is_active ? 'Active' : 'Inactive'}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<p class="muted">No wrapping papers found.</p>';
        return;
      }

      // ── Regular products branch ───────────────────────────────────────────
      if (!allStockProducts.length) {
        allStockProducts = await apiRequest('/api/staff/products/stock/', 'GET', null, true);
      }

      let products = allStockProducts;

      if (stockCat !== 'all') {
        products = products.filter(p => p.category === stockCat);
      }
      if (stockSearch) {
        products = products.filter(p => p.name.toLowerCase().includes(stockSearch));
      }

      // Flatten to one row per size variant
      let rows = [];
      products.forEach(p => {
        (p.sizes || []).forEach(s => {
          rows.push({ name: p.name, category: p.category, size: s.size, quantity: s.quantity });
        });
        // Product with no size entries at all
        if (!(p.sizes || []).length) {
          rows.push({ name: p.name, category: p.category, size: '', quantity: p.total_stock || 0 });
        }
      });

      // ── Category total (before level filter so it's always the true total) ──
      const categoryTotal = rows.reduce((n, r) => n + r.quantity, 0);
      const catLabel = stockCat === 'all' ? 'All Categories' :
                       stockCat === 'kits' ? 'Kits' :
                       stockCat === 'crochet' ? 'Crochet' :
                       stockCat === 'clothing' ? 'Clothing' : stockCat;
      const summaryEl = $('stockSummary');
      if (summaryEl) {
        summaryEl.innerHTML = `<div class="stock-summary-bar">
          <span class="stock-summary-label">${catLabel}</span>
          <span class="stock-summary-total">${categoryTotal} units total</span>
        </div>`;
      }

      // Apply stock-level filter per row
      if (stockFilter === 'low') {
        rows = rows.filter(r => r.quantity > 0 && r.quantity <= 3);
      } else if (stockFilter === 'high') {
        rows = rows.filter(r => r.quantity > 10);
      } else if (stockFilter === 'out') {
        rows = rows.filter(r => r.quantity === 0);
      }

      const rowsHTML = rows.map(r => {
        const sizeLabel = (r.size === 'Free Size' || r.size === 'No Size' || !r.size) ? '—' : r.size;
        return '<tr>'
          + '<td>' + r.name + '</td>'
          + '<td>' + r.category + '</td>'
          + '<td>' + sizeLabel + '</td>'
          + '<td style="font-weight:700;color:' + stockColor(r.quantity) + '">' + r.quantity + '</td>'
          + '</tr>';
      }).join('');

      wrap.innerHTML = rows.length
        ? '<table><thead><tr><th>Product</th><th>Category</th><th>Size</th><th>Stock</th></tr></thead><tbody>' + rowsHTML + '</tbody></table>'
        : '<p class="muted">No products match this filter.</p>';
    } catch (e) {
      wrap.innerHTML = `<p class="text-red">${e.message}</p>`;
    }
  };

  await loadStock();
};

// ── ORDERS ────────────────────────────────────────────────────────────────────

let orderTab         = 'all';
let orderSearch      = '';
let orderSearchField = 'name';   // 'name' | 'phone' | 'code'

const ordersView = async () => {
  const allStatuses = ['all', 'pending', 'confirmed', 'sent_for_delivery', 'completed', 'cancelled'];

  view.innerHTML = `
    <section class="panel">
      <h3>Orders</h3>

      <div class="filter-row" style="margin-top:0.7rem;flex-wrap:wrap">
        ${allStatuses.map(s => `
          <button class="filter-chip ${orderTab === s ? 'active' : ''}" data-ot="${s}"
            style="${s !== 'all' ? `--chip-active-color:${STATUS_COLORS[s]}` : ''}">
            ${s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>`).join('')}
      </div>

      <div style="display:flex;gap:0.5rem;margin-top:0.75rem;align-items:center;flex-wrap:wrap">
        <select id="orderSearchField" class="field-input"
          style="width:auto;min-width:155px;flex-shrink:0">
          <option value="name">Customer Name</option>
          <option value="phone">Phone Number</option>
          <option value="code">Order Code</option>
        </select>
        <input id="orderSearchInput" class="field-input" type="search"
          placeholder="Search orders…"
          style="flex:1;max-width:340px" />
      </div>

      <div id="ordersWrap" class="table-wrap" style="margin-top:0.8rem"><p>Loading…</p></div>
    </section>`;

  // Restore persisted search state across re-renders
  $('orderSearchField').value = orderSearchField;
  $('orderSearchInput').value = orderSearch;

  // Status filter tabs
  view.querySelectorAll('[data-ot]').forEach(b => b.addEventListener('click', () => {
    orderTab = b.dataset.ot;
    view.querySelectorAll('[data-ot]').forEach(x => x.classList.toggle('active', x === b));
    loadOrders();
  }));

  // Search field dropdown
  $('orderSearchField').addEventListener('change', e => {
    orderSearchField = e.target.value;
    renderOrders();
  });

  // Search text input — debounced 200 ms
  let orderSearchTimer;
  $('orderSearchInput').addEventListener('input', e => {
    orderSearch = e.target.value;
    clearTimeout(orderSearchTimer);
    orderSearchTimer = setTimeout(renderOrders, 200);
  });

  let allOrders = [];

  // Render (filter already-loaded orders)
  const renderOrders = () => {
    const wrap = $('ordersWrap');
    const q = orderSearch.trim().toLowerCase();
    const filtered = q
      ? allOrders.filter(o => {
          if (orderSearchField === 'name')  return (o.customer_name  || '').toLowerCase().includes(q);
          if (orderSearchField === 'phone') return (o.customer_phone || '').toLowerCase().includes(q);
          if (orderSearchField === 'code')  return (o.order_code     || '').toLowerCase().includes(q);
          return true;
        })
      : allOrders;

    wrap.innerHTML = filtered.length ? `
      <table>
        <thead><tr><th>#</th><th>Customer</th><th>Phone</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${filtered.map(o => `
            <tr class="clickable-row" data-order-id="${o.id}">
              <td>#${o.id}</td>
              <td>${o.customer_name || o.customer}</td>
              <td>${o.customer_phone}</td>
              <td>${new Date(o.created_at).toLocaleString()}</td>
              <td>${currency(o.total_amount)}</td>
              <td><span class="status-badge" style="background:${STATUS_COLORS[o.status]}20;color:${STATUS_COLORS[o.status]};border-color:${STATUS_COLORS[o.status]}40">${STATUS_LABELS[o.status]}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : `<p class="muted">${q ? 'No orders match your search.' : 'No orders found.'}</p>`;

    wrap.querySelectorAll('.clickable-row').forEach(row =>
      row.addEventListener('click', () => openOrderModal(Number(row.dataset.orderId)))
    );
  };

  // Fetch orders for current tab, then render
  const loadOrders = async () => {
    const wrap = $('ordersWrap');
    wrap.innerHTML = '<p>Loading…</p>';
    const url = orderTab === 'all' ? '/api/staff/orders/' : `/api/staff/orders/?status=${orderTab}`;
    allOrders = await apiRequest(url, 'GET', null, true);
    renderOrders();
  };

  await loadOrders();
};

const openOrderModal = async id => {
  const order = await apiRequest(`/api/staff/orders/${id}/`, 'GET', null, true);
  const transitions = TRANSITIONS[order.status] || [];
  const revertTo    = REVERT_STATUS[order.status] || null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>Order #${order.id}</h3>
        <button id="closeModal" class="btn-xs danger-xs">✕ Close</button>
      </div>
      <div class="modal-body">
        <div class="info-grid">
          <div><span class="muted">Customer</span><p>${order.customer_name || order.customer}</p></div>
          <div><span class="muted">Email</span><p>${order.customer_email || '—'}</p></div>
          <div><span class="muted">Phone</span><p>${order.customer_phone}</p></div>
          <div><span class="muted">Date</span><p>${new Date(order.created_at).toLocaleString()}</p></div>
          <div><span class="muted">Status</span>
            <p><span class="status-badge" style="background:${STATUS_COLORS[order.status]}20;color:${STATUS_COLORS[order.status]};border-color:${STATUS_COLORS[order.status]}40">
              ${STATUS_LABELS[order.status]}
            </span></p>
          </div>
          <div><span class="muted">Total</span><p style="font-weight:700;font-size:1.1rem">${currency(order.total_amount)}</p></div>
          ${order.confirmed_by_name  ? `<div><span class="muted">Confirmed by</span><p>${order.confirmed_by_name}</p></div>`  : ''}
          ${order.dispatched_by_name ? `<div><span class="muted">Dispatched by</span><p>${order.dispatched_by_name}</p></div>` : ''}
          ${order.order_code         ? `<div><span class="muted">Order Code</span><p style="font-family:monospace">${order.order_code}</p></div>` : ''}
          ${order.completed_by_name  ? `<div><span class="muted">Completed by</span><p>${order.completed_by_name}</p></div>`  : ''}
          ${order.cancelled_by_name  ? `<div><span class="muted">Cancelled by</span><p style="color:#ff3d3d">${order.cancelled_by_name}</p></div>` : (order.status === 'cancelled' ? `<div><span class="muted">Cancelled by</span><p style="color:#ff3d3d">Customer</p></div>` : '')}
          ${order.cancellation_reason ? `<div style="grid-column:1/-1"><span class="muted">Cancellation Reason</span><p style="color:#ff9e9e">${order.cancellation_reason}</p></div>` : ''}
          ${order.delivery_location_name ? `<div><span class="muted">Delivery Area</span><p>${order.delivery_location_name}${order.delivery_location_district ? ', ' + order.delivery_location_district : ''}</p></div>` : ''}
          ${order.delivery_charge ? `<div><span class="muted">Delivery Charge</span><p>Rs.${order.delivery_charge}</p></div>` : ''}
          ${order.delivery_charge ? `<div style="grid-column:1/-1;border-top:1px solid #222;padding-top:0.5rem;margin-top:0.2rem"><span class="muted">Grand Total (collect from customer)</span><p style="font-weight:700;font-size:1.15rem;color:var(--cyan)">${currency(Number(order.total_amount) + Number(order.delivery_charge))}</p></div>` : ''}
          ${order.delivery_notes ? `<div style="grid-column:1/-1"><span class="muted">Delivery Notes</span><p>${order.delivery_notes}</p></div>` : (order.delivery_location_name ? `<div style="grid-column:1/-1"><span class="muted">Delivery Notes</span><p class="muted">—</p></div>` : '')}
        </div>

        <h4 style="margin:1rem 0 0.5rem">Items</h4>
        <table>
          <thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Price</th><th>Print</th><th>Line Total</th></tr></thead>
          <tbody>
            ${order.items.map(i => {
              const printParts = [
                i.print_name || '',
                (i.print_number !== null && i.print_number !== undefined) ? '#' + i.print_number : '',
              ].filter(Boolean);
              const printCell = printParts.length
                ? `<span class="print-info-badge">✏️ ${printParts.join(' · ')}</span>`
                : '—';
              return `
              <tr>
                <td>${i.product_name}${i.is_custom_bouquet_item ? ' <span class="mini-badge">Custom</span>' : ''}</td>
                <td>${displaySize(i.size)}</td>
                <td>${i.quantity}</td>
                <td>${currency(i.price_at_purchase)}</td>
                <td>${printCell}</td>
                <td>${currency(i.price_at_purchase * i.quantity)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>

        ${(transitions.length || revertTo) ? `
          <div class="modal-actions">
            ${transitions.length ? `
            <p class="muted" style="margin-bottom:0.6rem">Update status:</p>
            <div class="modal-actions-row">
              ${transitions.map(t => `
                <button class="action-btn" data-next="${t}"
                  style="border-color:${STATUS_COLORS[t]};color:${STATUS_COLORS[t]}">
                  ${TRANSITION_LABELS[t]}
                </button>`).join('')}
            </div>` : ''}
            ${revertTo ? `
            <div class="modal-revert-row">
              <button class="action-btn revert-status-btn" data-revert="${revertTo}">
                ↩ Revert to ${STATUS_LABELS[revertTo]}
              </button>
            </div>` : ''}
          </div>` : `
          <p class="muted" style="margin-top:1rem">No further status changes available.</p>`}
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector('#closeModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const confirmMessages = {
    confirmed: 'Confirm this order?\n\nStock will be deducted automatically.',
    sent_for_delivery: 'Mark as Sent for Delivery?',
    completed: 'Mark this order as Completed?',
    cancelled: 'Cancel this order? This cannot be undone.',
  };

  overlay.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.next;

      // ── Send for Delivery: require order code inline ──────────────────────
      if (next === 'sent_for_delivery') {
        const actionsDiv = overlay.querySelector('.modal-actions');
        const originalHTML = actionsDiv.innerHTML;

        actionsDiv.innerHTML = `
          <p class="muted" style="margin-bottom:0.5rem;font-size:0.85rem">Enter order / delivery code to proceed:</p>
          <input id="dispatchCode" class="field-input" placeholder="Order code (required)" style="margin-bottom:0.7rem" />
          <p id="dispatchErr" class="error" style="margin-bottom:0.5rem"></p>
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
            <button id="confirmDispatch" class="action-btn"
              style="border-color:${STATUS_COLORS['sent_for_delivery']};color:${STATUS_COLORS['sent_for_delivery']}">
              Confirm & Send for Delivery
            </button>
            <button id="cancelDispatch" class="btn-ghost">Cancel</button>
          </div>`;

        overlay.querySelector('#cancelDispatch').addEventListener('click', () => {
          actionsDiv.innerHTML = originalHTML;
          // re-wire the restored buttons
          actionsDiv.querySelectorAll('[data-next]').forEach(b => b.click && b.dispatchEvent(new Event('_rewire')));
          overlay.remove();
          openOrderModal(order.id);
        });

        overlay.querySelector('#confirmDispatch').addEventListener('click', async () => {
          const orderCode = overlay.querySelector('#dispatchCode').value.trim();
          if (!orderCode) {
            overlay.querySelector('#dispatchErr').textContent = 'Order code is required.';
            return;
          }
          const confirmBtn = overlay.querySelector('#confirmDispatch');
          confirmBtn.disabled = true; confirmBtn.textContent = 'Updating…';
          try {
            await apiRequest(`/api/staff/orders/${order.id}/status/`, 'PUT',
              { status: 'sent_for_delivery', order_code: orderCode }, true);
            overlay.remove();
            ordersView();
          } catch (e) {
            showToast(e?.payload?.detail || e?.payload?.order_code?.[0] || e.message || 'Failed to update status.', 'error');
            confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm & Send for Delivery';
          }
        });

        setTimeout(() => overlay.querySelector('#dispatchCode')?.focus(), 50);
        return;
      }

      // ── Cancel Order: require a mandatory reason inline ──────────────────
      if (next === 'cancelled') {
        const actionsDiv = overlay.querySelector('.modal-actions');
        const originalHTML = actionsDiv.innerHTML;

        actionsDiv.innerHTML = `
          <p class="muted" style="margin-bottom:0.5rem;font-size:0.85rem">Reason for cancellation <span style="color:#ff3d3d">*</span></p>
          <textarea id="cancelReason" class="field-input" rows="3"
            placeholder="Enter reason (required)…"
            style="width:100%;margin-bottom:0.5rem;resize:vertical"></textarea>
          <p id="cancelErr" class="error" style="margin-bottom:0.5rem;display:none">Please enter a reason.</p>
          <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
            <button id="confirmCancel" class="action-btn"
              style="border-color:${STATUS_COLORS['cancelled']};color:${STATUS_COLORS['cancelled']}">
              Confirm Cancellation
            </button>
            <button id="backCancel" class="btn-ghost">Back</button>
          </div>`;

        overlay.querySelector('#backCancel').addEventListener('click', () => {
          actionsDiv.innerHTML = originalHTML;
          // Re-wire all buttons after restoring original HTML
          overlay.querySelectorAll('[data-next]').forEach(b => b.click === btn.click ? null : null);
          overlay.remove();
          openOrderModal(order);
        });

        overlay.querySelector('#confirmCancel').addEventListener('click', async () => {
          const reason = overlay.querySelector('#cancelReason').value.trim();
          const errEl  = overlay.querySelector('#cancelErr');
          if (!reason) { errEl.style.display = ''; return; }
          errEl.style.display = 'none';
          const confirmBtn = overlay.querySelector('#confirmCancel');
          confirmBtn.disabled = true; confirmBtn.textContent = 'Cancelling…';
          try {
            await apiRequest(`/api/staff/orders/${order.id}/status/`, 'PUT',
              { status: 'cancelled', cancellation_reason: reason }, true);
            overlay.remove();
            ordersView();
          } catch (e) {
            showToast(e?.payload?.cancellation_reason?.[0] || e?.payload?.detail || e.message || 'Failed to cancel.', 'error');
            confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Cancellation';
          }
        });
        return;
      }

      // ── All other transitions ─────────────────────────────────────────────
      if (!await showConfirm(confirmMessages[next] || `Change status to "${STATUS_LABELS[next]}"?`, {
        title: TRANSITION_LABELS[next] || 'Update Status',
        confirmLabel: TRANSITION_LABELS[next] || 'Confirm',
        accentColor: STATUS_COLORS[next],
      })) return;
      btn.disabled = true;
      btn.textContent = 'Updating…';
      try {
        await apiRequest(`/api/staff/orders/${order.id}/status/`, 'PUT', { status: next }, true);
        overlay.remove();
        ordersView();
      } catch (e) {
        showToast(e?.payload?.detail || e.message || 'Failed to update status.', 'error');
        btn.disabled = false;
        btn.textContent = TRANSITION_LABELS[next];
      }
    });
  });

  // ── Revert status ────────────────────────────────────────────────────────
  overlay.querySelectorAll('[data-revert]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const prev = btn.dataset.revert;
      const stockNote = prev === 'pending' ? '\n\nStock will be restored to inventory.' : '';
      const confirmed = await showConfirm(
        `Revert this order back to "${STATUS_LABELS[prev]}"?${stockNote}`,
        { title: 'Revert Status', confirmLabel: `↩ Revert to ${STATUS_LABELS[prev]}`, accentColor: '#888' }
      );
      if (!confirmed) return;
      btn.disabled = true;
      btn.textContent = 'Reverting…';
      try {
        await apiRequest(`/api/staff/orders/${order.id}/status/`, 'PUT', { status: prev }, true);
        overlay.remove();
        ordersView();
      } catch (e) {
        showToast(e?.payload?.detail || e.message || 'Failed to revert status.', 'error');
        btn.disabled = false;
        btn.textContent = `↩ Revert to ${STATUS_LABELS[prev]}`;
      }
    });
  });
};

// ── DELIVERY LOCATIONS ────────────────────────────────────────────────────────

const deliveryView = async () => {
  view.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <h3>Delivery Locations</h3>
        <button id="addDeliveryBtn" class="btn">+ Add Location</button>
      </div>
      <div class="filter-row" style="margin-top:0.7rem">
        <input id="dlSearch" class="field-input" placeholder="Search by name or district…" style="flex:1;max-width:340px" />
        <select id="dlStatusFilter" class="field-input" style="width:150px">
          <option value="all">All</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>
      <div id="dlWrap" class="table-wrap" style="margin-top:0.8rem"><p>Loading…</p></div>
    </section>
    <div id="dlFormSection"></div>`;

  let allLocations = [];

  const renderLocations = () => {
    const q      = ($('dlSearch')?.value || '').toLowerCase().trim();
    const status = $('dlStatusFilter')?.value || 'all';
    let filtered = allLocations;
    if (q) filtered = filtered.filter(l =>
      l.name.toLowerCase().includes(q) || (l.district || '').toLowerCase().includes(q) || (l.coverage || '').toLowerCase().includes(q)
    );
    if (status === 'active')   filtered = filtered.filter(l => l.is_active);
    if (status === 'inactive') filtered = filtered.filter(l => !l.is_active);

    const wrap = $('dlWrap');
    wrap.innerHTML = filtered.length ? `
      <table>
        <thead><tr><th>Name</th><th>District</th><th>Coverage</th><th>Charge</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(l => `
            <tr>
              <td>${l.name}</td>
              <td>${l.district || '—'}</td>
              <td class="sale-desc-cell">${l.coverage || '—'}</td>
              <td>Rs.${l.charge}</td>
              <td class="${l.is_active ? 'text-green' : 'text-red'}">${l.is_active ? 'Active' : 'Inactive'}</td>
              <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
                <button class="btn-xs" data-edit-dl="${l.id}">Edit</button>
                <button class="btn-xs ${l.is_active ? 'danger-xs' : ''}" data-toggle-dl="${l.id}">
                  ${l.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="muted">No delivery locations match this filter.</p>';

    wrap.querySelectorAll('[data-toggle-dl]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const loc = allLocations.find(x => x.id === Number(btn.dataset.toggleDl));
        const action = loc?.is_active ? 'Deactivate' : 'Activate';
        if (!await showConfirm(`${action} "${loc?.name}"?`, { title: action + ' Location', confirmLabel: action, danger: loc?.is_active })) return;
        try {
          const updated = await apiRequest(`/api/staff/delivery/${btn.dataset.toggleDl}/toggle/`, 'PUT', null, true);
          const idx = allLocations.findIndex(x => x.id === updated.id);
          if (idx >= 0) allLocations[idx] = updated;
          renderLocations();
          showToast(`"${updated.name}" ${updated.is_active ? 'activated' : 'deactivated'}.`, 'info');
        } catch (e) {
          showToast(e?.payload?.detail || e.message || 'Failed to update.', 'error');
        }
      });
    });

    wrap.querySelectorAll('[data-edit-dl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const loc = allLocations.find(x => x.id === Number(btn.dataset.editDl));
        if (loc) renderDeliveryForm($('dlFormSection'), loc, allLocations, renderLocations);
      });
    });
  };

  const loadLocations = async () => {
    try {
      allLocations = await apiRequest('/api/staff/delivery/', 'GET', null, true);
      renderLocations();
    } catch (e) {
      $('dlWrap').innerHTML = `<p class="text-red">${e.message}</p>`;
    }
  };

  $('addDeliveryBtn').addEventListener('click', () =>
    renderDeliveryForm($('dlFormSection'), null, allLocations, loadLocations)
  );
  $('dlSearch').addEventListener('input', renderLocations);
  $('dlStatusFilter').addEventListener('change', renderLocations);

  await loadLocations();
};

const renderDeliveryForm = (container, existing, allLocations, onSave) => {
  container.innerHTML = `
    <section class="panel" style="margin-top:1rem">
      <h3>${existing ? 'Edit: ' + existing.name : 'Add Delivery Location'}</h3>
      <div class="form-grid2" style="margin-top:1rem">
        <div class="form-col">
          <p class="field-label">Name *</p>
          <input id="dlName" class="field-input" value="${existing?.name || ''}" placeholder="e.g. Thamel, Kathmandu" />
          <p class="field-label" style="margin-top:0.8rem">District</p>
          <input id="dlDistrict" class="field-input" value="${existing?.district || ''}" placeholder="e.g. Kathmandu" />
          <p class="field-label" style="margin-top:0.8rem">Delivery Charge (Rs.) *</p>
          <input id="dlCharge" class="field-input" type="number" min="0" value="${existing?.charge ?? ''}" placeholder="e.g. 100" />
          <label class="label-check" style="margin-top:0.8rem">
            <input type="checkbox" id="dlActive" ${!existing || existing.is_active ? 'checked' : ''} />
            Active (visible to customers)
          </label>
        </div>
        <div class="form-col">
          <p class="field-label">Coverage / Landmarks <span class="muted" style="font-weight:400;font-size:0.78rem">(optional — helps search)</span></p>
          <textarea id="dlCoverage" class="field-input field-textarea" rows="5"
            placeholder="Nearby areas or landmarks that map to this location…">${existing?.coverage || ''}</textarea>
        </div>
      </div>
      <p id="dlFormErr" class="error" style="margin-top:0.8rem"></p>
      <div style="display:flex;gap:0.7rem;margin-top:1rem">
        <button id="dlSaveBtn" class="btn">${existing ? 'Save Changes' : 'Add Location'}</button>
        <button id="dlCancelBtn" class="btn-ghost">Cancel</button>
      </div>
    </section>`;

  container.scrollIntoView({ behavior: 'smooth' });

  $('dlCancelBtn').addEventListener('click', () => { container.innerHTML = ''; });

  $('dlSaveBtn').addEventListener('click', async () => {
    const errEl   = $('dlFormErr');
    errEl.textContent = '';
    const name    = $('dlName').value.trim();
    const district = $('dlDistrict').value.trim();
    const charge  = parseInt($('dlCharge').value);
    const coverage = $('dlCoverage').value.trim();
    const is_active = $('dlActive').checked;

    if (!name)           { errEl.textContent = 'Name is required.'; return; }
    if (isNaN(charge) || charge < 0) { errEl.textContent = 'Charge must be a non-negative number.'; return; }

    const btn = $('dlSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const payload = { name, district, charge, coverage, is_active };
      let saved;
      if (existing) {
        saved = await apiRequest(`/api/staff/delivery/${existing.id}/`, 'PUT', payload, true);
      } else {
        saved = await apiRequest('/api/staff/delivery/', 'POST', payload, true);
      }
      showToast(existing ? 'Location updated.' : 'Location added.', 'success');
      container.innerHTML = '';
      await onSave();
    } catch (e) {
      errEl.textContent = e?.payload ? Object.values(e.payload).flat().join(' ') : e.message || 'Failed to save.';
    } finally {
      btn.disabled = false; btn.textContent = existing ? 'Save Changes' : 'Add Location';
    }
  });
};

// ── ANALYTICS chart instances (used inside overviewView) ──────────────────────
let _qtyChart = null;
let _revChart = null;
let _statusChart = null;

// ── USERS (admin only) ────────────────────────────────────────────────────────

let userTab = 'customers';

const usersView = async () => {
  view.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <h3>User Management</h3>
        <button id="openCreateStaff" class="btn">+ Create Staff</button>
      </div>
      <div class="filter-row" style="margin-top:0.7rem">
        <button class="filter-chip ${userTab === 'customers' ? 'active' : ''}" data-ut="customers">Customers</button>
        <button class="filter-chip ${userTab === 'staff' ? 'active' : ''}" data-ut="staff">Staff & Admin</button>
      </div>
      <div id="usersWrap" class="table-wrap" style="margin-top:0.8rem"><p>Loading…</p></div>
    </section>

    <div id="createStaffPanel" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-head">
          <h3>Create Staff Account</h3>
          <button id="closeCreateStaff" class="btn-xs danger-xs">✕</button>
        </div>
        <div class="modal-body">
          <input id="csName" class="field-input" placeholder="Full name" style="margin-bottom:0.5rem" />
          <input id="csEmail" class="field-input" type="email" placeholder="Email address" style="margin-bottom:0.5rem" />
          <input id="csPassword" class="field-input" type="password" placeholder="Password (min 8 chars)" style="margin-bottom:0.8rem" />
          <button id="submitCreateStaff" class="btn">Create Account</button>
          <p id="csErr" class="error" style="margin-top:0.5rem"></p>
        </div>
      </div>
    </div>`;

  const createPanel = $('createStaffPanel');
  $('openCreateStaff').addEventListener('click', () => createPanel.classList.remove('hidden'));
  $('closeCreateStaff').addEventListener('click', () => createPanel.classList.add('hidden'));
  createPanel.addEventListener('click', e => { if (e.target === createPanel) createPanel.classList.add('hidden'); });

  $('submitCreateStaff').addEventListener('click', async () => {
    const name = $('csName').value.trim();
    const email = $('csEmail').value.trim();
    const password = $('csPassword').value;
    $('csErr').textContent = '';
    if (!name || !email || !password) { $('csErr').textContent = 'All fields required.'; return; }
    try {
      await apiRequest('/api/auth/create-staff/', 'POST', { name, email, password }, true);
      createPanel.classList.add('hidden');
      ['csName', 'csEmail', 'csPassword'].forEach(id => $(id).value = '');
      await loadUsers();
    } catch (e) {
      $('csErr').textContent = e?.payload ? Object.values(e.payload).flat().join(' ') : e.message;
    }
  });

  view.querySelectorAll('[data-ut]').forEach(b => b.addEventListener('click', () => {
    userTab = b.dataset.ut;
    view.querySelectorAll('[data-ut]').forEach(x => x.classList.toggle('active', x === b));
    loadUsers();
  }));

  let allUsers = [];

  const loadUsers = async () => {
    const wrap = $('usersWrap');
    wrap.innerHTML = '<p>Loading…</p>';
    allUsers = await apiRequest('/api/auth/users/', 'GET', null, true);
    const filtered = userTab === 'customers'
      ? allUsers.filter(u => u.role === 'customer')
      : allUsers.filter(u => u.role === 'staff' || u.role === 'admin');

    wrap.innerHTML = filtered.length ? `
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(u => `
            <tr>
              <td>${u.name}</td>
              <td>${u.email}</td>
              <td><span class="mini-badge">${u.role}</span></td>
              <td>${u.is_verified ? '✓' : '—'}</td>
              <td>${new Date(u.date_joined).toLocaleDateString()}</td>
              <td>${u.is_active ? '<span class="text-green">Active</span>' : '<span class="text-red">Inactive</span>'}</td>
              <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
                <button class="btn-xs" data-edit-user="${u.id}">Edit</button>
                ${u.is_active
                  ? `<button class="btn-xs danger-xs" data-deactivate="${u.id}">Deactivate</button>`
                  : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="muted">No users in this category.</p>';

    wrap.querySelectorAll('[data-deactivate]').forEach(b => b.addEventListener('click', async () => {
      if (!await showConfirm('This user will no longer be able to log in.', { title: 'Deactivate Account', confirmLabel: 'Deactivate', danger: true })) return;
      try {
        await apiRequest(`/api/auth/users/${b.dataset.deactivate}/`, 'DELETE', null, true);
        showToast('Account deactivated.', 'info');
        await loadUsers();
      } catch (e) { showToast(e.message || 'Failed to deactivate account.', 'error'); }
    }));

    wrap.querySelectorAll('[data-edit-user]').forEach(b => b.addEventListener('click', () => {
      const u = allUsers.find(x => x.id === Number(b.dataset.editUser));
      if (u) openEditUser(u, loadUsers);
    }));
  };

  await loadUsers();
};

const openEditUser = (u, onSave) => {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h3>Edit: ${u.name}</h3>
        <button id="closeEdit" class="btn-xs danger-xs">✕</button>
      </div>
      <div class="modal-body">
        <input id="euName" class="field-input" value="${u.name}" placeholder="Full name" style="margin-bottom:0.5rem" />
        <input id="euEmail" class="field-input" type="email" value="${u.email}" placeholder="Email" style="margin-bottom:0.5rem" />
        <select id="euRole" class="field-input" style="margin-bottom:0.5rem">
          <option value="customer" ${u.role === 'customer' ? 'selected' : ''}>Customer</option>
          <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff</option>
        </select>
        <input id="euPassword" class="field-input" type="password" placeholder="New password (leave blank to keep)" style="margin-bottom:0.8rem" />
        <button id="saveUser" class="btn">Save Changes</button>
        <p id="euErr" class="error" style="margin-top:0.5rem"></p>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('#closeEdit').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#saveUser').addEventListener('click', async () => {
    const payload = {
      name: overlay.querySelector('#euName').value.trim(),
      email: overlay.querySelector('#euEmail').value.trim(),
      role: overlay.querySelector('#euRole').value,
    };
    const pw = overlay.querySelector('#euPassword').value;
    if (pw) payload.password = pw;
    try {
      await apiRequest(`/api/auth/users/${u.id}/`, 'PUT', payload, true);
      overlay.remove();
      await onSave();
    } catch (e) {
      overlay.querySelector('#euErr').textContent = e?.payload
        ? Object.values(e.payload).flat().join(' ')
        : e.message;
    }
  });
};

// ── HOT PICKS ────────────────────────────────────────────────────────────────

const hotPicksView = async () => {
  view.innerHTML = `
    <section class="panel">
      <h3>Hot Picks</h3>
      <p class="muted">Select up to 5 products to feature on the home page. Click a product to toggle it.</p>
      <div class="filter-row" style="margin-top:0.7rem">
        <input id="hpSearch" class="field-input" placeholder="Search products…" style="flex:1;max-width:300px" />
        <select id="hpCat" class="field-input" style="width:160px">
          <option value="all">All Categories</option>
          <option value="kits">Kits</option>
          <option value="crochet">Crochet</option>
          <option value="clothing">Clothing</option>
        </select>
      </div>
      <p id="hpCount" class="muted" style="margin-top:0.6rem">Loading…</p>
      <div id="hpGrid" class="hp-grid" style="margin-top:0.8rem"></div>
    </section>`;

  let allProducts = [];

  const render = () => {
    const search = $('hpSearch').value.toLowerCase();
    const cat = $('hpCat').value;
    let filtered = allProducts;
    if (cat !== 'all') filtered = filtered.filter(p => p.category === cat);
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));

    const hotCount = allProducts.filter(p => p.is_hot_pick).length;
    $('hpCount').textContent = `${hotCount} / 5 hot picks selected`;
    $('hpCount').style.color = hotCount >= 5 ? '#ff9ec4' : '#a0a0a0';

    $('hpGrid').innerHTML = filtered.map(p => `
      <div class="hp-card ${p.is_hot_pick ? 'hp-active' : ''}" data-id="${p.id}">
        <img src="${p.primary_image || ''}" alt="${p.name}" class="hp-img" />
        <div class="hp-info">
          <p class="hp-name">${p.name}</p>
          <p class="hp-cat">${p.category} · NPR ${Number(p.price).toLocaleString()}</p>
        </div>
        <span class="hp-badge">${p.is_hot_pick ? '★ Hot Pick' : '☆ Add'}</span>
      </div>`).join('') || '<p class="muted">No products found.</p>';

    $('hpGrid').querySelectorAll('.hp-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.dataset.id;
        const p = allProducts.find(x => x.id === Number(id));
        if (!p.is_hot_pick && hotCount >= 5) {
          showToast('Maximum 5 hot picks — remove one first.', 'warning');
          return;
        }
        try {
          const res = await apiRequest(`/api/staff/products/${id}/toggle-hot-pick/`, 'PUT', {}, true);
          p.is_hot_pick = res.is_hot_pick;
          render();
        } catch (e) {
          showToast(e?.payload?.detail || e.message || 'Failed to update.', 'error');
        }
      });
    });
  };

  try {
    allProducts = await apiRequest('/api/staff/products/', 'GET', null, true);

    $('hpSearch').addEventListener('input', render);
    $('hpCat').addEventListener('change', render);
    render();
  } catch (e) {
    view.innerHTML = `<p class="text-red">${e.message}</p>`;
  }
};

// ── UNUSED STOCK (admin only) ─────────────────────────────────────────────────

const unusedStockView = async () => {
  view.innerHTML = `
    <section class="panel">
      <h3>Unused Stock</h3>
      <p class="muted">Products whose stock level has not changed for over 30 days.</p>
      <div id="unusedWrap" class="table-wrap" style="margin-top:0.8rem"><p>Loading…</p></div>
    </section>`;

  try {
    const products = await apiRequest('/api/admin/unused-stock/', 'GET', null, true);
    const sorted = [...products].sort((a, b) => new Date(a.stock_last_changed) - new Date(b.stock_last_changed));
    const wrap = $('unusedWrap');

    wrap.innerHTML = sorted.length ? `
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Total Stock</th><th>Last Changed</th><th>Days Idle</th></tr></thead>
        <tbody>
          ${sorted.map(p => {
            const days = Math.floor((Date.now() - new Date(p.stock_last_changed)) / 86400000);
            return `
              <tr>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td style="color:${stockColor(p.total_stock)};font-weight:700">${p.total_stock}</td>
                <td>${new Date(p.stock_last_changed).toLocaleDateString()}</td>
                <td class="${days > 60 ? 'text-red' : 'text-orange'}">${days} days</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<p class="muted">All products have had recent stock activity.</p>';
  } catch (e) {
    $('unusedWrap').innerHTML = `<p class="text-red">${e.message}</p>`;
  }
};

// ── OFFERS ───────────────────────────────────────────────────────────────────

const offersView = async () => {
  view.innerHTML = `
    <section class="panel">
      <h3>Offers</h3>
      <p class="muted">Mark products as offers — they appear in the Offers section on the homepage. Hidden from customers when empty.</p>
      <div class="filter-row" style="margin-top:0.7rem">
        <input id="ofSearch" class="field-input" placeholder="Search products…" style="flex:1;max-width:300px" />
        <select id="ofCat" class="field-input" style="width:160px">
          <option value="all">All Categories</option>
          <option value="kits">Kits</option>
          <option value="crochet">Crochet</option>
          <option value="clothing">Clothing</option>
        </select>
      </div>
      <p id="ofCount" class="muted" style="margin-top:0.6rem">Loading…</p>
      <div id="ofGrid" class="hp-grid" style="margin-top:0.8rem"></div>
    </section>`;

  let allProducts = [];

  const render = () => {
    const search = $('ofSearch').value.toLowerCase();
    const cat = $('ofCat').value;
    let filtered = allProducts;
    if (cat !== 'all') filtered = filtered.filter(p => p.category === cat);
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));

    const offerCount = allProducts.filter(p => p.is_offer).length;
    $('ofCount').textContent = `${offerCount} product${offerCount !== 1 ? 's' : ''} marked as offer`;
    $('ofCount').style.color = offerCount > 0 ? '#ff9ec4' : '#a0a0a0';

    $('ofGrid').innerHTML = filtered.map(p => `
      <div class="hp-card ${p.is_offer ? 'hp-active' : ''}" data-id="${p.id}">
        <img src="${p.primary_image || ''}" alt="${p.name}" class="hp-img" />
        <div class="hp-info">
          <p class="hp-name">${p.name}</p>
          ${p.is_offer && p.original_price
            ? `<p class="hp-cat">${p.category} · <strong style="color:#ff9e64">NPR ${Number(p.price).toLocaleString()}</strong> <span style="text-decoration:line-through;color:#555;font-size:0.8rem">NPR ${Number(p.original_price).toLocaleString()}</span></p>`
            : `<p class="hp-cat">${p.category} · NPR ${Number(p.price).toLocaleString()}</p>`}
        </div>
        <span class="hp-badge">${p.is_offer ? '🏷 Offer' : '+ Add'}</span>
      </div>`).join('') || '<p class="muted">No products found.</p>';

    $('ofGrid').querySelectorAll('.hp-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.dataset.id;
        const p = allProducts.find(x => x.id === Number(id));

        // ── Removing offer ────────────────────────────────────────────────
        if (p.is_offer) {
          const ok = await showConfirm(`Remove "${p.name}" from offers? The original price will be cleared.`, {
            title: 'Remove Offer?', confirmLabel: 'Remove', danger: true,
          });
          if (!ok) return;
          try {
            const res = await apiRequest(`/api/staff/products/${id}/toggle-offer/`, 'PUT', {}, true);
            p.is_offer = res.is_offer;
            p.original_price = res.original_price;
            p.price = res.price;
            render();
          } catch (e) {
            showToast(e?.payload?.detail || e.message || 'Failed to update.', 'error');
          }
          return;
        }

        // ── Adding offer: ask for prices ──────────────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
          <div class="modal" style="max-width:380px">
            <div class="modal-head">
              <h3>Set Offer Prices</h3>
              <button id="ofModalClose" class="btn-xs danger-xs">✕</button>
            </div>
            <div class="modal-body">
              <p class="muted" style="margin-bottom:1rem;font-size:0.85rem">${p.name}</p>
              <p class="field-label">Offer Price (NPR) *</p>
              <input id="ofOfferPrice" class="field-input" type="number" min="0" step="0.01"
                value="${p.price}" style="margin-bottom:0.8rem" />
              <p class="field-label">Original Price (NPR) *
                <span class="muted" style="font-size:0.78rem;font-weight:400">— will show crossed out</span>
              </p>
              <input id="ofOriginalPrice" class="field-input" type="number" min="0" step="0.01"
                placeholder="e.g. ${Math.round(Number(p.price) * 1.2)}" style="margin-bottom:0.8rem" />
              <p id="ofModalErr" class="error" style="margin-bottom:0.5rem"></p>
              <button id="ofModalConfirm" class="btn" style="width:100%">Mark as Offer</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.style.opacity = '1');

        overlay.querySelector('#ofModalClose').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#ofModalConfirm').addEventListener('click', async () => {
          const offerPrice    = parseFloat(overlay.querySelector('#ofOfferPrice').value);
          const originalPrice = parseFloat(overlay.querySelector('#ofOriginalPrice').value);
          const errEl         = overlay.querySelector('#ofModalErr');

          if (!offerPrice || offerPrice <= 0)    { errEl.textContent = 'Offer price is required.'; return; }
          if (!originalPrice || originalPrice <= 0) { errEl.textContent = 'Original price is required.'; return; }
          if (offerPrice >= originalPrice)        { errEl.textContent = 'Offer price must be less than original price.'; return; }

          const confirmBtn = overlay.querySelector('#ofModalConfirm');
          confirmBtn.disabled = true; confirmBtn.textContent = 'Saving…';

          try {
            const res = await apiRequest(`/api/staff/products/${id}/toggle-offer/`, 'PUT', {
              price: offerPrice, original_price: originalPrice,
            }, true);
            p.is_offer = res.is_offer;
            p.price = res.price;
            p.original_price = res.original_price;
            overlay.remove();
            render();
            showToast(`"${p.name}" marked as offer.`, 'success');
          } catch (e) {
            errEl.textContent = e?.payload?.detail || e.message || 'Failed to update.';
            confirmBtn.disabled = false; confirmBtn.textContent = 'Mark as Offer';
          }
        });
      });
    });
  };

  try {
    allProducts = await apiRequest('/api/staff/products/', 'GET', null, true);
    $('ofSearch').addEventListener('input', render);
    $('ofCat').addEventListener('change', render);
    render();
  } catch (e) {
    view.innerHTML = `<p class="text-red">${e.message}</p>`;
  }
};

// ── RECORD SALE ──────────────────────────────────────────────────────────────

const recordSaleView = async () => {
  view.innerHTML = `
    <section class="panel">
      <h3>Record Sale</h3>
      <p class="muted" style="margin:0.25rem 0 1.2rem">Record an in-person or offline sale. Stock is deducted immediately.</p>

      <div class="form-grid2">
        <div class="form-col">

          <p class="field-label">Product *</p>
          <div style="position:relative">
            <input id="saleProductSearch" class="field-input" placeholder="Search product name…" autocomplete="off" />
            <ul id="saleProductList" class="sale-product-list" style="display:none"></ul>
          </div>
          <input type="hidden" id="saleProductId" />
          <p id="saleProductName" class="muted" style="font-size:0.82rem;margin-top:0.3rem"></p>

          <p class="field-label" style="margin-top:0.9rem">Size *</p>
          <select id="saleSizeSelect" class="field-input" disabled>
            <option value="">— select product first —</option>
          </select>

          <p class="field-label" style="margin-top:0.9rem">Quantity *</p>
          <input id="saleQty" class="field-input" type="number" min="1" value="1" style="max-width:120px" />

          <p class="field-label" style="margin-top:0.9rem">Sale Method *</p>
          <select id="saleMethods" class="field-input">
            <option value="in_person">In Person</option>
            <option value="phone">Phone</option>
            <option value="social_media">Social Media</option>
            <option value="other">Other</option>
          </select>

        </div>
        <div class="form-col">

          <p class="field-label">Description <span class="muted" style="font-weight:400;font-size:0.78rem">(optional)</span></p>
          <textarea id="saleDesc" class="field-input field-textarea" rows="4"
            placeholder="Describe the sale — customer name, context, notes…"></textarea>

          <p class="field-label" style="margin-top:0.9rem">Order / Reference Code <span class="muted" style="font-weight:400;font-size:0.78rem">(optional)</span></p>
          <input id="saleOrderCode" class="field-input" placeholder="e.g. INV-001, #123…" />

          <p id="saleErr" class="error" style="margin-top:0.8rem"></p>
          <button id="saleSubmit" class="btn" style="margin-top:1rem;width:100%">Record Sale</button>

        </div>
      </div>
    </section>

    <section class="panel" style="margin-top:1.4rem">
      <h3>Recent Sales</h3>
      <div id="salesTableWrap" class="table-wrap" style="margin-top:0.8rem"><p class="muted">Loading…</p></div>
    </section>`;

  // ── product search autocomplete ──────────────────────────────────────────
  let allProducts = [];
  let selectedProduct = null;

  try {
    allProducts = await apiRequest('/api/staff/products/', 'GET', null, true);
  } catch (e) {
    $('saleErr').textContent = 'Failed to load products.';
  }

  const searchInput  = $('saleProductSearch');
  const productList  = $('saleProductList');
  const productIdIn  = $('saleProductId');
  const productLabel = $('saleProductName');
  const sizeSelect   = $('saleSizeSelect');

  const selectProduct = async (p) => {
    selectedProduct = p;
    searchInput.value  = p.name;
    productIdIn.value  = p.id;
    productLabel.textContent = `${p.category} · NPR ${Number(p.price).toLocaleString()}`;
    productList.style.display = 'none';

    // Fetch full product detail to get sizes with quantities
    sizeSelect.innerHTML = '<option value="">Loading sizes…</option>';
    sizeSelect.disabled = true;
    try {
      const full = await apiRequest(`/api/staff/products/${p.id}/`, 'GET', null, true);
      sizeSelect.innerHTML = '';
      const sizes = (full.sizes || []).filter(s => s.quantity > 0);
      if (sizes.length) {
        sizes.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.size;
          const sizeLabel = (s.size === 'Free Size' || s.size === 'No Size') ? 'Free Size' : s.size;
          opt.textContent = `${sizeLabel} (${s.quantity} in stock)`;
          sizeSelect.appendChild(opt);
        });
        sizeSelect.disabled = false;
      } else {
        sizeSelect.innerHTML = '<option value="">No stock available</option>';
      }
    } catch (e) {
      sizeSelect.innerHTML = '<option value="">Failed to load sizes</option>';
    }
  };

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { productList.style.display = 'none'; return; }
    const matches = allProducts.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { productList.style.display = 'none'; return; }
    productList.innerHTML = matches.map(p =>
      `<li class="sale-product-item" data-id="${p.id}">${p.name} <span class="muted" style="font-size:0.78rem">${p.category}</span></li>`
    ).join('');
    productList.style.display = '';
    productList.querySelectorAll('.sale-product-item').forEach(li => {
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        const p = allProducts.find(x => x.id === Number(li.dataset.id));
        if (p) selectProduct(p);
      });
    });
  });

  document.addEventListener('click', e => {
    if (!productList.contains(e.target) && e.target !== searchInput) {
      productList.style.display = 'none';
    }
  });

  // ── submit ────────────────────────────────────────────────────────────────
  $('saleSubmit').addEventListener('click', async () => {
    const errEl = $('saleErr');
    errEl.textContent = '';

    const product_id  = Number($('saleProductId').value);
    const size        = $('saleSizeSelect').value;
    const quantity    = parseInt($('saleQty').value) || 0;
    const sale_method = $('saleMethods').value;
    const description = $('saleDesc').value.trim();
    const order_code  = $('saleOrderCode').value.trim();

    if (!product_id)  { errEl.textContent = 'Please select a product.'; return; }
    if (!size)        { errEl.textContent = 'Please select a size.'; return; }
    if (quantity < 1) { errEl.textContent = 'Quantity must be at least 1.'; return; }

    const btn = $('saleSubmit');
    btn.disabled = true; btn.textContent = 'Recording…';

    try {
      await apiRequest('/api/staff/manual-sales/', 'POST', {
        product_id, size, quantity, sale_method, description, order_code,
      }, true);

      showToast('Sale recorded successfully!', 'success');

      // Reset form
      searchInput.value = '';
      productIdIn.value = '';
      productLabel.textContent = '';
      sizeSelect.innerHTML = '<option value="">— select product first —</option>';
      sizeSelect.disabled = true;
      $('saleQty').value = '1';
      $('saleDesc').value = '';
      $('saleOrderCode').value = '';
      selectedProduct = null;

      // Refresh table
      await loadSalesTable();
    } catch (err) {
      errEl.textContent = err?.payload
        ? Object.values(err.payload).flat().join(' | ')
        : err.message || 'Failed to record sale.';
    } finally {
      btn.disabled = false; btn.textContent = 'Record Sale';
    }
  });

  // ── recent sales table ────────────────────────────────────────────────────
  const SALE_METHOD_LABELS = {
    in_person: 'In Person', phone: 'Phone',
    social_media: 'Social Media', other: 'Other',
  };

  const loadSalesTable = async () => {
    const wrap = $('salesTableWrap');
    try {
      const sales = await apiRequest('/api/staff/manual-sales/', 'GET', null, true);
      wrap.innerHTML = sales.length ? `
        <table>
          <thead>
            <tr>
              <th>#</th><th>Product</th><th>Size</th><th>Qty</th>
              <th>Price</th><th>Method</th><th>Code</th><th>Description</th><th>By</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(s => `
              <tr>
                <td>${s.id}</td>
                <td>${s.product_name}</td>
                <td>${s.size === 'Free Size' || s.size === 'No Size' ? '—' : s.size}</td>
                <td>${s.quantity}</td>
                <td>NPR ${Number(s.price_at_sale).toLocaleString()}</td>
                <td>${SALE_METHOD_LABELS[s.sale_method] || s.sale_method}</td>
                <td>${s.order_code || '—'}</td>
                <td class="sale-desc-cell">${s.description}</td>
                <td>${s.sold_by_name}</td>
                <td>${new Date(s.created_at).toLocaleDateString()}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p class="muted">No sales recorded yet.</p>';
    } catch (e) {
      wrap.innerHTML = `<p class="text-red">${e.message}</p>`;
    }
  };

  await loadSalesTable();
};

// ── TAB ROUTING ───────────────────────────────────────────────────────────────

const TABS = {
  overview: overviewView,
  addProduct: addProductView,
  editProducts: editProductsView,
  stock: stockView,
  orders: ordersView,
  hotPicks: hotPicksView,
  offers: offersView,
  recordSale: recordSaleView,
  delivery: deliveryView,
  ...(isAdmin ? { users: usersView, unusedStock: unusedStockView } : {}),
};

const TAB_LABELS = {
  overview: isAdmin ? 'Admin Dashboard' : 'Staff Dashboard',
  addProduct: 'Add Product',
  editProducts: 'Edit Products',
  stock: 'Stock',
  orders: 'Orders',
  hotPicks: 'Hot Picks',
  offers: 'Offers',
  recordSale: 'Record Sale',
  delivery: 'Delivery Locations',
  users: 'Users',
  unusedStock: 'Unused Stock',
};

const sectionBar   = document.getElementById('dashSectionBar');
const sectionTitle = document.getElementById('dashSectionTitle');
const pageTitle    = document.getElementById('dashPageTitle');

const setActiveTab = (tab) => {
  const isOverview = tab === 'overview';
  if (sectionBar)   sectionBar.style.display   = isOverview ? 'none' : 'flex';
  if (pageTitle)    pageTitle.textContent       = TAB_LABELS[tab] || tab;
  if (sectionTitle) sectionTitle.textContent    = isOverview ? '' : TAB_LABELS[tab] || '';
};

document.querySelectorAll('[data-tab]').forEach(btn => {
  if (!isAdmin && ['users', 'unusedStock'].includes(btn.dataset.tab)) {
    btn.remove();
    return;
  }
  btn.addEventListener('click', async () => {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setActiveTab(btn.dataset.tab);
    view.innerHTML = '<p style="padding:1rem" class="muted">Loading…</p>';
    try { await TABS[btn.dataset.tab]?.(); }
    catch (e) { view.innerHTML = `<p class="text-red" style="padding:1rem">Error: ${e.message}</p>`; }
  });
});

// start on overview
const firstTab = document.querySelector('[data-tab="overview"]');
if (firstTab) firstTab.classList.add('active');
setActiveTab('overview');
overviewView().catch(e => {
  view.innerHTML = `<p class="text-red" style="padding:1rem">Dashboard error: ${e.message}</p>`;
});
