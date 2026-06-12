/* ============================================================
   SHRISH — THE PACKING ROOM
   A living checkout: your box packs itself as you shop and type.
   Read-only layer: listens to existing inputs and cart renders,
   never intercepts or alters the order flow.
   ============================================================ */
(function () {
  'use strict';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function $(id) { return document.getElementById(id); }

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
      var review = document.getElementById('cartReviewContainer');
      var sidebar = document.querySelector('.checkout-sidebar');
      var submit = $('submitBtn');
      if (!wrap || !review || !sidebar || !submit) return;
      document.body.classList.add('packing-room');

      /* ---------- journey strip ---------- */
      var journey = document.createElement('div');
      journey.className = 'pk-journey';
      journey.innerHTML =
        '<div class="pk-step" data-step="cart"><span class="pk-dot">🧺</span>Your Box</div>' +
        '<div class="pk-line" data-line="1"><span></span></div>' +
        '<div class="pk-step" data-step="details"><span class="pk-dot">✍️</span>Your Details</div>' +
        '<div class="pk-line" data-line="2"><span></span></div>' +
        '<div class="pk-step" data-step="pickup"><span class="pk-dot">📍</span>Pickup Spot</div>' +
        '<div class="pk-line" data-line="3"><span></span></div>' +
        '<div class="pk-step" data-step="seal"><span class="pk-dot">🥭</span>Seal It</div>';
      wrap.parentNode.insertBefore(journey, wrap);

      /* ---------- the living box ---------- */
      var box = document.createElement('div');
      box.className = 'pk-box-card';
      box.innerHTML =
        '<div class="pk-box-kicker">The Packing Room</div>' +
        '<div class="pk-box-name" id="pkName">Packing <em>your</em> box…</div>' +
        '<div class="pk-crate"><div class="pk-stamp" id="pkStamp"></div><div class="pk-items" id="pkItems"></div></div>' +
        '<div class="pk-due"><span class="lbl">Due today</span><span class="amt">$0.00</span></div>' +
        '<div class="pk-due-sub" id="pkDueSub"></div>' +
        '<div class="pk-ribbon" id="pkRibbon">Packing in progress…</div>';
      sidebar.insertBefore(box, sidebar.firstChild);

      /* ---------- readiness meter under the button ---------- */
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

      /* ---------- state readers ---------- */
      function readCart() {
        var items = [];
        review.querySelectorAll('.review-item').forEach(function (r) {
          var nm = r.querySelector('.ri-name');
          var q = r.querySelector('.ri-qty-value');
          if (nm) items.push({ name: nm.textContent.trim(), qty: q ? q.textContent.trim() : '1' });
        });
        var totEl = review.querySelector('.rt-price');
        return { items: items, total: totEl ? totEl.textContent.trim() : '' };
      }

      function phoneOk() { var v = ($('phone') || {}).value || ''; return v.replace(/\D/g, '').length >= 10; }
      function emailOk() { var v = ($('email') || {}).value || ''; return /\S+@\S+\.\S+/.test(v); }
      function nameOk() { var v = ($('firstName') || {}).value || ''; return v.trim().length >= 2; }
      function locPicked() { return !!document.querySelector('.loc-card.selected'); }

      var LOC_LABELS = { shortpump: 'Short Pump, VA', chesterfield: 'Chesterfield, VA', mechanicsville: 'Mechanicsville, VA' };

      function refresh() {
        try {
          var cart = readCart();
          var hasItems = cart.items.length > 0;

          /* box items */
          var itemsEl = $('pkItems');
          var html = '';
          if (hasItems) {
            cart.items.slice(0, 8).forEach(function (it) {
              html += '<span class="pk-item">' + itemEmoji(it.name) + ' ' + it.name.replace(/</g, '&lt;').slice(0, 26) + ' <span class="pk-qty">×' + it.qty + '</span></span>';
            });
            if (cart.items.length > 8) html += '<span class="pk-item">＋' + (cart.items.length - 8) + ' more</span>';
          } else {
            html = '<div class="pk-empty">Your box is empty — <a href="shop.html">add something delicious</a></div>';
          }
          if (itemsEl.innerHTML !== html) itemsEl.innerHTML = html;

          /* name on the slip */
          var fn = (($('firstName') || {}).value || '').trim();
          $('pkName').innerHTML = fn
            ? 'Packing <em>' + fn.replace(/</g, '&lt;').slice(0, 18) + '’s</em> box'
            : 'Packing <em>your</em> box…';

          /* stamp */
          var sel = document.querySelector('.loc-card.selected');
          var stamp = $('pkStamp');
          if (sel && LOC_LABELS[sel.dataset.loc]) {
            stamp.textContent = '→ ' + LOC_LABELS[sel.dataset.loc];
            stamp.classList.add('on');
          } else { stamp.classList.remove('on'); }

          /* due today vs at pickup */
          $('pkDueSub').innerHTML = cart.total
            ? 'Pay <strong>' + cart.total + '</strong> at pickup — cash, card or Zelle'
            : '';

          /* readiness */
          var steps = [hasItems, nameOk(), phoneOk() && emailOk(), locPicked()];
          var pct = Math.round(steps.filter(Boolean).length / steps.length * 100);
          submit.style.setProperty('--charge', pct);
          submit.classList.toggle('pk-ready', pct === 100);
          $('pkMeterFill').style.width = pct + '%';
          $('pkPct').textContent = pct + '%';
          var missing = [];
          if (!hasItems) missing.push('add an item');
          if (!nameOk()) missing.push('your name');
          if (!(phoneOk() && emailOk())) missing.push('phone & email');
          if (!locPicked()) missing.push('pickup spot');
          $('pkHint').textContent = pct === 100
            ? '🥭 Everything’s packed — seal it below!'
            : 'Still needed: ' + missing.join(' · ');

          var ribbon = $('pkRibbon');
          ribbon.textContent = pct === 100 ? '🥭 Ready to seal — place your order' : 'Packing in progress… ' + pct + '%';
          ribbon.classList.toggle('ready', pct === 100);

          /* journey */
          var states = { cart: hasItems, details: nameOk() && phoneOk() && emailOk(), pickup: locPicked(), seal: pct === 100 };
          journey.querySelectorAll('.pk-step').forEach(function (st) {
            st.classList.toggle('done', !!states[st.dataset.step]);
          });
          journey.querySelectorAll('.pk-line').forEach(function (ln, i) {
            var on = [states.cart, states.details, states.pickup][i];
            ln.classList.toggle('fill', !!on);
          });
        } catch (e) { /* decorative layer must never break checkout */ }
      }

      var pkPending = null;
      function queueRefresh() {
        if (pkPending) clearTimeout(pkPending);
        pkPending = setTimeout(refresh, 60);
      }
      ['input', 'change', 'click', 'keyup'].forEach(function (evt) {
        document.addEventListener(evt, queueRefresh, { passive: true });
      });
      setInterval(refresh, 1500); /* belt & braces: stays correct even if an event slips by */
      new MutationObserver(function () { refresh(); }).observe(review, { childList: true, subtree: true });
      refresh();
    } catch (e) { /* never break checkout */ }
  }
})();
