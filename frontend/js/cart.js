import { apiRequest, clearTokens, getRole, getUserName, isLoggedIn } from './api.js';
import { showToast, showConfirm } from './ui.js';

const CART_KEY = 'seren_cart';
export const getCart = () => JSON.parse(localStorage.getItem(CART_KEY) || '[]');
export const setCart = (items) => localStorage.setItem(CART_KEY, JSON.stringify(items));
export const clearCart = () => setCart([]);
export const getCartCount = () => getCart().reduce((n, i) => n + Number(i.quantity || 0), 0);

// An item "has print" when allowPrint is set AND at least one print field is non-empty.
// Uses loose != null to catch both null and undefined (handles printNumber=0 correctly).
export const hasPrint = (i) =>
  !!(i.allowPrint && (i.printName?.trim() || i.printNumber != null));

// Total includes a flat Rs 300 surcharge per print item (qty is always 1 for print items)
export const getCartTotal = () =>
  getCart().reduce((n, i) => n + Number(i.price) * Number(i.quantity) + (hasPrint(i) ? 300 * Number(i.quantity) : 0), 0);

// ── Delivery state (in-memory, not persisted) ─────────────────────────────────
let _deliveryLocationId   = null;
let _deliveryCharge       = 0;
let _deliveryName         = '';
let _deliveryDistrict     = '';
let _deliveryNotes        = '';

