// Booth fast entry. Records offline sales into the same `orders` collection as
// website sales, with source: 'booth', so revenue and CRM segments stay correct
// without unioning two schemas.
//
// Optimised for standing at a stall with a phone in one hand: phone number
// first (it is the customer key everywhere else), then tap products, then save.

import {
  db,
  auth,
  collection,
  doc,
  setDoc,
  getDocs,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  serverTimestamp,
  escapeHtml
} from '/assets/js/firebase-app.js';

const ADMIN_EMAIL = String(window.SHRISH_APP_CONFIG?.adminEmailHint || 'contact@shrish.co').trim().toLowerCase();

const state = {
  products: [],
  category: 'all',
  search: '',
  cart: new Map(),          // key -> { key, name, price, qty, productId, variantId }
  customers: new Map(),     // phoneDigits -> { name, email, orders, spend }
  session: { count: 0, total: 0 },
  saving: false
};

/* ── helpers ──────────────────────────────────────────────────────── */

const digits = (value) => String(value || '').replace(/\D/g, '');
const money = (value) => `$${(Math.round(value * 100) / 100).toFixed(2)}`;

function priceNumber(value) {
  const parsed = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toast(message) {
  const node = document.getElementById('boothToast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => node.classList.remove('show'), 2600);
}

function formatPhone(value) {
  const d = digits(value).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/* ── products ─────────────────────────────────────────────────────── */

// Live prices from Firestore where available, falling back to the bundled
// catalogue so the booth still works on a bad connection.
function buildProductTiles(docs) {
  const base = Array.isArray(window.SHRISH_DATA?.products) ? window.SHRISH_DATA.products : [];
  const liveById = new Map(docs.map((entry) => [entry.id, entry]));

  const merged = base.map((product) => ({ ...product, ...(liveById.get(product.id) || {}) }));
  for (const [id, live] of liveById) {
    if (!merged.some((product) => product.id === id)) merged.push({ id, ...live });
  }

  const tiles = [];
  for (const product of merged) {
    if (product.available === false || product.displayOnly || product.hidden) continue;
    const category = String(product.category || 'other');

    if (Array.isArray(product.variants) && product.variants.length) {
      for (const variant of product.variants) {
        tiles.push({
          key: `${product.id}::${variant.id}`,
          productId: product.id,
          variantId: variant.id,
          category,
          name: `${product.name} — ${variant.label}`,
          shortName: `${product.name} (${variant.label})`,
          price: priceNumber(variant.price || product.price)
        });
      }
    } else {
      tiles.push({
        key: product.id,
        productId: product.id,
        variantId: '',
        category,
        name: product.name,
        shortName: product.name,
        price: priceNumber(product.price)
      });
    }
  }
  return tiles.filter((tile) => tile.name && tile.price > 0);
}

function renderCategories() {
  const cats = [...new Set(state.products.map((tile) => tile.category))].sort();
  document.getElementById('boothCats').innerHTML =
    [['all', 'All'], ...cats.map((c) => [c, c.replace(/[-_]/g, ' ')])]
      .map(([id, label]) =>
        `<button class="booth-cat ${state.category === id ? 'active' : ''}" type="button" data-cat="${escapeHtml(id)}">${escapeHtml(label)}</button>`)
      .join('');
}

function renderGrid() {
  const term = state.search.trim().toLowerCase();
  const list = state.products.filter((tile) =>
    (state.category === 'all' || tile.category === state.category)
    && (!term || tile.name.toLowerCase().includes(term)));

  document.getElementById('boothGrid').innerHTML = list.length
    ? list.map((tile) => {
        const qty = state.cart.get(tile.key)?.qty || 0;
        return `<button class="booth-item ${qty ? 'picked' : ''}" type="button" data-key="${escapeHtml(tile.key)}">
          ${qty ? `<span class="booth-item-qty">${qty}</span>` : ''}
          <span class="booth-item-name">${escapeHtml(tile.name)}</span>
          <span class="booth-item-price">${escapeHtml(money(tile.price))}</span>
        </button>`;
      }).join('')
    : '<div class="crm-empty">No products match.</div>';
}

/* ── cart ─────────────────────────────────────────────────────────── */

function cartTotal() {
  let total = 0;
  for (const line of state.cart.values()) total += line.price * line.qty;
  return total;
}

function addToCart(key, delta = 1) {
  const tile = state.products.find((entry) => entry.key === key);
  if (!tile) return;

  const existing = state.cart.get(key);
  const qty = (existing?.qty || 0) + delta;

  if (qty <= 0) state.cart.delete(key);
  else state.cart.set(key, { ...tile, qty });

  renderGrid();
  renderCart();
}

function renderCart() {
  const card = document.getElementById('boothCartCard');
  const lines = [...state.cart.values()];

  if (!lines.length) {
    card.style.display = 'none';
  } else {
    card.style.display = 'block';
    document.getElementById('boothCart').innerHTML = lines.map((line) => `
      <div class="booth-cart-row">
        <button class="booth-qty-btn" type="button" data-dec="${escapeHtml(line.key)}" aria-label="Remove one">−</button>
        <span class="booth-cart-line">${line.qty}</span>
        <button class="booth-qty-btn" type="button" data-inc="${escapeHtml(line.key)}" aria-label="Add one">+</button>
        <span class="booth-cart-name">${escapeHtml(line.shortName)}</span>
        <span class="booth-cart-line">${escapeHtml(money(line.price * line.qty))}</span>
      </div>`).join('');
  }

  const total = cartTotal();
  document.getElementById('boothTotal').textContent = money(total);
  document.getElementById('boothSave').disabled = !lines.length || state.saving;
}

/* ── customer lookup ──────────────────────────────────────────────── */

function lookupCustomer() {
  const key = digits(document.getElementById('boothPhone').value);
  const node = document.getElementById('boothLookup');
  node.className = 'booth-lookup';

  if (key.length < 10) {
    node.textContent = 'Enter a phone number to check for a returning customer.';
    return;
  }

  const known = state.customers.get(key.slice(-10));
  if (known) {
    node.classList.add('known');
    node.textContent = `Returning — ${known.name || 'no name saved'} · ${known.orders} order${known.orders === 1 ? '' : 's'} · ${money(known.spend)} lifetime`;
    const nameInput = document.getElementById('boothName');
    const emailInput = document.getElementById('boothEmail');
    if (!nameInput.value && known.name) nameInput.value = known.name;
    if (!emailInput.value && known.email) emailInput.value = known.email;
  } else {
    node.classList.add('fresh');
    node.textContent = 'New customer';
  }
}

/* ── save ─────────────────────────────────────────────────────────── */

async function saveSale() {
  if (state.saving || !state.cart.size) return;

  const phoneDigits = digits(document.getElementById('boothPhone').value).slice(-10);
  const rawName = String(document.getElementById('boothName').value || '').trim();
  const email = String(document.getElementById('boothEmail').value || '').trim();
  const location = document.getElementById('boothLocation').value;
  const paymentMethod = document.getElementById('boothPayment').value;

  if (phoneDigits && phoneDigits.length !== 10) {
    toast('Phone must be 10 digits, or leave it blank');
    return;
  }

  const [firstName, ...rest] = (rawName || 'Booth Customer').split(/\s+/);
  const lastName = rest.join(' ');
  const items = [...state.cart.values()].map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    name: line.shortName,
    qty: line.qty,
    price: line.price,
    lineTotal: Math.round(line.price * line.qty * 100) / 100
  }));
  const totalPrice = Math.round(cartTotal() * 100) / 100;
  const totalBoxes = items.reduce((sum, item) => sum + item.qty, 0);
  const paid = paymentMethod !== 'unpaid';

  state.saving = true;
  document.getElementById('boothSave').disabled = true;
  document.getElementById('boothSave').textContent = 'Saving...';

  try {
    await setDoc(doc(collection(db, 'orders')), {
      orderNumber: `BOOTH-${Date.now()}`,
      firstName,
      lastName,
      fullName: rawName || 'Booth Customer',
      phone: phoneDigits ? formatPhone(phoneDigits) : '',
      phoneDigits,
      email,
      fulfillmentType: 'pickup',
      location,
      locationLabel: location === 'booth' ? 'Booth / market' : location,
      items,
      totalBoxes,
      totalPrice,
      payment: paid ? 'paid' : 'pending',
      paymentMethod: paid ? paymentMethod : '',
      paymentStatus: paid ? 'paid' : 'pending',
      paymentCollected: paid,
      paymentCollectedAt: paid ? new Date().toISOString() : null,
      status: 'fulfilled',
      source: 'booth',
      skipCustomerEmail: true,
      referral: 'Booth sale',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Fold into the in-memory index so the next sale to the same phone shows
    // them as returning without a refetch.
    if (phoneDigits) {
      const prior = state.customers.get(phoneDigits) || { name: '', email: '', orders: 0, spend: 0 };
      state.customers.set(phoneDigits, {
        name: rawName || prior.name,
        email: email || prior.email,
        orders: prior.orders + 1,
        spend: prior.spend + totalPrice
      });
    }

    state.session.count += 1;
    state.session.total += totalPrice;
    clearForm();
    toast(`Saved ${money(totalPrice)}`);
  } catch (error) {
    console.error('Could not save booth sale', error);
    toast('Could not save — check connection');
  } finally {
    state.saving = false;
    document.getElementById('boothSave').textContent = 'Save sale';
    renderCart();
    renderTally();
  }
}

function clearForm() {
  state.cart.clear();
  document.getElementById('boothPhone').value = '';
  document.getElementById('boothName').value = '';
  document.getElementById('boothEmail').value = '';
  document.getElementById('boothSearch').value = '';
  state.search = '';
  lookupCustomer();
  renderGrid();
  renderCart();
}

function renderTally() {
  const { count, total } = state.session;
  document.getElementById('boothTally').textContent = count
    ? `${count} sale${count === 1 ? '' : 's'} this session · ${money(total)}`
    : 'No sales yet this session';
}

/* ── data load ────────────────────────────────────────────────────── */

async function loadData() {
  const [productSnap, orderSnap] = await Promise.all([
    getDocs(collection(db, 'products')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'orders')).catch(() => ({ docs: [] }))
  ]);

  state.products = buildProductTiles(productSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() })));

  for (const snap of orderSnap.docs) {
    const order = snap.data();
    if (['cancelled', 'no_show', 'awaiting_payment', 'payment_expired'].includes(order.status)) continue;
    if (order.isTestOrder) continue;
    const key = digits(order.phoneDigits || order.phone).slice(-10);
    if (key.length !== 10) continue;

    const prior = state.customers.get(key) || { name: '', email: '', orders: 0, spend: 0 };
    const name = String(order.fullName || `${order.firstName || ''} ${order.lastName || ''}`).trim();
    state.customers.set(key, {
      name: prior.name || name,
      email: prior.email || String(order.email || '').trim(),
      orders: prior.orders + 1,
      spend: prior.spend + priceNumber(order.totalPrice)
    });
  }

  renderCategories();
  renderGrid();
  renderCart();
  renderTally();
}

