import { apiRequest } from './api.js';
import { addToCart } from './cart.js?v=3';
import { showToast } from './ui.js';

const qs = (id) => document.getElementById(id);

const PAGE_SIZE = 9;

// Size sort order (letter sizes first, then numeric, then special)
const SIZE_ORDER = ['XXS','XS','S','SM','M','MD','L','LG','XL','2XL','XXL','3XL','XXXL','4XL','Free Size','One Size'];
function sizeRank(s) {
  const i = SIZE_ORDER.indexOf(s);
  if (i !== -1) return i;
  const n = parseInt(s, 10);
  return isNaN(n) ? 999 : 100 + n;
}

function sortProducts(products, order) {
  const arr = [...products];
  switch (order) {
    case 'title-ascending':  return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'title-descending': return arr.sort((a, b) => b.name.localeCompare(a.name));
    case 'price-ascending':  return arr.sort((a, b) => Number(a.price) - Number(b.price));
    case 'price-descending': return arr.sort((a, b) => Number(b.price) - Number(a.price));
    default:                 return arr; // best-selling = API default order
  }
}

// ── Custom sort dropdown ───────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'none',             label: 'None' },
  { value: 'title-ascending',  label: 'Alphabetically, A–Z' },
  { value: 'title-descending', label: 'Alphabetically, Z–A' },
  { value: 'price-ascending',  label: 'Price, low to high' },
  { value: 'price-descending', label: 'Price, high to low' },
];

