// ============================================================
// SHRISH LLC â Main JavaScript v3.1
// Update SHRISH_CONFIG below with your real links
// ============================================================
const SHRISH_CONFIG = {
  whatsappNumber: '17653255577',
  whatsappGroup: 'https://chat.whatsapp.com/EHk3KbL03s4J9zfFIeEOi9', // â WhatsApp group link
  instagram: 'https://www.instagram.com/shrish_llc/',                        // Instagram
  whatsappMessage: "Hi Shrish! I'd like to know more about your mangoes ð¥­"
};

function trackShrishEvent(eventName, props = {}) {
  window.SHRISH_ANALYTICS?.track(eventName, props);
}

// ââ INJECT GLOBAL UI (runs on every page) âââââââââââââââââ
const GEET_SESSION_KEY = 'shrish_geet_conversation_v1';
let productDataLoadPromise = null;

const GEET_RESPONSES = {
  sweet: {
    text: "For something sweet, I would start with Alphonso or Kesar mangoes when they are available. If you want sweets, our Putharekulu and mango jelly are the easiest crowd-pleasers.",
    chips: [
      { label: "Shop mangoes", href: "shop.html?category=mangoes" },
      { label: "Shop sweets", href: "shop.html?category=sweets" }
    ]
  },
  tangy: {
    text: "Tangy-sweet is a lovely lane. Look for Langra or Neelam mangoes in season, or try mango jelly for a chewy fruit-sweet option. If you like more punch, the pickle section is perfect.",
    chips: [
      { label: "Tangy picks", href: "shop.html?category=mangoes" },
      { label: "Pickles and podi", href: "shop.html?category=picklespodi" }
    ]
  },
  spicy: {
    text: "If you want spice, I would guide you to our Andhra-style pickles and podi. Mango avakai, gongura, tomato pickle, and idli podi are good places to begin.",
    chips: [
      { label: "Shop spicy items", href: "shop.html?category=picklespodi" },
      { label: "Ask on WhatsApp", href: `https://wa.me/${SHRISH_CONFIG.whatsappNumber}?text=${encodeURIComponent("Hi Shrish! Geet helped me find spicy items. Can you recommend what is available today?")}`, external: true }
    ]
  },
  squeeze: {
    text: "For squeeze-and-eat or juicy mangoes, look for Rasalu, Payari, Dasheri, or other juicy seasonal varieties in the mango section.",
    chips: [
      { label: "Shop mangoes", href: "shop.html?category=mangoes" },
      { label: "Ask on WhatsApp", href: `https://wa.me/${SHRISH_CONFIG.whatsappNumber}?text=${encodeURIComponent("Hi Shrish! Which mango is best for squeeze-and-eat today?")}`, external: true }
    ]
  },
  healthy: {
    text: "For lighter choices, look for sugar-free Putharekulu, natural-sweet dates or palm-jaggery sweets, and protein-rich podi options.",
    chips: [
      { label: "Healthy sweets", href: "shop.html?category=sweets" },
      { label: "Podi options", href: "shop.html?category=picklespodi&type=podi" }
    ]
  },
  ordering: {
    text: "Ordering is simple: choose items in the shop, add them to cart, select pickup, and pay at pickup. Pickup is available in Short Pump, Chesterfield, and Mechanicsville.",
    chips: [
      { label: "Start order", href: "shop.html" },
      { label: "Contact us", href: "contact.html" }
    ]
  },
  available: {
    text: "The shop page shows the latest available items and sold-out items. For today's freshest recommendation, you can also message Shrish directly on WhatsApp.",
    chips: [
      { label: "View shop", href: "shop.html" },
      { label: "WhatsApp Shrish", href: `https://wa.me/${SHRISH_CONFIG.whatsappNumber}?text=${encodeURIComponent("Hi Shrish! Can you tell me what is available today?")}`, external: true }
    ]
  },
  fallback: {
    text: "I can help you find something sweet, tangy-sweet, spicy, or help you place an order. What sounds good today?",
    chips: [
      { label: "Sweet", action: "sweet" },
      { label: "Tangy sweet", action: "tangy" },
      { label: "Spicy", action: "spicy" },
      { label: "Squeeze and eat", action: "squeeze" },
      { label: "Healthy choice", action: "healthy" },
      { label: "Ordering help", action: "ordering" }
    ]
  }
};

function classifyGeetMessage(message) {
  const text = String(message || '').toLowerCase();
  if (/order|cart|pickup|pay|checkout|location|where/.test(text)) return 'ordering';
  if (/available|today|stock|fresh|now/.test(text)) return 'available';
  if (/healthy|diabetic|sugar\s*free|less sugar|protein|natural|palm jaggery/.test(text)) return 'healthy';
  if (/squeeze|suck|juice|juicy|pulp|aamras/.test(text)) return 'squeeze';
  if (/spice|spicy|hot|pickle|podi|avakai|gongura/.test(text)) return 'spicy';
  if (/tangy|tart|sour|sweet.*tangy|tangy.*sweet/.test(text)) return 'tangy';
  if (/sweet|mango|alphonso|kesar|putharekulu|jelly|dessert/.test(text)) return 'sweet';
  return 'fallback';
}

function getGeetRecommendation(action) {
  return GEET_RESPONSES[action] || GEET_RESPONSES.fallback;
}

