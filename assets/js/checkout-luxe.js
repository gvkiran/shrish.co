/* ============================================================
   SHRISH — THE PACKING ROOM v2
   Full-page checkout experience layer. Read-only over existing
   order logic: listens, decorates, proxies clicks to the real
   submit button. Defensive everywhere.
   ============================================================ */
(function () {
  'use strict';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t || '').replace(/</g, '&lt;'); }

  function itemEmoji(name) {
    var n = (name || '').toLowerCase();
    if (n.indexOf('pickle') >= 0 || n.indexOf('avakai') >= 0 || n.indexOf('thokku') >= 0) return '🫙';
    if (n.indexOf('podi') >= 0 || n.indexOf('powder') >= 0) return '🥣';
    if (n.indexOf('putharekulu') >= 0 || n.indexOf('jelly') >= 0 || n.indexOf('thandra') >= 0 || n.indexOf('sweet') >= 0) return '🍯';
    return '🥭';
  }

  function init() {
    try {
      var wrap = $('checkoutWrap');
      var review = $('cartReviewContainer');
      var sidebar = document.querySelector('.checkout-sidebar');
      var submit = $('submitBtn');
      if (!wrap || !review || !sidebar || !submit) return;
      document.body.classList.add('packing-room');

      /* ---------- journey strip ---------- */
      var journey = document.createElement('div');
      journey.className = 'pk-journey';
      journey.innerHTML =
        '<div class="pk-step" data-step="cart"><span class="pk-dot">🧺</span>Your Box</div>' +
        '<div class="pk-line"><span></span></div>' +
        '<div class="pk-step" data-step="details"><span class="pk-dot">✍️</span>Your Details</div>' +
        '<div class="pk-line"><span></span></div>' +
        '<div class="pk-step" data-step="pickup"><span class="pk-dot">📍</span>Pickup Spot</div>' +
        '<div class="pk-line"><span></span></div>' +
        '<div class="pk-step" data-step="seal"><span class="pk-dot">🥭</span>Seal It</div>';
      wrap.parentNode.insertBefore(journey, wrap);

      /* ---------- the living box ---------- */
      var box = document.createElement('div');
      box.className = 'pk-box-card';
      box.innerHTML =
        '<div class="pk-box-kicker">The Packing Room</div>' +
        '<div class="pk-box-name" id="pkName">Packing <em>your</em> box…</div>' +
        '<div class="pk-crate"><div class="pk-stamp" id="pkStamp"></div><div class="pk-items" id="pkItems"></div></div>' +
        '<div class="pk-total"><span class="lbl">Total at pickup</span><span class="amt" id="pkTotal">—</span></div>' +
        '<div class="pk-due-line">Due today <b>$0.00</b> · cash, card or Zelle at pickup</div>' +
        '<button type="button" class="pk-seal" id="pkSeal">Packing in progress…</button>';
      sidebar.insertBefore(box, sidebar.firstChild);

      /* ---------- meter + hint + trust around the real button ---------- */
      var meter = document.createElement('div');
      meter.className = 'pk-meter';
      meter.innerHTML = '<div class="pk-meter-bar"><span id="pkMeterFill"></span></div><span class="pk-pct" id="pkPct">0%</span>';
      submit.parentNode.insertBefore(meter, submit);
      var hint = document.createElement('div');
      hint.className = 'pk-meter';
      hint.style.justifyContent = 'center';
      hint.innerHTML = '<span id="pkHint"></span>';
      submit.parentNode.insertBefore(hint, submit);
      var trust = document.createElement('div');
      trust.className = 'pk-trust';
      trust.innerHTML = '<span><b>✓</b> $0 due today</span><span><b>✓</b> Cancel anytime before pickup</span><span><b>✓</b> Address shared on WhatsApp</span>';
      submit.insertAdjacentElement('afterend', trust);

      /* ---------- step labels: numbers + done ticks ---------- */
      var stepLabels = Array.prototype.slice.call(document.querySelectorAll('.order-card .step-label, .step-label'));
      stepLabels.forEach(function (el, i) {
        el.setAttribute('data-num', i + 1);
        var tick = document.createElement('span');
        tick.className = 'pk-step-done';
        tick.textContent = '✓ done';
        tick.style.display = 'none';
        el.appendChild(tick);
      });

      /* ---------- validity ticks on inputs ---------- */
      ['firstName', 'phone', 'email'].forEach(function (id) {
        var input = $(id);
        if (!input) return;
        var group = input.closest('.form-group') || input.parentNode;
        if (group && !group.querySelector('.pk-tick')) {
          var t = document.createElement('span');
          t.className = 'pk-tick';
          t.textContent = '✓';
          group.appendChild(t);
        }
      });

      /* ---------- payment chips ---------- */
      var payOpt = document.querySelector('.payment-option[data-payment="pickup"]');
      if (payOpt && !payOpt.querySelector('.pk-paychips')) {
        var chips = document.createElement('span');
        chips.className = 'pk-paychips';
        chips.innerHTML = '<span>💵 Cash</span><span>💳 Card</span><span>🏦 Zelle</span>';
        payOpt.appendChild(chips);
      }

      /* ---------- sidebar Pickup Locations becomes interactive ---------- */
      var locOrder = ['shortpump', 'chesterfield', 'mechanicsville'];
      var sideLocCard = null;
      sidebar.querySelectorAll('.info-card').forEach(function (c) {
        var h = c.querySelector('h4');
        if (h && /Pickup Locations/i.test(h.textContent)) sideLocCard = c;
      });
      if (sideLocCard) {
        sideLocCard.classList.add('pk-loc-pick');
        sideLocCard.querySelectorAll('.ir').forEach(function (ir, i) {
          ir.dataset.loc = locOrder[i] || '';
          ir.addEventListener('click', function () {
            var real = $('loc-' + ir.dataset.loc);
            if (real) { real.click(); real.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          });
        });
      }

      /* ---------- mobile sticky pay bar ---------- */
      var paybar = document.createElement('div');
      paybar.className = 'pk-paybar';
      paybar.innerHTML = '<div><div class="pp-total" id="ppTotal">—</div><div class="pp-sub">$0 due today</div></div><button type="button" id="ppGo">Place Order</button>';
      document.body.appendChild(paybar);
      $('ppGo').addEventListener('click', function () { sealAction(); });

      /* ---------- cart + state readers ---------- */
      function readCart() {
        var items = [];
        review.querySelectorAll('.review-item').forEach(function (r) {
          var nm = r.querySelector('.ri-name');
          var q = r.querySelector('.ri-qty-value');
          var idBtn = r.querySelector('.ri-qty-btn[data-id]');
          if (nm) items.push({ name: nm.textContent.trim(), qty: q ? q.textContent.trim() : '1', id: idBtn ? idBtn.dataset.id : '' });
        });
        var totEl = review.querySelector('.rt-price');
        return { items: items, total: totEl ? totEl.textContent.trim() : '' };
      }
      function sessionCart() {
        try { return JSON.parse(sessionStorage.getItem('shrish_cart') || '[]'); } catch (e) { return []; }
      }
      function injectThumbs() {
        var sc = sessionCart();
        review.querySelectorAll('.review-item').forEach(function (r) {
          if (r.dataset.pkThumbed) return;
          var idBtn = r.querySelector('.ri-qty-btn[data-id]');
          var info = r.querySelector('.ri-info');
          if (!idBtn || !info) return;
          var item = sc.find(function (x) { return String(x.id) === String(idBtn.dataset.id); });
          var src = item && item.image ? item.image : 'images/brand/logo-small.png';
          var img = document.createElement('img');
          img.className = 'pk-thumb';
          img.alt = '';
          img.src = src;
          img.onerror = function () { this.src = 'images/brand/logo-small.png'; };
          info.insertBefore(img, info.firstChild);
          r.dataset.pkThumbed = '1';
        });
      }

      function phoneOk() { return (($('phone') || {}).value || '').replace(/\D/g, '').length >= 10; }
      function emailOk() { return /\S+@\S+\.\S+/.test((($('email') || {}).value || '')); }
      function nameOk() { return (($('firstName') || {}).value || '').trim().length >= 2; }
      function locPicked() { return !!document.querySelector('.loc-card.selected'); }

      var LOC_LABELS = { shortpump: 'Short Pump, VA', chesterfield: 'Chesterfield, VA', mechanicsville: 'Mechanicsville, VA' };

      function firstMissingTarget(cart) {
        if (!cart.items.length) return review;
        if (!nameOk()) return $('firstName');
        if (!phoneOk()) return $('phone');
        if (!emailOk()) return $('email');
        if (!locPicked()) return $('locCards');
        return null;
      }
      function sealAction() {
        try {
          var cart = readCart();
          var missing = firstMissingTarget(cart);
          if (!missing) { submit.click(); return; }
          missing.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (missing.focus) setTimeout(function () { try { missing.focus(); } catch (e) {} }, 450);
        } catch (e) {}
      }
      $('pkSeal').addEventListener('click', sealAction);

      /* ---------- master refresh (signature-gated: skips all DOM work
         when nothing changed, so scrolling/typing stays 60fps) ---------- */
      var lastSig = '';
      function refresh() {
        try {
          var cart = readCart();
          var hasItems = cart.items.length > 0;
          var success = $('successScreen');
          var done = !!(success && success.style.display && success.style.display !== 'none');
          var sig = [
            (($('firstName') || {}).value || ''),
            (($('phone') || {}).value || ''),
            (($('email') || {}).value || ''),
            (document.querySelector('.loc-card.selected') || { dataset: {} }).dataset.loc || '',
            cart.items.map(function (i) { return i.id + ':' + i.qty; }).join(','),
            cart.total,
            done ? 1 : 0
          ].join('|');
          if (sig === lastSig) return;
          lastSig = sig;
          injectThumbs();

          var itemsEl = $('pkItems');
          var html = '';
          if (hasItems) {
            cart.items.slice(0, 8).forEach(function (it) {
              html += '<span class="pk-item">' + itemEmoji(it.name) + ' ' + esc(it.name).slice(0, 26) + ' <span class="pk-qty">×' + esc(it.qty) + '</span></span>';
            });
            if (cart.items.length > 8) html += '<span class="pk-item">＋' + (cart.items.length - 8) + ' more</span>';
          } else {
            html = '<div class="pk-empty">Your box is empty — <a href="shop.html">add something delicious</a></div>';
          }
          if (itemsEl.innerHTML !== html) itemsEl.innerHTML = html;

          var fn = (($('firstName') || {}).value || '').trim();
          $('pkName').innerHTML = fn ? 'Packing <em>' + esc(fn).slice(0, 18) + '’s</em> box' : 'Packing <em>your</em> box…';

          var sel = document.querySelector('.loc-card.selected');
          var stamp = $('pkStamp');
          if (sel && LOC_LABELS[sel.dataset.loc]) { stamp.textContent = '→ ' + LOC_LABELS[sel.dataset.loc]; stamp.classList.add('on'); }
          else stamp.classList.remove('on');

          $('pkTotal').textContent = cart.total || '—';
          $('ppTotal').textContent = cart.total || '—';

          /* validity ticks */
          [['firstName', nameOk()], ['phone', phoneOk()], ['email', emailOk()]].forEach(function (p) {
            var input = $(p[0]);
            if (!input) return;
            var group = input.closest('.form-group') || input.parentNode;
            if (group) group.classList.toggle('pk-ok', !!p[1]);
          });

          /* step done ticks: 1 contact, 2 location, 3 optional (always), 4 payment (always) */
          var stepStates = [nameOk() && phoneOk() && emailOk(), locPicked(), true, true];
          stepLabels.forEach(function (el, i) {
            var tick = el.querySelector('.pk-step-done');
            if (tick) tick.style.display = stepStates[i] ? 'inline' : 'none';
          });

          /* sidebar location mirror */
          if (sideLocCard) {
            sideLocCard.querySelectorAll('.ir').forEach(function (ir) {
              ir.classList.toggle('pk-active', !!(sel && ir.dataset.loc === sel.dataset.loc));
            });
          }

          /* readiness */
          var steps = [hasItems, nameOk(), phoneOk() && emailOk(), locPicked()];
          var pct = Math.round(steps.filter(Boolean).length / steps.length * 100);
          submit.style.setProperty('--charge', pct);
          submit.classList.toggle('pk-ready', pct === 100);
          $('pkMeterFill').style.transform = 'scaleX(' + (pct / 100) + ')';
          $('pkPct').textContent = pct + '%';
          var missing = [];
          if (!hasItems) missing.push('add an item');
          if (!nameOk()) missing.push('your name');
          if (!(phoneOk() && emailOk())) missing.push('phone & email');
          if (!locPicked()) missing.push('pickup spot');
          $('pkHint').textContent = pct === 100 ? '🥭 Everything’s packed — seal it below!' : 'Still needed: ' + missing.join(' · ');

          var seal = $('pkSeal');
          seal.textContent = pct === 100 ? '🥭 Seal the box — Place Order' : 'Packing… ' + pct + '% — tap to continue';
          seal.classList.toggle('ready', pct === 100);
          var ppGo = $('ppGo');
          ppGo.textContent = pct === 100 ? '🥭 Place Order' : 'Continue (' + pct + '%)';

          /* journey */
          var states = { cart: hasItems, details: nameOk() && phoneOk() && emailOk(), pickup: locPicked(), seal: pct === 100 };
          journey.querySelectorAll('.pk-step').forEach(function (st) { st.classList.toggle('done', !!states[st.dataset.step]); });
          var lines = journey.querySelectorAll('.pk-line');
          [states.cart, states.details, states.pickup].forEach(function (on, i) {
            if (lines[i]) lines[i].classList.toggle('fill', !!on);
          });

          /* remember last good name/location for the ceremony */
          if (fn) lastName2 = fn;
          if (sel && LOC_LABELS[sel.dataset.loc]) lastLoc = LOC_LABELS[sel.dataset.loc];

          /* hide overlay widgets once success screen is visible */
          paybar.style.display = done ? 'none' : '';
          journey.style.display = done ? 'none' : '';
          box.style.display = done ? 'none' : '';
          if (done && !sealedShown) { sealedShown = true; showCeremony(); }
        } catch (e) { /* decorative layer must never break checkout */ }
      }

      var lastName2 = '', lastLoc = '', sealedShown = false;
      function showCeremony() {
        try {
          var success = $('successScreen');
          if (!success || success.querySelector('.pk-sealed')) return;
          var hero = document.createElement('div');
          hero.className = 'pk-sealed';
          hero.innerHTML =
            '<div class="pk-crate"><div class="pk-stamp on">' + (lastLoc ? '→ ' + lastLoc : 'SEALED') + '</div>' +
            '<div class="pk-items"><span class="pk-item">🥭 ' + (lastName2 ? esc(lastName2) + '’s box' : 'Your box') + '</span><span class="pk-item">✓ Sealed with care</span></div></div>' +
            '<div class="pk-tape">SHRISH · SEALED</div>';
          var h2 = success.querySelector('h2');
          if (h2) {
            h2.innerHTML = (lastName2 ? esc(lastName2) + ', your' : 'Your') + ' box is <em>sealed!</em>';
            success.insertBefore(hero, h2);
          } else success.insertBefore(hero, success.firstChild);
          for (var i = 0; i < 28; i++) {
            var c = document.createElement('div');
            c.className = 'pk-confetti';
            c.textContent = ['🥭', '✦', '●'][i % 3];
            c.style.left = (8 + Math.random() * 84) + '%';
            c.style.animationDelay = (Math.random() * 0.7) + 's';
            success.appendChild(c);
            (function (cc) { setTimeout(function () { cc.remove(); }, 3500); })(c);
          }
          window.scrollTo(0, 0);
        } catch (e) {}
      }

      var pending = null;
      function queueRefresh() { if (pending) clearTimeout(pending); pending = setTimeout(refresh, 60); }
      ['input', 'change', 'click'].forEach(function (evt) {
        document.addEventListener(evt, queueRefresh, { passive: true });
      });
      new MutationObserver(function () { queueRefresh(); }).observe(review, { childList: true, subtree: true });
      setInterval(queueRefresh, 4000);
      refresh();
    } catch (e) { /* never break checkout */ }
  }
})();