/* ── auth + wiring ────────────────────────────────────────────────── */

function setLoggedIn(isLoggedIn) {
  document.getElementById('loginScreen').style.display = isLoggedIn ? 'none' : 'flex';
  document.getElementById('boothApp').style.display = isLoggedIn ? 'block' : 'none';
}

async function doLogin() {
  const email = String(document.getElementById('crmEmail').value || '').trim();
  const password = String(document.getElementById('crmPassword').value || '');
  const err = document.getElementById('crmLoginErr');
  if (email.toLowerCase() !== ADMIN_EMAIL) { err.textContent = `Access is only available for ${ADMIN_EMAIL}.`; return; }
  err.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.warn('Booth login failed', error);
    err.textContent = 'Login failed. Check the email and password.';
  }
}

function wire() {
  document.getElementById('crmLoginBtn').addEventListener('click', doLogin);
  ['crmEmail', 'crmPassword'].forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doLogin();
    });
  });

  const phone = document.getElementById('boothPhone');
  phone.addEventListener('input', () => {
    const caretAtEnd = phone.selectionStart === phone.value.length;
    phone.value = formatPhone(phone.value);
    if (caretAtEnd) phone.setSelectionRange(phone.value.length, phone.value.length);
    lookupCustomer();
  });

  document.getElementById('boothSearch').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderGrid();
  });

  document.getElementById('boothCats').addEventListener('click', (event) => {
    const button = event.target.closest('[data-cat]');
    if (!button) return;
    state.category = button.dataset.cat;
    renderCategories();
    renderGrid();
  });

  document.getElementById('boothGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (button) addToCart(button.dataset.key, 1);
  });

  document.getElementById('boothCart').addEventListener('click', (event) => {
    const inc = event.target.closest('[data-inc]');
    if (inc) { addToCart(inc.dataset.inc, 1); return; }
    const dec = event.target.closest('[data-dec]');
    if (dec) addToCart(dec.dataset.dec, -1);
  });

  document.getElementById('boothClear').addEventListener('click', () => {
    if (state.cart.size && !window.confirm('Clear this sale?')) return;
    clearForm();
  });

  document.getElementById('boothSave').addEventListener('click', saveSale);
}

wire();

onAuthStateChanged(auth, async (user) => {
  if (!user) { setLoggedIn(false); return; }
  if (String(user.email || '').trim().toLowerCase() !== ADMIN_EMAIL) {
    setLoggedIn(false);
    await signOut(auth);
    return;
  }
  setLoggedIn(true);
  try {
    await loadData();
  } catch (error) {
    console.error('Could not load booth data', error);
    toast('Could not load products');
  }
});