const GEET_INTENTS = {
  sweet: {
    intro: "I matched your sweet craving against the product tags. These are the best fits:",
    tags: ["sweet", "very sweet", "honey sweet", "jaggery sweet", "natural sweet", "mango sweet", "dessert", "aamras", "milkshake", "putharekulu", "jelly"],
    categories: ["mangoes", "putharekulu", "jellysnacks"],
    shopHref: "shop.html?category=sweets"
  },
  tangy: {
    intro: "For tangy-sweet flavor, I looked for tags like tangy, sweet-tart, raw mango, and Andhra-style pickle:",
    tags: ["tangy", "sweet tart", "sweet tangy", "tangy sweet", "very tangy", "raw mango", "tamarind", "gongura", "pickle"],
    categories: ["mangoes", "picklespodi", "jellysnacks"],
    shopHref: "shop.html?category=picklespodi"
  },
  spicy: {
    intro: "For spice lovers, I ranked products tagged spicy, hot, very spicy, Andhra classic, podi, and pickle:",
    tags: ["spicy", "hot", "very spicy", "extra hot", "medium hot", "andhra classic", "podi", "pickle", "avakai", "gongura"],
    categories: ["picklespodi"],
    shopHref: "shop.html?category=picklespodi"
  },
  healthy: {
    intro: "For a lighter or health-minded choice, I looked for tags like healthy choice, diabetic friendly, protein rich, natural sweet, and curry leaf:",
    tags: ["healthy choice", "diabetic friendly", "less sugar", "protein rich", "natural sweet", "curry leaf", "leaf powder", "podi", "palm jaggery"],
    categories: ["putharekulu", "jellysnacks", "picklespodi"],
    shopHref: "shop.html?category=sweets"
  },
  squeeze: {
    intro: "For squeeze-and-eat mangoes or juicy pulp-style picks, these tags matched best:",
    tags: ["squeeze and eat", "extremely juicy", "juicy", "pulpy", "juice mango", "aamras", "mango pulp"],
    categories: ["mangoes"],
    shopHref: "shop.html?category=mangoes"
  },
  ordering: {
    intro: "For ordering help, start in the shop. These available items are easy to add to cart now:",
    tags: ["available", "best seller", "family friendly", "everyday", "gifting", "combo friendly"],
    categories: ["mangoes", "putharekulu", "jellysnacks", "picklespodi"],
    shopHref: "shop.html"
  },
  available: {
    intro: "I prioritized items marked available now and then matched the most useful tags:",
    tags: ["available", "best seller", "most requested", "family friendly", "everyday", "gifting"],
    categories: ["mangoes", "putharekulu", "jellysnacks", "picklespodi"],
    shopHref: "shop.html"
  }
};

function getGeetCategoryFilter(product) {
  if (product.category === 'putharekulu' || product.category === 'jellysnacks') return 'sweets';
  return product.category || 'all';
}

function normalizeGeetText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function geetProductHaystack(product) {
  return normalizeGeetText([
    product.name,
    product.category,
    product.filterGroup,
    product.origin,
    product.tag,
    product.taste,
    product.bestFor,
    product.description,
    ...(product.badges || []),
    ...(product.recommendationTags || [])
  ].filter(Boolean).join(' '));
}

function scoreGeetProduct(product, intent, userText = '') {
  const haystack = geetProductHaystack(product);
  const terms = [
    ...(intent.tags || []),
    ...normalizeGeetText(userText).split(' ').filter((word) => word.length > 2)
  ];
  let score = 0;

  if (product.available && !product.displayOnly) score += 6;
  if (product.preorderOnly) score -= 2;
  if ((intent.categories || []).includes(product.category)) score += 4;
  if (product.category === 'putharekulu' && intent.categories?.includes('jellysnacks')) score += 2;
  if (product.category === 'jellysnacks' && intent.categories?.includes('putharekulu')) score += 2;

  terms.forEach((term) => {
    const normalized = normalizeGeetText(term);
    if (!normalized) return;
    if (haystack.includes(normalized)) score += normalized.length > 8 ? 5 : 3;
  });

  if (/very|extra|hot|spicy/.test(haystack) && terms.some((term) => /spicy|hot/.test(term))) score += 4;
  if (/squeeze and eat|extremely juicy|juice mango|pulpy/.test(haystack) && terms.some((term) => /juicy|squeeze|pulp/.test(term))) score += 4;
  if (/diabetic friendly|less sugar|healthy choice|protein rich/.test(haystack) && terms.some((term) => /healthy|sugar|protein/.test(term))) score += 4;

  return score;
}

function getGeetProductRecommendations(action, userText = '') {
  const intent = GEET_INTENTS[action] || GEET_INTENTS.available;
  const products = window.SHRISH_DATA?.products || [];
  return products
    .filter((product) => !product.hidden && !product.displayOnly)
    .map((product) => ({ product, score: scoreGeetProduct(product, intent, userText) }))
    .filter((entry) => entry.score > 4)
    .sort((a, b) => b.score - a.score || Number(Boolean(b.product.available)) - Number(Boolean(a.product.available)))
    .slice(0, 3)
    .map((entry) => entry.product);
}

function geetProductSummary(product) {
  const tags = (product.recommendationTags || []).slice(0, 4).join(', ');
  const status = product.available && !product.displayOnly ? 'Available now' : product.preorderOnly ? 'Preorder' : 'Not available now';
  return `${product.name} (${status}) - ${tags}`;
}

function getGeetProductHref(product) {
  return `shop.html?category=${encodeURIComponent(getGeetCategoryFilter(product))}&product=${encodeURIComponent(product.id)}`;
}