const requireCustomer = () => {
  if (!isLoggedIn() || getRole() !== 'customer') {
    location.href = `./login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return false;
  }
  return true;
};

export const syncCartCount = () => {
  const count    = getCartCount();
  const loggedIn = isLoggedIn();
  const asCustomer = loggedIn && getRole() === 'customer';
  const isInDash   = location.pathname.includes('/dashboard/');
  const homeHref   = isInDash ? '../index.html' : './index.html';

  // ── Login / Register links (shown when logged out) ───────────────────────
  document.querySelectorAll('.login-link').forEach(el => {
    el.style.display = loggedIn ? 'none' : '';
  });
  document.querySelectorAll('.register-link').forEach(el => {
    el.style.display = loggedIn ? 'none' : '';
  });

  // ── Logout buttons ────────────────────────────────────────────────────────
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.style.display = loggedIn ? '' : 'none';
    btn.onclick = () => { clearTokens(); location.href = homeHref; };
  });

  // ── Legacy my-orders-link (kept for any page still using it) ─────────────
  document.querySelectorAll('.my-orders-link').forEach(el => {
    el.style.display = asCustomer ? '' : 'none';
  });

  // ── NEW: profile wrap (icon + dropdown) ───────────────────────────────────
  const profileWrap = document.getElementById('profileWrap');
  if (profileWrap) {
    profileWrap.style.display = loggedIn ? '' : 'none';

    // Wire up dropdown toggle (idempotent — skip if already wired)
    const profileBtn      = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileBtn && profileDropdown && !profileBtn.dataset.wired) {
      profileBtn.dataset.wired = '1';
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('pd-open');
      });
      document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
          profileDropdown.classList.remove('pd-open');
        }
      });
    }
  }

  // ── Cart hover dropdown (wire once) ──────────────────────────────────────
  if (!document.querySelector('.cart-drop')) initCartDropdown();

  // ── Cart link (customers only) ────────────────────────────────────────────
  document.querySelectorAll('.cart-link').forEach(link => {
    if (link.classList.contains('icon-btn')) {
      // New icon-based cart link — hide entirely for non-customers
      link.style.display = asCustomer ? '' : 'none';
      const badge = link.querySelector('.cart-badge') || link.querySelector('span');
      if (badge) {
        badge.textContent = count;
        badge.style.display = asCustomer && count > 0 ? '' : 'none';
      }
    } else {
      // Legacy text-based cart link
      const badge = link.querySelector('span') || (() => {
        const s = document.createElement('span'); link.append(' ', s); return s;
      })();
      if (asCustomer) {
        link.style.display = '';
        link.href = './cart.html';
        if (link.childNodes[0]?.nodeValue !== undefined) link.childNodes[0].nodeValue = 'Cart ';
        badge.style.display = 'inline-grid';
        badge.textContent = count;
      } else {
        link.style.display = 'none';
      }
    }
  });
};

// ── Cart hover dropdown ───────────────────────────────────────────────────────
const CART_DROP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#333" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.16"/><line x1="10" y1="10" x2="14" y2="14"/><line x1="14" y1="10" x2="10" y2="14"/></svg>`;

export function initCartDropdown() {
  const cartLink = document.querySelector('.cart-link.icon-btn');
  if (!cartLink || cartLink.dataset.dropWired) return;
  cartLink.dataset.dropWired = '1';

  // Create dropdown element
  const drop = document.createElement('div');
  drop.className = 'cart-drop';
  // Position relative to nav-cta wrapper, not the icon itself
  cartLink.style.position = 'relative';
  cartLink.appendChild(drop);

  function renderDrop() {
    const cart = getCart();
    if (!cart.length) {
      drop.innerHTML = `
        <div class="cart-drop-empty">
          ${CART_DROP_SVG}
          <p>Shopping cart is empty</p>
          <a class="cart-drop-continue" href="./kits.html">CONTINUE SHOPPING</a>
        </div>`;
    } else {
      const rows = cart.slice(0, 4).map(i => {
        const printOn = hasPrint(i);
        const linePrice = Number(i.price) * Number(i.quantity) + (printOn ? 300 * Number(i.quantity) : 0);
        const metaParts = [];
        if (i.size && i.size !== 'Free Size' && i.size !== 'No Size') metaParts.push(i.size);
        if (printOn) metaParts.push('✏️ Print');
        return `
        <div class="cart-drop-item">
          <img src="${i.image || ''}" alt="${i.productName}" />
          <div class="cart-drop-info">
            <p class="cart-drop-name">${i.productName}</p>
            <p class="cart-drop-meta">${metaParts.length ? metaParts.join(' · ') + ' · ' : ''}×${i.quantity}</p>
          </div>
          <p class="cart-drop-price">NPR ${linePrice.toLocaleString()}</p>
        </div>`;
      }).join('');

      const more = cart.length > 4 ? `<p class="cart-drop-more">+${cart.length - 4} more item${cart.length - 4 > 1 ? 's' : ''}</p>` : '';

      drop.innerHTML = `
        <div class="cart-drop-items">${rows}${more}</div>
        <div class="cart-drop-subtotal">
          <span>Subtotal</span>
          <strong>NPR ${getCartTotal().toLocaleString()}</strong>
        </div>
        <a class="cart-drop-btn" href="./cart.html">VIEW CART →</a>`;
    }
  }

  let closeTimer;
  const open  = () => { clearTimeout(closeTimer); renderDrop(); drop.classList.add('open'); };
  const close = () => { closeTimer = setTimeout(() => drop.classList.remove('open'), 180); };

  cartLink.addEventListener('mouseenter', open);
  cartLink.addEventListener('mouseleave', (e) => { if (!drop.contains(e.relatedTarget)) close(); });
  drop.addEventListener('mouseenter', () => clearTimeout(closeTimer));
  drop.addEventListener('mouseleave', close);
}

export const addToCart = (item) => {
  if (!requireCustomer()) return;
  const cart = getCart();

  if (hasPrint(item)) {
    // Print items are unique custom pieces — never merge, always qty = 1
    item.quantity = 1;
    cart.push(item);
  } else {
    // Normal items merge by productId:size (only with other non-print entries)
    const key = `${item.productId}:${item.size}`;
    const idx = cart.findIndex((x) => !hasPrint(x) && `${x.productId}:${x.size}` === key);
    if (idx >= 0) cart[idx].quantity += item.quantity;
    else cart.push(item);
  }

  setCart(cart);
  syncCartCount();
};

export const removeFromCart = (index) => {
  const cart = getCart();
  cart.splice(index, 1);
  setCart(cart);
};

export const updateQuantity = (index, newQty) => {
  const cart = getCart();
  if (!cart[index]) return;
  cart[index].quantity = Math.max(1, Number(newQty || 1));
  setCart(cart);
};

export const renderCart = (rootId = 'cartRoot') => {
  const root = document.getElementById(rootId);
  if (!root) return;

  if (!isLoggedIn() || getRole() !== 'customer') {
    root.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <h2>Please log in to view your cart</h2>
        <p>You need a customer account to add items and place orders.</p>
        <a class="btn" href="./login.html">Log In</a>
      </div>`;
    return;
  }

  const cart = getCart();
  if (!cart.length) {
    root.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛍️</div>
        <h2>Your cart is empty</h2>
        <p>Looks like you haven't added anything yet.</p>
        <div style="display:flex;gap:0.8rem;justify-content:center;flex-wrap:wrap">
          <a class="btn" href="./kits.html">Browse Kits</a>
          <a class="btn btn-outline" href="./clothing.html">Browse Clothing</a>
        </div>
      </div>`;
    return;
  }

  const rows = cart.map((i, idx) => {
    const printOn = hasPrint(i);
    const printParts = [
      i.printName?.trim() || '',
      (i.printNumber !== null && i.printNumber !== undefined) ? `#${i.printNumber}` : '',
    ].filter(Boolean);
    const printTag = printOn
      ? `<p class="cart-row-print">✏️ ${printParts.join(' · ')} <span class="print-surcharge">+NPR 300</span></p>`
      : '';
    const linePrice = Number(i.price) * Number(i.quantity) + (printOn ? 300 * Number(i.quantity) : 0);
    const sizeLabel = (i.size && i.size !== 'Free Size' && i.size !== 'No Size') ? i.size : '';

    const qtyBlock = printOn
      ? `<div class="cart-row-qty cart-qty-locked"><span>${i.quantity}</span><span class="cart-qty-note">custom</span></div>`
      : `<div class="cart-row-qty">
           <button class="qty-btn" data-dec="${idx}">−</button>
           <span>${i.quantity}</span>
           <button class="qty-btn" data-inc="${idx}">+</button>
         </div>`;

    return `
    <div class="cart-row">
      <img class="cart-row-img" src="${i.image}" alt="${i.productName}" />
      <div class="cart-row-info">
        <p class="cart-row-name">${i.productName}</p>
        ${sizeLabel ? `<p class="cart-row-size">${sizeLabel}</p>` : ''}
        ${printTag}
      </div>
      ${qtyBlock}
      <p class="cart-row-price">NPR ${linePrice.toLocaleString()}</p>
      <button class="cart-row-remove" data-rm="${idx}" title="Remove">✕</button>
    </div>`;
  }).join('');

  // Compute breakdown values
  const subtotal     = cart.reduce((n, i) => n + Number(i.price) * Number(i.quantity), 0);
  const printCharges = cart.reduce((n, i) => n + (hasPrint(i) ? 300 * Number(i.quantity) : 0), 0);
  const grandTotal   = subtotal + printCharges + _deliveryCharge;

  const printRow = printCharges > 0
    ? `<div class="summary-row"><span>Print charges</span><span>NPR ${printCharges.toLocaleString()}</span></div>`
    : '';
  const deliveryDisplay = _deliveryCharge > 0
    ? `NPR ${_deliveryCharge.toLocaleString()}`
    : `<span class="text-muted" style="font-size:0.85rem">Select delivery area</span>`;

  const selectedHTML = _deliveryLocationId
    ? `<p class="delivery-selected" id="deliverySelected">&#10003; ${_deliveryName}${_deliveryDistrict ? ', ' + _deliveryDistrict : ''} — Rs.${_deliveryCharge}</p>`
    : `<p class="delivery-selected" id="deliverySelected" style="display:none"></p>`;

  root.innerHTML = `
    <div class="cart-wrap">
      <div class="cart-items">
        <h2 class="cart-title">Your Cart <span class="cart-count-badge">${cart.length}</span></h2>
        <div class="cart-rows">${rows}</div>
      </div>
      <aside class="cart-summary">
        <h3>Order Summary</h3>
        <div class="summary-row"><span>Subtotal</span><span>NPR ${subtotal.toLocaleString()}</span></div>
        ${printRow}
        <div class="summary-row"><span>Delivery</span><span id="deliveryChargeDisplay">${deliveryDisplay}</span></div>
        <div class="summary-divider"></div>
        <div class="summary-row summary-total"><span>Total</span><strong id="grandTotalDisplay">NPR ${grandTotal.toLocaleString()}</strong></div>
        <div class="checkout-fields">
          <label class="checkout-label">Delivery Area *</label>
          <div class="delivery-search-wrap" style="position:relative">
            <input id="deliverySearch" class="checkout-input"
              placeholder="Search your area…"
              autocomplete="off"
              value="${_deliveryLocationId ? _deliveryName : ''}" />
            <ul id="deliveryDropdown" class="delivery-drop" style="display:none"></ul>
          </div>
          ${selectedHTML}
          <p id="deliveryError" class="error" style="display:none;margin-top:0.3rem">Please select your delivery area</p>

          <label class="checkout-label" style="margin-top:0.8rem">Drop a landmark or address hint <span class="text-muted" style="font-weight:400">(optional)</span></label>
          <textarea id="deliveryNotes" class="checkout-input checkout-textarea"
            placeholder="e.g. Near the blue gate, 2nd floor, landmark…">${_deliveryNotes}</textarea>

          <label class="checkout-label" style="margin-top:0.8rem">Mobile Number *</label>
          <input id="phone" class="checkout-input" placeholder="+977 98XXXXXXXX" required />
        </div>
        <button id="placeOrder" class="btn" style="width:100%;margin-top:0.5rem">Place Order</button>
        <p class="summary-note">Payment is collected on delivery</p>
      </aside>
    </div>`;

  // ── Qty / remove controls ─────────────────────────────────────────────────
  root.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    _deliveryNotes = document.getElementById('deliveryNotes')?.value || _deliveryNotes;
    updateQuantity(Number(b.dataset.dec), getCart()[Number(b.dataset.dec)].quantity - 1);
    renderCart(rootId); syncCartCount();
  }));
  root.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
    _deliveryNotes = document.getElementById('deliveryNotes')?.value || _deliveryNotes;
    updateQuantity(Number(b.dataset.inc), getCart()[Number(b.dataset.inc)].quantity + 1);
    renderCart(rootId); syncCartCount();
  }));
  root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    _deliveryNotes = document.getElementById('deliveryNotes')?.value || _deliveryNotes;
    removeFromCart(Number(b.dataset.rm));
    renderCart(rootId); syncCartCount();
  }));

  // ── Delivery search ───────────────────────────────────────────────────────
  const searchInput  = document.getElementById('deliverySearch');
  const dropdown     = document.getElementById('deliveryDropdown');
  const selectedEl   = document.getElementById('deliverySelected');
  const errorEl      = document.getElementById('deliveryError');
  const chargeDisplay = document.getElementById('deliveryChargeDisplay');
  const totalDisplay  = document.getElementById('grandTotalDisplay');

  const updateTotals = () => {
    const c = cart.reduce((n, i) => n + Number(i.price) * Number(i.quantity), 0)
            + cart.reduce((n, i) => n + (hasPrint(i) ? 300 * Number(i.quantity) : 0), 0)
            + _deliveryCharge;
    if (chargeDisplay) chargeDisplay.innerHTML = _deliveryCharge > 0
      ? `NPR ${_deliveryCharge.toLocaleString()}`
      : `<span class="text-muted" style="font-size:0.85rem">Select delivery area</span>`;
    if (totalDisplay) totalDisplay.textContent = `NPR ${c.toLocaleString()}`;
  };

  const selectLocation = (loc) => {
    _deliveryLocationId = loc.id;
    _deliveryCharge     = loc.charge;
    _deliveryName       = loc.name;
    _deliveryDistrict   = loc.district || '';
    searchInput.value   = loc.name;
    dropdown.style.display = 'none';
    if (selectedEl) {
      selectedEl.textContent = `✓ ${loc.name}${loc.district ? ', ' + loc.district : ''} — Rs.${loc.charge}`;
      selectedEl.style.display = '';
    }
    if (errorEl) errorEl.style.display = 'none';
    updateTotals();
  };

  let searchTimer;
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (_deliveryLocationId && searchInput.value !== _deliveryName) {
      _deliveryLocationId = null;
      _deliveryCharge     = 0;
      _deliveryName       = '';
      _deliveryDistrict   = '';
      if (selectedEl) selectedEl.style.display = 'none';
      updateTotals();
    }
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        const results = await apiRequest(`/api/delivery/search/?q=${encodeURIComponent(q)}`);
        if (!results.length) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = results.map(loc =>
          `<li class="delivery-drop-item" data-id="${loc.id}" data-charge="${loc.charge}"
               data-name="${loc.name.replace(/"/g, '&quot;')}"
               data-district="${(loc.district || '').replace(/"/g, '&quot;')}">
             <span class="delivery-drop-name">${loc.name}</span>
             <span class="delivery-drop-meta">${loc.district ? loc.district + ' — ' : ''}Rs.${loc.charge}</span>
           </li>`
        ).join('');
        dropdown.style.display = '';
        dropdown.querySelectorAll('.delivery-drop-item').forEach(li => {
          li.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectLocation({
              id: Number(li.dataset.id),
              charge: Number(li.dataset.charge),
              name: li.dataset.name,
              district: li.dataset.district,
            });
          });
        });
      } catch (err) { console.error('[delivery search]', err); dropdown.style.display = 'none'; }
    }, 250);
  });

  searchInput?.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));
  searchInput?.addEventListener('focus', () => {
    if (searchInput.value.length >= 2 && !_deliveryLocationId) searchInput.dispatchEvent(new Event('input'));
  });

  // ── Place order ───────────────────────────────────────────────────────────
  const placeBtn = document.getElementById('placeOrder');
  placeBtn?.addEventListener('click', async () => {
    const customer_phone = document.getElementById('phone').value.trim();
    if (!customer_phone) { showToast('Phone number is required.', 'warning'); return; }

    if (!_deliveryLocationId) {
      if (errorEl) errorEl.style.display = '';
      searchInput?.focus();
      return;
    }

    const currentNotes = document.getElementById('deliveryNotes').value.trim();

    const items = getCart().map((i) => ({
      product: i.type === 'custom_bouquet' ? undefined : i.productId,
      product_name: i.productName,
      size: i.size,
      quantity: i.quantity,
      // Fold the Rs 300 print surcharge into the stored price so the backend
      // total is correct and the receipt shows the all-in price per jersey.
      price: hasPrint(i) ? Number(i.price) + 300 : Number(i.price),
      is_custom_bouquet_item: i.type === 'custom_bouquet',
      print_name: i.printName || '',
      print_number: (i.printNumber !== null && i.printNumber !== undefined) ? i.printNumber : null,
    }));

    const displayTotal = subtotal + printCharges + _deliveryCharge;
    const confirmed = await showConfirm(`Total: NPR ${displayTotal.toLocaleString()} · Cash on Delivery`, {
      title: 'Place Order?',
      confirmLabel: 'Place Order',
      cancelLabel: 'Go Back',
    });
    if (!confirmed) return;

    try {
      const order = await apiRequest('/api/orders/', 'POST', {
        customer_phone,
        delivery_location_id: _deliveryLocationId,
        delivery_charge: _deliveryCharge,
        delivery_notes: currentNotes,
        items,
      }, true);
      clearCart();
      _deliveryLocationId = null;
      _deliveryCharge     = 0;
      _deliveryName       = '';
      _deliveryDistrict   = '';
      _deliveryNotes      = '';
      syncCartCount();
      showToast(`Order placed! Order #${order.id}`, 'success');
      setTimeout(() => { location.href = './index.html'; }, 1800);
    } catch (err) {
      showToast(err?.payload?.detail || err?.payload?.delivery_location_id?.[0] || err.message || 'Order placement failed.', 'error');
    }
  });
};