function buildSortDropdown(container, onChange) {
  let current = 'none';
  const CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" width="11" height="11" fill="none"><path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  container.innerHTML = `
    <div class="csel" id="cselSort">
      <button class="csel-btn" type="button">
        <span class="csel-label">None</span>${CHEVRON}
      </button>
      <ul class="csel-list" role="listbox">
        ${SORT_OPTIONS.map(o => `<li class="csel-item${o.value === current ? ' csel-active' : ''}" data-val="${o.value}" role="option">${o.label}</li>`).join('')}
      </ul>
    </div>`;

  const wrap  = container.querySelector('.csel');
  const btn   = wrap.querySelector('.csel-btn');
  const label = wrap.querySelector('.csel-label');
  const list  = wrap.querySelector('.csel-list');

  btn.addEventListener('click', (e) => { e.stopPropagation(); wrap.classList.toggle('open'); });
  document.addEventListener('click', () => wrap.classList.remove('open'));

  list.querySelectorAll('.csel-item').forEach(li => {
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      current = li.dataset.val;
      label.textContent = li.textContent;
      list.querySelectorAll('.csel-item').forEach(x => x.classList.remove('csel-active'));
      li.classList.add('csel-active');
      wrap.classList.remove('open');
      onChange(current);
    });
  });

  return { getValue: () => current };
}

// ── Pagination renderer ────────────────────────────────────────────────────────
function renderPagination(container, currentPage, totalPages, onPage) {
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const maxVisible = 5;
  let start = Math.max(1, currentPage - 2);
  let end   = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  const pageBtn = (p, label, disabled, active) =>
    `<button class="pg-btn${active ? ' pg-active' : ''}" data-p="${p}" ${disabled ? 'disabled' : ''}>${label}</button>`;

  container.innerHTML =
    pageBtn(currentPage - 1, '‹', currentPage === 1, false) +
    (start > 1 ? pageBtn(1, '1', false, false) + (start > 2 ? '<span class="pg-ellipsis">…</span>' : '') : '') +
    Array.from({ length: end - start + 1 }, (_, i) => pageBtn(start + i, start + i, false, start + i === currentPage)).join('') +
    (end < totalPages ? (end < totalPages - 1 ? '<span class="pg-ellipsis">…</span>' : '') + pageBtn(totalPages, totalPages, false, false) : '') +
    pageBtn(currentPage + 1, '›', currentPage === totalPages, false);

  container.querySelectorAll('.pg-btn[data-p]').forEach(b =>
    b.addEventListener('click', () => { onPage(Number(b.dataset.p)); })
  );
}

// ── Card builder + thumb hover wiring ─────────────────────────────────────────
function buildProductCard(p, category) {
  const imgs = p.all_images || [];
  const thumbsHtml = imgs.length > 1
    ? `<div class="card-thumbs">${imgs.map(url =>
        `<img class="card-thumb" src="${url}" alt="" />`
      ).join('')}</div>`
    : '';

  const starsHtml = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  const ratingRow = (p.avg_rating || p.sold_count > 0) ? `
    <div class="card-rating-row">
      ${p.sold_count > 0 ? `<span class="card-sold-badge">${p.sold_count}+ sold</span>` : ''}
      ${p.avg_rating ? `<span class="card-stars">${starsHtml(Math.round(p.avg_rating))}</span><span class="card-rating-val">${p.avg_rating}</span>` : ''}
    </div>` : '';

  return `
    <article class="look-card">
      <div class="card-img-wrap">
        <a href="./product-${category}.html?id=${p.id}">
          <img class="card-main-img" src="${p.primary_image}" alt="${p.name}" />
        </a>
        ${thumbsHtml}
      </div>
      <div class="look-body">
        <h3>${p.name}</h3>
        ${p.is_offer && p.original_price
          ? `<p class="offer-price-wrap"><strong>NPR ${Number(p.price).toLocaleString()}</strong><span class="price-original">NPR ${Number(p.original_price).toLocaleString()}</span></p>`
          : `<p>NPR ${Number(p.price).toFixed(2)}</p>`}
        ${ratingRow}
        ${p.out_of_stock ? '<p class="low-stock">Sold Out</p>' : p.low_stock ? '<p class="low-stock">Low Stock</p>' : '<p class="muted">In stock</p>'}
        <a class="mini-btn" href="./product-${category}.html?id=${p.id}">VIEW PRODUCT</a>
      </div>
    </article>`;
}

function wireCardThumbs(container) {
  container.querySelectorAll('.look-card').forEach(card => {
    const mainImg  = card.querySelector('.card-main-img');
    const thumbs   = card.querySelectorAll('.card-thumb');
    if (!mainImg || !thumbs.length) return;

    const originalSrc = mainImg.src; // preserve primary image URL

    thumbs.forEach(thumb => {
      thumb.addEventListener('mouseover', () => {
        mainImg.src = thumb.src;
        thumbs.forEach(t => t.classList.remove('card-thumb-active'));
        thumb.classList.add('card-thumb-active');
      });
    });

    // When mouse leaves the thumb strip, restore primary image
    const strip = card.querySelector('.card-thumbs');
    if (strip) {
      strip.addEventListener('mouseleave', () => {
        mainImg.src = originalSrc;
        thumbs.forEach(t => t.classList.remove('card-thumb-active'));
      });
    }
  });
}

export async function renderCategoryPage({ category, productsRootId = 'products' }) {
  const productsRoot = qs(productsRootId);
  const labelsRoot   = qs('labelFilters');

  // ── Label groups ──────────────────────────────────────────────────────────────
  const TYPE_LABELS     = ['T-Shirt', 'Hoodie'];
  const QUALITY_LABELS  = ['Embroidery Set', 'Players Grade', 'Sublimation Print'];
  const SPECIAL_LABELS  = ['Retro', 'Special Edition', 'World Cup'];

  // Inject Type filter ABOVE the regular-label block so it appears first
  labelsRoot.insertAdjacentHTML('beforebegin', `
    <div id="typeFilterWrap" style="display:none">
      <h4>Type</h4>
      <div id="typeFilters"></div>
    </div>`);
  const typeWrap    = qs('typeFilterWrap');
  const typeFilters = qs('typeFilters');

  // ── Inject size + quality + special filter sections below label filters ───────
  labelsRoot.insertAdjacentHTML('afterend', `
    <div id="sizeFilterWrap" style="display:none">
      <h4>Size</h4>
      <div id="sizeFilters"></div>
    </div>
    <div id="qualityFilterWrap" style="display:none">
      <h4>Quality</h4>
      <div id="qualityFilters"></div>
    </div>
    <div id="specialFilterWrap" style="display:none">
      <h4>Special Edition</h4>
      <div id="specialFilters"></div>
    </div>`);
  const sizeWrap        = qs('sizeFilterWrap');
  const sizeFilters     = qs('sizeFilters');
  const qualityWrap     = qs('qualityFilterWrap');
  const qualityFilters  = qs('qualityFilters');
  const specialWrap     = qs('specialFilterWrap');
  const specialFilters  = qs('specialFilters');

  // ── Inject toolbar (search + sort) above product grid ─────────────────────
  productsRoot.insertAdjacentHTML('beforebegin', `
    <div class="shop-toolbar">
      <div class="search-wrap">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input id="productSearch" class="product-search" type="search" placeholder="Search products…" autocomplete="off" />
      </div>
      <div id="sortContainer"></div>
    </div>`);

  const searchInput = qs('productSearch');

  // Pagination container (inserted after products)
  productsRoot.insertAdjacentHTML('afterend', `<div id="pgContainer" class="pg-wrap"></div>`);
  const pgContainer = qs('pgContainer');

  // ── State ──────────────────────────────────────────────────────────────────
  let sortValue   = 'none';
  let currentPage = 1;

  // Build custom sort
  const sortCtrl = buildSortDropdown(qs('sortContainer'), (val) => {
    sortValue = val; currentPage = 1; render();
  });

  // ── Fetch labels ───────────────────────────────────────────────────────────
  const [labelRes, sizeRes] = await Promise.all([
    apiRequest(`/api/products/labels/?category=${category}`),
    apiRequest(`/api/products/sizes/?category=${category}`),
  ]);

  const labels       = labelRes || [];
  const typeLbls     = labels.filter(l => TYPE_LABELS.includes(l.name));
  const qualityLbls  = labels.filter(l => QUALITY_LABELS.includes(l.name));
  const specialLbls  = labels.filter(l => SPECIAL_LABELS.includes(l.name));
  const regularLbls  = labels.filter(l =>
    !TYPE_LABELS.includes(l.name) &&
    !QUALITY_LABELS.includes(l.name) &&
    !SPECIAL_LABELS.includes(l.name)
  );

  if (typeLbls.length) {
    typeFilters.innerHTML = typeLbls.map(l =>
      `<label><input type="checkbox" value="${l.name}" /> ${l.name}</label>`
    ).join('');
    typeWrap.style.display = '';
  }

  labelsRoot.innerHTML = regularLbls.map(l =>
    `<label><input type="checkbox" value="${l.name}" /> ${l.name}</label>`
  ).join('');

  if (qualityLbls.length) {
    qualityFilters.innerHTML = qualityLbls.map(l =>
      `<label><input type="checkbox" value="${l.name}" /> ${l.name}</label>`
    ).join('');
    qualityWrap.style.display = '';
  }

  if (specialLbls.length) {
    specialFilters.innerHTML = specialLbls.map(l =>
      `<label><input type="checkbox" value="${l.name}" /> ${l.name}</label>`
    ).join('');
    specialWrap.style.display = '';
  }

  // ── Fetch & render sizes ───────────────────────────────────────────────────
  const sizes = (sizeRes || []).sort((a, b) => sizeRank(a) - sizeRank(b));
  if (sizes.length) {
    sizeFilters.innerHTML = sizes.map(s =>
      `<label><input type="checkbox" value="${s}" /> ${s}</label>`
    ).join('');
    sizeWrap.style.display = '';
  }

  // ── Main render ────────────────────────────────────────────────────────────
  const render = async () => {
    const selLabels  = [
      ...[...typeFilters.querySelectorAll('input:checked')].map(x => x.value),
      ...[...labelsRoot.querySelectorAll('input:checked')].map(x => x.value),
      ...[...qualityFilters.querySelectorAll('input:checked')].map(x => x.value),
      ...[...specialFilters.querySelectorAll('input:checked')].map(x => x.value),
    ];
    const selSizes  = [...sizeFilters.querySelectorAll('input:checked')].map(x => x.value);
    const search    = searchInput.value.trim();

    const params = new URLSearchParams({ category });
    selLabels.forEach(s => params.append('label', s));
    selSizes.forEach(s  => params.append('size', s));
    if (search) params.set('search', search);

    const products = await apiRequest(`/api/products/?${params.toString()}`);
    const sorted   = sortProducts(products, sortValue);

    const total = sorted.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > pages) currentPage = 1;
    const page = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    productsRoot.innerHTML = page.length
      ? page.map(p => buildProductCard(p, category)).join('')
      : `<p class="muted" style="padding:2rem 0;grid-column:1/-1">No products found.</p>`;

    wireCardThumbs(productsRoot);

    renderPagination(pgContainer, currentPage, pages, (p) => {
      currentPage = p;
      render();
      window.scrollTo({ top: productsRoot.offsetTop - 90, behavior: 'smooth' });
    });
  };

  typeFilters.addEventListener('change', () => { currentPage = 1; render(); });
  labelsRoot.addEventListener('change', () => { currentPage = 1; render(); });
  sizeFilters.addEventListener('change', () => { currentPage = 1; render(); });
  qualityFilters.addEventListener('change', () => { currentPage = 1; render(); });
  specialFilters.addEventListener('change', () => { currentPage = 1; render(); });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentPage = 1; render(); }, 280);
  });

  await render();
}

export async function renderProductDetailPage({ category }) {
  const id = new URLSearchParams(location.search).get('id');
  const p = await apiRequest(`/api/products/${id}/`);
  const root = qs('productRoot');
  const primary = (p.images.find((i) => i.is_primary) || p.images[0] || {}).image || '';

  // Compute visible sizes once — sorted by SIZE_ORDER — so both the HTML and
  // the `selected` default use exactly the same set (no 'Free Size' / 'No Size').
  const realSizes = p.sizes
    .filter(s => s.size !== 'Free Size' && s.size !== 'No Size')
    .sort((a, b) => sizeRank(a.size) - sizeRank(b.size));

  // Fall back to all sizes for products that truly only have generic sizes.
  const sizesForSelection = realSizes.length ? realSizes : p.sizes;

  // ── Helper: render N filled + (5-N) empty stars ──────────────────────────
  const starsHtml = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  root.innerHTML = `
    <section class="product-detail">
      <div class="product-images">
        ${p.images.length > 1 ? `
        <div class="thumb-row">
          ${p.images.map((img, i) => `<img class="thumb${i === 0 ? ' thumb-active' : ''}" src="${img.image}" alt="View image ${i + 1}" />`).join('')}
        </div>` : ''}
        <div class="main-image-wrap">
          <img id="mainImage" class="main-image" src="${primary}" alt="${p.name}" />
        </div>
      </div>
      <div>
        <h1>${p.name}</h1>
        ${p.is_offer && p.original_price
          ? `<p class="price offer-price-wrap"><strong>NPR ${Number(p.price).toLocaleString()}</strong><span class="price-original">NPR ${Number(p.original_price).toLocaleString()}</span></p>`
          : `<p class="price">NPR ${Number(p.price).toFixed(2)}</p>`}

        ${(p.sold_count > 0 || p.avg_rating) ? `
        <div class="prod-rating-row">
          ${p.sold_count > 0 ? `<span class="prod-sold-badge">${p.sold_count}+ sold</span>` : ''}
          ${p.avg_rating ? `
          <span style="display:flex;align-items:center;gap:0.35rem;font-size:0.88rem">
            <span class="prod-rating-stars">${starsHtml(Math.round(p.avg_rating))}</span>
            <span style="font-weight:600">${p.avg_rating}</span>
            <span style="color:#555;font-size:0.8rem">(${p.review_count} review${p.review_count !== 1 ? 's' : ''})</span>
          </span>` : ''}
        </div>` : ''}

        ${realSizes.length
          ? `<div class="sizes" id="sizeButtons">${realSizes.map(s => `<button data-size="${s.size}" ${s.out_of_stock ? 'disabled' : ''}>${s.size}</button>`).join('')}</div>`
          : `<div class="sizes" id="sizeButtons" style="display:none"></div>`}

        ${p.allow_print && category === 'kits' ? `
        <div class="print-section" id="printSection">
          <div class="print-section-header">
            <span class="print-section-title">✏️ Custom Back Print</span>
            <span class="print-charge-badge">+ NPR 300</span>
          </div>
          <div class="print-fields">
            <div class="print-field">
              <label class="print-label">Name on jersey <span class="print-label-meta">(letters &amp; spaces, max 15)</span></label>
              <input id="printName" class="print-input" type="text" maxlength="15" placeholder="e.g. JOHNSON" autocomplete="off" />
            </div>
            <div class="print-field">
              <label class="print-label">Number on jersey <span class="print-label-meta">(0–99)</span></label>
              <input id="printNumber" class="print-input print-input-num" type="number" min="0" max="99" placeholder="e.g. 10" />
            </div>
          </div>
          <p class="print-note">Optional — leave both blank to order without print.</p>
        </div>` : ''}

        <div class="qty-control" id="qtyControl"><button id="decQty">-</button><span id="qtyVal">1</span><button id="incQty">+</button></div>
        <button id="addToCart">Add to Cart</button>
        <p class="description">${p.description}</p>
      </div>
    </section>`;

  root.querySelectorAll('.thumb').forEach((t) => {
    t.addEventListener('click', () => {
      qs('mainImage').src = t.src;
      root.querySelectorAll('.thumb').forEach((x) => x.classList.remove('thumb-active'));
      t.classList.add('thumb-active');
    });
  });

  let qty = 1;
  // Use only the visible sizes when picking the default selection so the
  // highlighted button always matches what will actually be added to cart.
  let selected = sizesForSelection.find((s) => !s.out_of_stock) || sizesForSelection[0];
  const setQty = () => qs('qtyVal').textContent = qty;
  const getMax = () => Number(selected?.quantity || 1);

  // Mark the default selected size button as active.
  if (selected) {
    const firstBtn = qs('sizeButtons').querySelector(`button[data-size="${selected.size}"]`);
    if (firstBtn) firstBtn.classList.add('active');
  }

  qs('sizeButtons').querySelectorAll('button[data-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      qs('sizeButtons').querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selected = sizesForSelection.find((s) => s.size === btn.dataset.size) || sizesForSelection[0];
      qty = 1;
      setQty();
    });
  });

  qs('decQty')?.addEventListener('click', () => { qty = Math.max(1, qty - 1); setQty(); });
  qs('incQty')?.addEventListener('click', () => { qty = Math.min(getMax(), qty + 1); setQty(); });

  // ── Print-mode: hide qty control when a print field has a value ─────────────
  if (p.allow_print && category === 'kits') {
    const qtyControl = qs('qtyControl');
    const syncPrintMode = () => {
      const nameVal = qs('printName')?.value.trim() || '';
      const numVal  = qs('printNumber')?.value;
      const hasPrintInput = nameVal !== '' || (numVal !== '' && numVal !== null && numVal !== undefined);
      if (qtyControl) qtyControl.style.display = hasPrintInput ? 'none' : '';
    };
    qs('printName')?.addEventListener('input', syncPrintMode);
    qs('printNumber')?.addEventListener('input', syncPrintMode);
  }

  qs('addToCart').addEventListener('click', () => {
    const printNameVal  = qs('printName')?.value.trim() || '';
    const printNumRaw   = qs('printNumber')?.value;
    const printNumVal   = (printNumRaw !== '' && printNumRaw !== null && printNumRaw !== undefined) ? Number(printNumRaw) : null;
    const wantsPrint    = !!(p.allow_print && category === 'kits' && (printNameVal !== '' || printNumVal != null));

    if (wantsPrint) {
      if (printNameVal && !/^[a-zA-Z ]+$/.test(printNameVal)) {
        showToast('Print name can only contain letters and spaces.', 'warning');
        return;
      }
      if (printNumVal !== null && (printNumVal < 0 || printNumVal > 99 || !Number.isInteger(printNumVal))) {
        showToast('Print number must be a whole number between 0 and 99.', 'warning');
        return;
      }
      addToCart({
        productId: p.id,
        productName: p.name,
        category,
        size: selected?.size || (p.sizes[0]?.size ?? 'Free Size'),
        quantity: 1,
        price: Number(p.price),
        image: primary,
        allowPrint: true,
        printName: printNameVal,
        printNumber: printNumVal,
      });
    } else {
      addToCart({
        productId: p.id,
        productName: p.name,
        category,
        size: selected?.size || (p.sizes[0]?.size ?? 'Free Size'),
        quantity: qty,
        price: Number(p.price),
        image: primary,
      });
    }
  });

  // ── Customer Reviews ───────────────────────────────────────────────────────
  if (p.reviews && p.reviews.length > 0) {
    root.insertAdjacentHTML('beforeend', `
      <section class="reviews-section section">
        <h2>Customer Reviews <span style="font-weight:400;color:#555;font-size:0.9rem">(${p.review_count})</span></h2>
        <div>
          ${p.reviews.map(r => `
          <div class="review-card">
            <div class="review-card-head">
              <span class="review-stars">${starsHtml(r.rating)}</span>
              <span class="review-author">${r.customer_name}</span>
              <span class="review-date">${new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            ${r.body ? `<p class="review-body">${r.body}</p>` : ''}
          </div>`).join('')}
        </div>
      </section>`);
  }

  // ── You may also like ──────────────────────────────────────────────────────
  const firstLabel = p.labels?.[0]?.name;
  if (!firstLabel) return;

  root.insertAdjacentHTML('beforeend', `
    <section class="similar-section section">
      <h2 style="text-align:left;margin-bottom:0.8rem">You May Also Like</h2>
      <div id="similarGrid" class="product-grid"></div>
    </section>`);

  try {
    const params = new URLSearchParams({ category, label: firstLabel });
    const similar = await apiRequest(`/api/products/?${params}`);
    const filtered = similar.filter((x) => x.id !== p.id).slice(0, 4);
    const grid = qs('similarGrid');

    grid.innerHTML = filtered.length
      ? filtered.map((x) => buildProductCard(x, category)).join('')
      : '<p class="muted">No similar products found.</p>';
    if (filtered.length) wireCardThumbs(grid);
  } catch {
    qs('similarGrid').innerHTML = '';
  }
}

export async function renderBouquetBuilder() {
  const flowers = await apiRequest('/api/bouquet/flowers/');
  const wrappings = await apiRequest('/api/bouquet/wrappings/');
  const flowersRoot = qs('flowersRoot');
  const wrappingsRoot = qs('wrappingsRoot');

  const state = { wrapping: null, qty: {}, max: 20 };

  wrappingsRoot.innerHTML = wrappings.map((w) => `
    <button class="wrap-card" data-wrap="${w.id}" data-price="${w.price}" data-name="${w.name}">
      <div class="wrap-card-img-wrap">
        ${w.image ? `<img class="wrap-card-img" src="${w.image}" alt="${w.name}" />` : `<div class="wrap-card-placeholder"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#555" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg></div>`}
      </div>
      <div class="wrap-card-info">
        <span class="wrap-card-name">${w.name}</span>
        <span class="wrap-card-price">NPR ${Number(w.price).toFixed(2)}</span>
      </div>
    </button>`).join('');
  flowersRoot.innerHTML = flowers.map((f) => `
    <article class="look-card">
      <img src="${f.image}" alt="${f.name}" />
      <div class="look-body">
        <h3>${f.name}</h3><p>NPR ${f.price_per_unit}</p>
        <div class="qty-control"><button data-fl-dec="${f.id}">-</button><span id="fqty-${f.id}">0</span><button data-fl-inc="${f.id}">+</button></div>
      </div>
    </article>`).join('');

  const totalFlowers = () => Object.values(state.qty).reduce((a, b) => a + b, 0);
  const totalPrice = () => {
    const wrap = wrappings.find((w) => w.id === state.wrapping);
    let total = Number(wrap?.price || 0);
    flowers.forEach((f) => { total += (state.qty[f.id] || 0) * Number(f.price_per_unit); });
    return total;
  };

  const paint = () => {
    qs('flowerCounter').textContent = `${totalFlowers()} / 20 flowers`;
    qs('bouquetTotal').textContent = `NPR ${totalPrice().toFixed(2)}`;
    flowers.forEach((f) => { const el = qs(`fqty-${f.id}`); if (el) el.textContent = String(state.qty[f.id] || 0); });
  };

  wrappingsRoot.querySelectorAll('[data-wrap]').forEach((b) => b.addEventListener('click', () => {
    state.wrapping = Number(b.dataset.wrap);
    wrappingsRoot.querySelectorAll('[data-wrap]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    paint();
  }));

  flowersRoot.querySelectorAll('[data-fl-inc]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.flInc);
    const flower = flowers.find((f) => f.id === id);
    const perFlowerMax = flower?.max_quantity_per_bouquet ?? 20;
    if (totalFlowers() >= state.max) { showToast('Maximum bouquet size reached (20 flowers total).', 'warning'); return; }
    if ((state.qty[id] || 0) >= perFlowerMax) { showToast(`Maximum ${perFlowerMax} of this flower allowed.`, 'warning'); return; }
    state.qty[id] = (state.qty[id] || 0) + 1;
    paint();
  }));
  flowersRoot.querySelectorAll('[data-fl-dec]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.flDec);
    state.qty[id] = Math.max(0, (state.qty[id] || 0) - 1);
    paint();
  }));

  qs('addBouquetToCart').addEventListener('click', async () => {
    if (!state.wrapping) { showToast('Please select a wrapping first.', 'warning'); return; }
    if (totalFlowers() === 0) { showToast('Please select at least one flower.', 'warning'); return; }
    const wrap = wrappings.find((w) => w.id === state.wrapping);
    const selectedFlowers = flowers.filter((f) => (state.qty[f.id] || 0) > 0);

    addToCart({
      type: 'custom_bouquet',
      productId: `bouquet-${Date.now()}`,
      productName: 'Custom Bouquet',
      category: 'crochet',
      size: 'Free Size',
      quantity: 1,
      price: totalPrice(),
      image: wrap.image,
      wrapping_id: wrap.id,
      wrapping_name: wrap.name,
      wrapping_price: Number(wrap.price),
      flowers: selectedFlowers.map((f) => ({ flower_id: f.id, flower_name: f.name, quantity: state.qty[f.id], price_per_unit: Number(f.price_per_unit) })),
    });

    showToast('Custom bouquet added to cart!', 'success');
  });

  paint();
}