function buildGeetResponse(action, userText = '') {
  const fallback = getGeetRecommendation(action);
  if (!window.SHRISH_DATA?.products?.length || !GEET_INTENTS[action]) return fallback;

  const intent = GEET_INTENTS[action];
  const products = getGeetProductRecommendations(action, userText);
  if (!products.length) return fallback;

  return {
    text: `${intent.intro} ${products.map(geetProductSummary).join(' | ')}`,
    chips: [
      ...products.map((product) => ({ label: product.name.replace(/\s*\(.+?\)\s*/g, '').slice(0, 28), href: getGeetProductHref(product) })),
      { label: "View matching section", href: intent.shopHref },
      { label: "Ask on WhatsApp", href: `https://wa.me/${SHRISH_CONFIG.whatsappNumber}?text=${encodeURIComponent(`Hi Shrish! Geet recommended ${products.map((product) => product.name).join(', ')}. What is best for me today?`)}`, external: true }
    ]
  };
}

function buildProductSearchUrl(query) {
  const normalized = String(query || '').trim();
  return normalized ? `shop.html?search=${encodeURIComponent(normalized)}` : 'shop.html';
}

function ensureProductSearchData() {
  if (window.SHRISH_DATA?.products?.length) return Promise.resolve();
  if (productDataLoadPromise) return productDataLoadPromise;

  productDataLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src$="data.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'data.js';
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return productDataLoadPromise;
}

function normalizeProductSearchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getProductSearchCategory(product) {
  if (product.category === 'putharekulu' || product.category === 'jellysnacks') return 'sweets';
  return product.category || 'all';
}

function productSearchHaystack(product) {
  return normalizeProductSearchText([
    product.name,
    product.localName,
    product.origin,
    product.category,
    product.filterGroup,
    product.tag,
    product.taste,
    product.bestFor,
    product.description,
    ...(product.badges || []),
    ...(product.recommendationTags || [])
  ].filter(Boolean).join(' '));
}

function getLiveProductMatches(query) {
  const normalized = normalizeProductSearchText(query);
  if (normalized.length < 2) return [];
  const terms = normalized.split(' ').filter((term) => term.length > 1);
  return (window.SHRISH_DATA?.products || [])
    .filter((product) => !product.hidden && terms.every((term) => productSearchHaystack(product).includes(term)))
    .sort((a, b) => Number(Boolean(b.available && !b.displayOnly)) - Number(Boolean(a.available && !a.displayOnly)))
    .slice(0, 6);
}

function productSearchHref(product, query) {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  params.set('category', getProductSearchCategory(product));
  params.set('product', product.id);
  return `shop.html?${params.toString()}`;
}

function renderLiveSearchResults(form, query) {
  let resultsEl = form.querySelector('.product-search-results');
  if (!resultsEl) {
    resultsEl = document.createElement('div');
    resultsEl.className = 'product-search-results';
    form.appendChild(resultsEl);
  }

  const matches = getLiveProductMatches(query);
  if (!matches.length) {
    resultsEl.innerHTML = normalizeProductSearchText(query).length >= 2
      ? `<div class="product-search-empty">No matches yet. Try sweet, spicy, podi, mango, avakai.</div>`
      : '';
    resultsEl.classList.toggle('open', Boolean(resultsEl.innerHTML));
    return;
  }

  resultsEl.innerHTML = matches.map((product) => {
    const tags = (product.recommendationTags || product.badges || []).slice(0, 3).join(' · ');
    const status = product.available && !product.displayOnly ? 'Available' : product.preorderOnly ? 'Preorder' : 'Not available';
    return `<a href="${productSearchHref(product, query)}">
      <span class="psr-name">${product.name}</span>
      <span class="psr-meta">${status}${tags ? ` · ${tags}` : ''}</span>
    </a>`;
  }).join('');
  resultsEl.classList.add('open');
}

function bindLiveProductSearch(form) {
  const input = form?.querySelector('input[type="search"]');
  if (!form || !input) return;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    document.querySelectorAll('.nav-product-search input, .mobile-product-search input').forEach((otherInput) => {
      if (otherInput !== input) otherInput.value = input.value;
    });
    window.dispatchEvent(new CustomEvent('shrish:product-search', { detail: { query } }));
    ensureProductSearchData().then(() => renderLiveSearchResults(form, query));
  });

  input.addEventListener('focus', () => {
    ensureProductSearchData().then(() => renderLiveSearchResults(form, input.value.trim()));
  });

  form.addEventListener('submit', (event) => {
    const onShopPage = Boolean(document.getElementById('shopContent'));
    if (!onShopPage) return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('shrish:product-search', { detail: { query: input.value.trim() } }));
  });
}

function injectProductSearch() {
  const navInner = document.querySelector('.nav-inner');
  const navCartWrap = document.querySelector('.nav-cart-wrap');
  if (navInner && navCartWrap && !document.getElementById('navProductSearch')) {
    const currentSearch = new URLSearchParams(window.location.search).get('search') || '';
    const searchForm = document.createElement('form');
    searchForm.id = 'navProductSearch';
    searchForm.className = 'nav-product-search';
    searchForm.action = 'shop.html';
    searchForm.method = 'get';
    searchForm.setAttribute('role', 'search');
    searchForm.innerHTML = `
      <input type="search" id="navProductSearchInput" name="search" placeholder="Search products" aria-label="Search products">
      <button type="submit" aria-label="Search products">Search</button>
    `;
    navInner.insertBefore(searchForm, navCartWrap);
    document.body.classList.add('nav-has-search');
    const desktopInput = searchForm.querySelector('input');
    if (desktopInput) desktopInput.value = currentSearch;
    bindLiveProductSearch(searchForm);
  }

  const navMobile = document.getElementById('navMobile');
  if (navMobile && !document.getElementById('mobileProductSearch')) {
    const currentSearch = new URLSearchParams(window.location.search).get('search') || '';
    const mobileForm = document.createElement('form');
    mobileForm.id = 'mobileProductSearch';
    mobileForm.className = 'mobile-product-search';
    mobileForm.action = 'shop.html';
    mobileForm.method = 'get';
    mobileForm.setAttribute('role', 'search');
    mobileForm.innerHTML = `
      <input type="search" name="search" placeholder="Search products" aria-label="Search products">
      <button type="submit">Search</button>
    `;
    navMobile.appendChild(mobileForm);
    const mobileInput = mobileForm.querySelector('input');
    if (mobileInput) mobileInput.value = currentSearch;
    bindLiveProductSearch(mobileForm);
  }
}

function getSessionCartCount() {
  try {
    const cart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
    return cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  } catch (error) {
    return 0;
  }
}

function injectGlobalCartShortcut() {
  if (document.getElementById('cartFab') || document.getElementById('globalCartFab')) return;
  const total = getSessionCartCount();
  const cartLink = document.createElement('a');
  cartLink.id = 'globalCartFab';
  cartLink.className = 'global-cart-fab';
  cartLink.href = total > 0 ? 'order.html' : 'shop.html';
  cartLink.setAttribute('aria-label', total > 0 ? `View cart with ${total} items` : 'View cart');
  cartLink.innerHTML = `View Cart <span class="global-cart-count">${total}</span>`;
  document.body.appendChild(cartLink);
  document.body.classList.add('has-cart-fab');
}

function loadGeetSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(GEET_SESSION_KEY) || '{}');
    return {
      messages: Array.isArray(saved.messages) ? saved.messages : [],
      chips: Array.isArray(saved.chips) ? saved.chips : []
    };
  } catch (error) {
    return { messages: [], chips: [] };
  }
}

function saveGeetSession(messagesEl, chips = []) {
  const messages = Array.from(messagesEl.querySelectorAll('.geet-message')).map((messageEl) => ({
    sender: messageEl.classList.contains('geet-message-user') ? 'user' : 'geet',
    text: messageEl.textContent || ''
  }));
  sessionStorage.setItem(GEET_SESSION_KEY, JSON.stringify({ messages, chips }));
}

function getGeetConnectChip() {
  return {
    label: "Connect with Shrish",
    href: `https://wa.me/${SHRISH_CONFIG.whatsappNumber}?text=${encodeURIComponent("Hi Shrish! I was chatting with Geet and would like help choosing products today.")}`,
    external: true
  };
}

function withGeetConnectChip(chips = []) {
  const hasConnect = chips.some((chip) => /wa\.me|whatsapp\.com/i.test(chip.href || ''));
  return hasConnect ? chips : [...chips, getGeetConnectChip()];
}

function appendGeetMessage(messagesEl, text, sender = 'geet') {
  const messageEl = document.createElement('div');
  messageEl.className = `geet-message geet-message-${sender}`;
  messageEl.textContent = text;
  messagesEl.appendChild(messageEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderGeetMessages(messagesEl, messages = []) {
  messagesEl.innerHTML = '';
  messages.forEach((message) => {
    appendGeetMessage(messagesEl, message.text, message.sender === 'user' ? 'user' : 'geet');
  });
}

function renderGeetChips(chipsEl, chips = []) {
  chipsEl.innerHTML = '';
  chips.forEach((chip) => {
    const isWhatsAppChip = /wa\.me|whatsapp\.com/i.test(chip.href || '');
    const chipEl = chip.href && !isWhatsAppChip ? document.createElement('a') : document.createElement('button');
    chipEl.className = 'geet-chip';
    chipEl.textContent = isWhatsAppChip ? 'Connect with Shrish' : chip.label;
    if (chip.href && !isWhatsAppChip) {
      chipEl.href = chip.href;
      if (chip.external) {
        chipEl.target = '_blank';
        chipEl.rel = 'noopener';
      }
    } else {
      chipEl.type = 'button';
      if (isWhatsAppChip) chipEl.dataset.geetHref = chip.href;
      else chipEl.dataset.geetAction = chip.action;
    }
    chipsEl.appendChild(chipEl);
  });
}

function injectGeetAssistant() {
  if (document.getElementById('geetAssistant')) return;

  const widget = document.createElement('section');
  widget.id = 'geetAssistant';
  widget.className = 'geet-widget';
  widget.setAttribute('aria-label', 'Geet shopping assistant');
  widget.innerHTML = `
    <div class="geet-panel" id="geetPanel" role="dialog" aria-modal="false" aria-labelledby="geetTitle" aria-hidden="true">
      <div class="geet-head">
        <div class="geet-avatar" aria-hidden="true">G</div>
        <div>
          <h2 id="geetTitle">Geet</h2>
          <p>Shopping assistant</p>
        </div>
        <button type="button" class="geet-close" id="geetClose" aria-label="Close Geet">x</button>
      </div>
      <div class="geet-messages" id="geetMessages"></div>
      <div class="geet-chips" id="geetChips" aria-label="Suggested questions"></div>
      <form class="geet-form" id="geetForm">
        <input id="geetInput" type="text" autocomplete="off" placeholder="Ask about sweet, spicy, tangy..." aria-label="Ask Geet a question">
        <button type="submit">Send</button>
      </form>
    </div>
    <button type="button" class="geet-launcher" id="geetLauncher" aria-expanded="false" aria-controls="geetPanel">
      <span class="geet-launcher-dot" aria-hidden="true"></span>
      <span>Ask Geet</span>
    </button>
  `;
  document.body.appendChild(widget);
  document.body.classList.add('geet-enabled');

  const launcher = document.getElementById('geetLauncher');
  const panel = document.getElementById('geetPanel');
  const closeBtn = document.getElementById('geetClose');
  const messagesEl = document.getElementById('geetMessages');
  const chipsEl = document.getElementById('geetChips');
  const form = document.getElementById('geetForm');
  const input = document.getElementById('geetInput');
  const savedSession = loadGeetSession();

  const openGeet = (source = 'manual') => {
    widget.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    sessionStorage.setItem('shrish_geet_seen', '1');
    trackShrishEvent('geet_opened', { source });
  };

  const closeGeet = () => {
    widget.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    sessionStorage.setItem('shrish_geet_closed', '1');
    trackShrishEvent('geet_closed');
  };

  const answerWith = (action, userLabel = '') => {
    const response = buildGeetResponse(action, userLabel);
    const chips = withGeetConnectChip(response.chips);
    if (userLabel) appendGeetMessage(messagesEl, userLabel, 'user');
    appendGeetMessage(messagesEl, response.text, 'geet');
    appendGeetMessage(messagesEl, "Would you like to connect with Shrish on WhatsApp for today's availability, pickup timing, or custom help?", 'geet');
    renderGeetChips(chipsEl, chips);
    saveGeetSession(messagesEl, chips);
    trackShrishEvent('geet_question_answered', { action });
  };

  if (savedSession.messages.length) {
    renderGeetMessages(messagesEl, savedSession.messages);
    renderGeetChips(chipsEl, savedSession.chips.length ? savedSession.chips : withGeetConnectChip(GEET_RESPONSES.fallback.chips));
  } else {
    appendGeetMessage(messagesEl, "Hi I'm Geet can i help you today", 'geet');
    renderGeetChips(chipsEl, GEET_RESPONSES.fallback.chips);
  }

  launcher.addEventListener('click', () => {
    if (widget.classList.contains('open')) closeGeet();
    else openGeet('launcher');
  });
  closeBtn.addEventListener('click', closeGeet);
  chipsEl.addEventListener('click', (event) => {
    const chipTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const hrefTarget = chipTarget?.closest('[data-geet-href], a[href*="wa.me"], a[href*="whatsapp.com"]');
    if (hrefTarget) {
      event.preventDefault();
      const href = hrefTarget.dataset.geetHref || hrefTarget.getAttribute('href');
      if (href) window.location.assign(href);
      return;
    }
    const actionBtn = chipTarget?.closest('[data-geet-action]');
    if (!actionBtn) return;
    answerWith(actionBtn.dataset.geetAction, actionBtn.textContent.trim());
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    answerWith(classifyGeetMessage(question), question);
  });

  if (!sessionStorage.getItem('shrish_geet_seen') && !sessionStorage.getItem('shrish_geet_closed')) {
    window.setTimeout(() => openGeet('auto'), 1200);
  }
}

function injectGlobalUI() {
  injectProductSearch();
  injectGlobalCartShortcut();

  // 1. Back-to-Top Button
  const topBtn = document.createElement('button');
  topBtn.id = 'backToTop';
  topBtn.setAttribute('aria-label', 'Back to top');
  topBtn.textContent = '↑';
  topBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  document.body.appendChild(topBtn);

  // Show/hide back-to-top on scroll
  window.addEventListener('scroll', () => {
    topBtn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });

  // 2. Inject global styles for back-to-top + TOAST FIX
  const style = document.createElement('style');
  style.textContent = `
    /* Product search in nav */
    body.nav-has-search .nav-inner {
      grid-template-columns: 190px minmax(0, 1fr) minmax(190px, 260px) 88px;
      column-gap: 16px;
    }
    body.nav-has-search .nav-links {
      transform: translateX(-28px);
      gap: 30px;
    }
    .nav-product-search {
      display: flex;
      align-items: center;
      justify-self: end;
      width: min(260px, 100%);
      height: 42px;
      border: 1.5px solid rgba(200,121,26,.24);
      border-radius: 50px;
      background: rgba(255,255,255,.72);
      overflow: visible;
      box-shadow: 0 2px 10px rgba(26,18,8,.05);
      position: relative;
    }
    .nav-product-search input {
      min-width: 0;
      flex: 1;
      height: 100%;
      border: 0;
      background: transparent;
      padding: 0 12px 0 15px;
      color: var(--text, #3D2A0A);
      font-family: var(--font-body, 'Jost', system-ui, sans-serif);
      font-size: 13px;
      font-weight: 600;
      outline: none;
    }
    .nav-product-search button {
      height: 100%;
      border: 0;
      background: var(--saffron, #C8791A);
      color: #fff;
      padding: 0 13px;
      font-family: var(--font-body, 'Jost', system-ui, sans-serif);
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .nav-product-search button:hover {
      background: var(--saffron-d, #A8600F);
    }
    .mobile-product-search {
      display: none;
    }
    .product-search-results {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      right: 0;
      z-index: 1600;
      display: none;
      flex-direction: column;
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid rgba(200,121,26,.2);
      background: #fff;
      box-shadow: 0 18px 38px rgba(26,18,8,.16);
      min-width: 280px;
    }
    .product-search-results.open {
      display: flex;
    }
    .product-search-results a {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 11px 13px;
      color: var(--text, #3D2A0A);
      text-decoration: none;
      border-bottom: 1px solid rgba(200,121,26,.1);
    }
    .product-search-results a:last-child {
      border-bottom: 0;
    }
    .product-search-results a:hover {
      background: var(--cream, #FDF6EC);
    }
    .psr-name {
      font-size: 13px;
      font-weight: 800;
      line-height: 1.25;
    }
    .psr-meta,
    .product-search-empty {
      font-size: 11px;
      color: var(--text-light, #7A5C30);
      line-height: 1.35;
    }
    .product-search-empty {
      padding: 12px 13px;
    }
    .global-cart-fab {
      position: fixed;
      right: 28px;
      bottom: 28px;
      z-index: 1000;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 22px;
      border-radius: 50px;
      background: var(--saffron, #C8791A);
      color: #fff;
      font-family: var(--font-body, 'Jost', system-ui, sans-serif);
      font-size: 15px;
      font-weight: 800;
      text-decoration: none;
      box-shadow: 0 8px 32px rgba(200,121,26,.45);
      transition: transform .25s ease, background .25s ease;
    }
    .global-cart-fab:hover {
      background: var(--saffron-d, #A8600F);
      transform: translateY(-3px);
    }
    .global-cart-count {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #fff;
      color: var(--saffron, #C8791A);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 900;
    }
    @media (max-width: 1180px) {
      body.nav-has-search .nav-inner {
        grid-template-columns: 176px minmax(0, 1fr) minmax(160px, 210px) 78px;
        column-gap: 12px;
      }
      body.nav-has-search .nav-links {
        gap: 20px;
        transform: translateX(-8px);
      }
      body.nav-has-search .nav-link {
        font-size: 20px;
      }
      .nav-product-search {
        width: min(210px, 100%);
      }
    }
    @media (max-width: 900px) {
      .nav-product-search {
        display: none;
      }
      .mobile-product-search {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        margin-top: 10px;
        position: relative;
      }
      .mobile-product-search input {
        min-width: 0;
        border: 1.5px solid rgba(200,121,26,.24);
        border-radius: 50px;
        background: #fff;
        padding: 11px 14px;
        font: inherit;
        font-size: 14px;
        color: var(--text, #3D2A0A);
        outline: none;
      }
      .mobile-product-search button {
        border: 0;
        border-radius: 50px;
        background: var(--saffron, #C8791A);
        color: #fff;
        padding: 0 16px;
        font-weight: 800;
      }
      .mobile-product-search .product-search-results {
        min-width: 0;
      }
    }

    /* Geet assistant */
    .geet-widget {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 1400;
      font-family: var(--font-body, 'Jost', system-ui, sans-serif);
    }
    .geet-launcher {
      min-width: 132px;
      min-height: 52px;
      border: 0;
      border-radius: 50px;
      background: var(--dark, #1A1208);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      padding: 14px 20px;
      box-shadow: 0 10px 30px rgba(26,18,8,.28);
      cursor: pointer;
      font-size: 15px;
      font-weight: 700;
      transition: transform .25s ease, box-shadow .25s ease, background .25s ease;
    }
    .geet-launcher:hover {
      background: var(--saffron, #C8791A);
      transform: translateY(-2px);
      box-shadow: 0 14px 36px rgba(200,121,26,.32);
    }
    .geet-launcher-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--gold-l, #F0C84A);
      box-shadow: 0 0 0 5px rgba(240,200,74,.18);
      flex: 0 0 auto;
    }
    .geet-panel {
      position: absolute;
      right: 0;
      bottom: 68px;
      width: min(360px, calc(100vw - 32px));
      max-height: min(620px, calc(100vh - 120px));
      background: #fff;
      border: 1px solid rgba(200,121,26,.24);
      border-radius: 18px;
      box-shadow: 0 20px 60px rgba(26,18,8,.22);
      overflow: hidden;
      opacity: 0;
      transform: translateY(14px) scale(.98);
      pointer-events: none;
      transition: opacity .25s ease, transform .25s ease;
    }
    .geet-widget.open .geet-panel {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .geet-head {
      display: grid;
      grid-template-columns: 44px 1fr 34px;
      gap: 12px;
      align-items: center;
      padding: 16px;
      background: linear-gradient(135deg, var(--dark, #1A1208), var(--saffron-d, #A8600F));
      color: #fff;
    }
    .geet-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--gold-l, #F0C84A);
      color: var(--dark, #1A1208);
      font-weight: 800;
      font-size: 20px;
    }
    .geet-head h2 {
      margin: 0;
      font-size: 19px;
      line-height: 1.1;
      color: #fff;
    }
    .geet-head p {
      margin: 3px 0 0;
      font-size: 12px;
      line-height: 1.2;
      color: rgba(255,255,255,.74);
    }
    .geet-close {
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      background: rgba(255,255,255,.15);
      color: #fff;
      cursor: pointer;
      font-size: 17px;
      line-height: 1;
    }
    .geet-messages {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      max-height: 276px;
      overflow-y: auto;
      background: var(--cream, #FDF6EC);
    }
    .geet-message {
      max-width: 88%;
      padding: 10px 12px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
      box-shadow: 0 2px 10px rgba(26,18,8,.06);
    }
    .geet-message-geet {
      align-self: flex-start;
      background: #fff;
      color: var(--text, #3D2A0A);
      border-bottom-left-radius: 5px;
    }
    .geet-message-user {
      align-self: flex-end;
      background: var(--saffron, #C8791A);
      color: #fff;
      border-bottom-right-radius: 5px;
    }
    .geet-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 16px 4px;
      background: #fff;
    }
    .geet-chip {
      border: 1px solid rgba(200,121,26,.32);
      border-radius: 50px;
      background: rgba(253,246,236,.8);
      color: var(--saffron-d, #A8600F);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.1;
      text-decoration: none;
      transition: background .2s ease, color .2s ease, border-color .2s ease;
    }
    .geet-chip:hover {
      background: var(--saffron, #C8791A);
      border-color: var(--saffron, #C8791A);
      color: #fff;
    }
    .geet-form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 12px 16px 16px;
      background: #fff;
    }
    .geet-form input {
      min-width: 0;
      height: 42px;
      border: 1px solid rgba(107,74,32,.22);
      border-radius: 50px;
      padding: 0 14px;
      font: inherit;
      font-size: 14px;
      color: var(--text, #3D2A0A);
      outline: none;
    }
    .geet-form input:focus {
      border-color: var(--saffron, #C8791A);
      box-shadow: 0 0 0 3px rgba(200,121,26,.14);
    }
    .geet-form button {
      height: 42px;
      border: 0;
      border-radius: 50px;
      background: var(--saffron, #C8791A);
      color: #fff;
      padding: 0 15px;
      cursor: pointer;
      font-weight: 700;
      font-size: 13px;
    }
    body.geet-enabled #backToTop {
      right: 24px;
      bottom: 90px;
    }
    body.geet-enabled.has-cart-fab .geet-widget {
      right: 28px;
      bottom: 92px;
    }
    body.geet-enabled.has-cart-fab #backToTop {
      right: 28px;
      bottom: 158px;
    }
    @media (max-width: 640px) {
      .geet-widget {
        right: 16px;
        bottom: 16px;
      }
      .geet-panel {
        bottom: 64px;
        max-height: calc(100vh - 94px);
      }
      .geet-launcher {
        min-width: 58px;
        width: 58px;
        height: 58px;
        padding: 0;
      }
      .geet-launcher span:last-child {
        display: none;
      }
      body.geet-enabled #backToTop {
        right: 16px;
        bottom: 86px;
      }
      body.geet-enabled.has-cart-fab .geet-widget {
        right: 16px;
        bottom: 82px;
      }
      body.geet-enabled.has-cart-fab #backToTop {
        right: 16px;
        bottom: 148px;
      }
    }

    /* Back to top */
    #backToTop {
      position: fixed; bottom: 24px; right: 24px; z-index: 998;
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--saffron, #C8791A); color: white;
      border: none; font-size: 20px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 16px rgba(200,121,26,.35);
      transition: all .3s; opacity: 0; pointer-events: none;
    }
    #backToTop.visible { opacity: 1; pointer-events: auto; }
    #backToTop:hover { background: #A8600F; transform: translateY(-3px); }
    body.has-cart-fab #backToTop { right: 28px; bottom: 150px; }
    @media (max-width: 480px) { #backToTop { right: 16px; } }
    @media (max-width: 480px) { body.has-cart-fab #backToTop { right: 16px; bottom: 146px; } }

    /* Mobile nav Order Now button */
    .nav-mobile .mobile-order-btn {
      display: block; text-align: center; margin-top: 8px;
      background: var(--saffron, #C8791A); color: white !important;
      padding: 13px; border-radius: 50px; font-weight: 700; font-size: 15px;
    }

    /* Social footer strip */
    .social-footer-strip {
      background: var(--dark, #1A1208); padding: 20px 24px;
      display: flex; align-items: center; justify-content: center;
      gap: 16px; flex-wrap: wrap;
    }
    .social-footer-strip span { color: rgba(255,255,255,.5); font-size: 13px; }
    .sfs-link {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 50px; font-size: 13px; font-weight: 600;
      text-decoration: none; transition: all .25s; font-family: 'Jost', sans-serif;
    }
    .sfs-wa { background: rgba(37,211,102,.15); color: #25D366; border: 1px solid rgba(37,211,102,.3); }
    .sfs-wa:hover { background: #25D366; color: white; }
    .sfs-ig { background: rgba(220,39,67,.12); color: #e1306c; border: 1px solid rgba(220,39,67,.25); }
    .sfs-ig:hover { background: linear-gradient(135deg,#f09433,#dc2743,#bc1888); color: white; border-color: transparent; }
    .sfs-wa svg, .sfs-ig svg { width:16px; height:16px; flex-shrink:0; }

    /* ââ TOAST FIX (Issue 6) ââââââââââââââââââââââââââââââââ */
    /* The .toast base style exists in shop.html but .show rule was missing */
    .toast {
      position: fixed;
      bottom: 100px;
      right: 28px;
      z-index: 3000;
      background: #1A1208;
      color: #fff;
      padding: 12px 22px;
      border-radius: 50px;
      font-family: 'Jost', sans-serif;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .01em;
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: 0 4px 20px rgba(0,0,0,.25);
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    @media (max-width: 480px) {
      .toast { right: 16px; bottom: 80px; }
    }
  `;
  document.head.appendChild(style);

  // 4. Inject social strip above every footer
  const footer = document.querySelector('footer.footer');
  if (footer) {
    const strip = document.createElement('div');
    strip.className = 'social-footer-strip';
    strip.innerHTML = `
      <span>Follow & stay updated:</span>
      <a href="${SHRISH_CONFIG.whatsappGroup}" target="_blank" rel="noopener" class="sfs-link sfs-wa">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        WhatsApp Group
      </a>
      <a href="${SHRISH_CONFIG.instagram}" target="_blank" rel="noopener" class="sfs-link sfs-ig">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
        Instagram
      </a>`;
    footer.parentNode.insertBefore(strip, footer);
  }

  // 5. Update nav cart badge count from session cart
  const sessionCart = JSON.parse(sessionStorage.getItem('shrish_cart') || '[]');
  const navBadgeCount = sessionCart.reduce((s, i) => s + (i.qty || 1), 0);
  const navBadgeEl = document.getElementById('navCartBadge');
  if (navBadgeEl) navBadgeEl.textContent = navBadgeCount;

  // Make cart link go to order.html if cart has items, else shop.html
  const navCartLinkEl = document.getElementById('navCartLink');
  if (navCartLinkEl && navBadgeCount > 0) navCartLinkEl.href = 'order.html';

  if (document.getElementById('cartFab')) {
    document.body.classList.add('has-cart-fab');
  }

  // 6. Add "Order Now" to mobile nav if missing
  const navMobile = document.getElementById('navMobile');
  if (navMobile && !navMobile.querySelector('.mobile-order-btn')) {
    const orderLink = document.createElement('a');
    orderLink.href = 'shop.html';
    orderLink.className = 'mobile-order-btn';
    orderLink.textContent = 'Order Now';
    navMobile.appendChild(orderLink);
  }

  injectGeetAssistant();
}

// ââ DOM READY âââââââââââââââââââââââââââââââââââââââââââââââ
document.addEventListener('DOMContentLoaded', () => {
  // Inject global UI
  injectGlobalUI();

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    let channel = '';
    if (/wa\.me|whatsapp\.com/i.test(href)) channel = 'whatsapp';
    else if (/instagram\.com/i.test(href)) channel = 'instagram';
    else if (/^mailto:/i.test(href)) channel = 'email';
    else if (/^tel:/i.test(href)) channel = 'phone';
    if (!channel) return;

    trackShrishEvent('contact_link_clicked', {
      channel,
      link_area: link.closest('footer') ? 'footer' : link.closest('.nav') ? 'nav' : 'page',
      link_text: (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    });
  });

  // Nav scroll shadow
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // Hamburger toggle
  const hamburger = document.getElementById('hamburger');
  const navMobile = document.getElementById('navMobile');
  if (hamburger && navMobile) {
    hamburger.addEventListener('click', () => {
      navMobile.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', navMobile.classList.contains('open'));
    });
    // Close mobile nav when clicking a link
    navMobile.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => navMobile.classList.remove('open'));
    });
  }

  // Active nav link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === currentPage || (currentPage === '' && href === 'index.html'));
  });

  // ââ Homepage product grid (with real images) âââââââââââââââ
  const productsGrid = document.getElementById('productsGrid');
  if (productsGrid && window.SHRISH_DATA && productsGrid.dataset.liveProducts !== 'true') {
    const mangoes = SHRISH_DATA.products.filter(p => p.category === 'mangoes');
    const available = mangoes.filter(p => p.available);
    const toShow = (available.length ? available : mangoes).slice(0, 3);
    toShow.forEach(p => {
      const imgHtml = p.image
        ? `<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const fallbackStyle = p.image ? 'style="display:none"' : '';
      productsGrid.innerHTML += `
        <div class="product-card ${p.available ? '' : 'product-card-unavailable'}">
          ${p.tag ? `<div class="product-card-badge">${p.tag}</div>` : ''}
          <div class="product-card-img" style="padding:0;overflow:hidden;${p.image ? '' : 'display:flex;align-items:center;justify-content:center'}">
            ${imgHtml}
            <span ${fallbackStyle} style="font-size:56px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">ð¥­</span>
          </div>
          <div class="product-card-body">
            <h3>${p.name}</h3>
            <p>${p.description.slice(0, 80)}â¦</p>
            <div class="product-card-footer">
              <div>
                <div class="product-price">${p.price}</div>
                <div class="product-unit">${p.unit}</div>
              </div>
              <span class="product-status-badge ${p.available ? 'available' : 'unavailable'}">
                ${p.available ? 'â Available' : 'Sold Out'}
              </span>
            </div>
          </div>
        </div>`;
    });
  }

  // ââ Scroll reveal animations (FIXED: skip already-visible elements) ââ
  // Issue 5 fix: only hide elements that are BELOW the fold.
  // Elements already on screen when the page loads stay visible immediately.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll(
      '.section-header, .product-card, .how-step, .recipe-card, .testimonial-card'
    ).forEach(el => {
      const rect = el.getBoundingClientRect();
      const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
      if (!alreadyVisible) {
        // Only animate elements that start below the fold
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
      }
    });
  }
});

// ââ Dynamic copyright year ââââââââââââââââââââââââââââââââââââ
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.copy-year').forEach(function(el) {
    el.textContent = new Date().getFullYear();
  });
});

