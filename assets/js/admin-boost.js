/* ============================================================
   SHRISH ADMIN BOOST — power layer
   Command palette (Ctrl/Cmd+K), smart briefing, keyboard
   shortcuts, focus mode, copy-pickup-message, new-order flash.
   100% additive: reads the DOM, clicks existing buttons.
   ============================================================ */
(function () {
  'use strict';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = document.querySelector('.boost-toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'boost-toast' }));
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function init() {
    if (!$('ordersBody')) return; /* not the admin app */

    /* ================= 1. SMART BRIEFING ================= */
    var briefing = document.createElement('div');
    briefing.className = 'boost-brief';
    briefing.innerHTML = '<span class="bb-icon">☀️</span><span class="bb-text">Loading your day…</span><span class="bb-hint">Ctrl+K for anything · ? for shortcuts</span>';
    var ordersTab = $('tab-orders');
    if (ordersTab) ordersTab.insertBefore(briefing, ordersTab.firstChild);

    function statVal(label) {
      var out = null;
      document.querySelectorAll('#adminStats .stat-card').forEach(function (c) {
        var l = c.querySelector('.s-label');
        if (l && l.textContent.trim() === label) out = (c.querySelector('.s-value') || {}).textContent;
      });
      return out;
    }
    function refreshBriefing() {
      var h = new Date().getHours();
      var greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      var icon = h < 12 ? '☀️' : h < 17 ? '🥭' : '🌙';
      var pending = statVal('Pending Pickup');
      var revenue = statVal('Revenue');
      var boxes = null, topProduct = null;
      var summary = $('activeOrderSummary');
      if (summary) {
        var chips = summary.querySelectorAll('.summary-pill, span, strong');
        var m = summary.textContent.match(/(\d+)\s*boxes/i);
        if (m) boxes = m[1];
        var best = null, bestN = 0;
        summary.querySelectorAll('*').forEach(function (el) {
          var t = el.textContent.trim();
          var mm = t.match(/^(.{3,40}?)\s+(\d+)$/);
          if (mm && el.children.length <= 1 && parseInt(mm[2], 10) > bestN && !/orders|boxes/i.test(mm[1])) {
            bestN = parseInt(mm[2], 10); best = mm[1];
          }
        });
        if (best) topProduct = best + ' (' + bestN + ')';
      }
      var parts = [];
      if (pending) parts.push('<strong>' + pending + '</strong> pickups pending' + (boxes ? ' · <strong>' + boxes + '</strong> boxes' : ''));
      if (topProduct) parts.push('top mover: <strong>' + topProduct + '</strong>');
      if (revenue) parts.push('revenue <strong>' + revenue + '</strong>');
      briefing.querySelector('.bb-icon').textContent = icon;
      briefing.querySelector('.bb-text').innerHTML = greet + '! ' + (parts.length ? parts.join(' — ') : 'Your dashboard is warming up…');
    }
    var briefTimer = setInterval(refreshBriefing, 4000);
    refreshBriefing();

    /* ================= 2. COMMAND PALETTE ================= */
    var pal = document.createElement('div');
    pal.className = 'boost-pal';
    pal.innerHTML = '<div class="bp-box"><div class="bp-inputwrap"><span>⌘</span><input type="text" id="bpInput" placeholder="Jump to a tab, find an order, run an action…" autocomplete="off"></div><div class="bp-list" id="bpList"></div><div class="bp-foot">↑↓ navigate · Enter select · Esc close</div></div>';
    document.body.appendChild(pal);
    var bpInput = pal.querySelector('#bpInput');
    var bpList = pal.querySelector('#bpList');
    var bpItems = [], bpSel = 0;

    function collectCommands() {
      var cmds = [];
      document.querySelectorAll('.admin-tab').forEach(function (b) {
        cmds.push({ icon: '🧭', label: b.textContent.trim(), hint: 'Go to tab', run: function () { b.click(); } });
      });
      document.querySelectorAll('.sheet-pill').forEach(function (b) {
        cmds.push({ icon: '📑', label: b.textContent.trim(), hint: 'Orders view', run: function () { b.click(); } });
      });
      document.querySelectorAll('.toolbar-btn').forEach(function (b) {
        if (b.offsetParent === null && b.style.display === 'none') return;
        cmds.push({ icon: '⚡', label: b.textContent.trim(), hint: 'Action', run: function () { b.click(); } });
      });
      [['pending', 'Show Pending only'], ['fulfilled', 'Show Fulfilled only'], ['all', 'Show All statuses']].forEach(function (f) {
        cmds.push({ icon: '🔍', label: f[1], hint: 'Filter', run: function () {
          var sel = $('filterStatus'); if (sel) { sel.value = f[0]; if (window.renderOrders) window.renderOrders(); }
        } });
      });
      document.querySelectorAll('#ordersBody tr[id^="row-"]').forEach(function (row) {
        var idEl = row.querySelector('.order-id');
        var nameEl = row.querySelector('.customer-name');
        var phoneEl = row.querySelector('.customer-phone');
        if (!idEl) return;
        cmds.push({
          icon: '📦',
          label: (idEl.textContent.trim() + ' — ' + (nameEl ? nameEl.textContent.trim() : '')).trim(),
          search: [idEl.textContent, nameEl && nameEl.textContent, phoneEl && phoneEl.textContent].join(' ').toLowerCase(),
          hint: 'Order',
          run: function () {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.remove('boost-flash'); void row.offsetWidth; row.classList.add('boost-flash');
          }
        });
      });
      cmds.push({ icon: '🖥', label: 'Toggle Focus Mode', hint: 'Big-table mode for pickup days', run: toggleFocus });
      return cmds;
    }
    function fuzzy(q, text) {
      q = q.toLowerCase(); text = text.toLowerCase();
      if (text.indexOf(q) >= 0) return 2;
      var i = 0;
      for (var c = 0; c < text.length && i < q.length; c++) if (text[c] === q[i]) i++;
      return i === q.length ? 1 : 0;
    }
    function renderPal() {
      var q = bpInput.value.trim();
      var all = collectCommands();
      bpItems = !q ? all.slice(0, 12) : all
        .map(function (c) { return { c: c, s: fuzzy(q, c.search || c.label) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 12)
        .map(function (x) { return x.c; });
      bpSel = 0;
      bpList.innerHTML = bpItems.map(function (c, i) {
        return '<div class="bp-item' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '"><span class="bp-ic">' + c.icon + '</span><span class="bp-lb">' + c.label + '</span><span class="bp-ht">' + c.hint + '</span></div>';
      }).join('') || '<div class="bp-empty">No matches — try an order number, name, or tab</div>';
    }
    function openPal() { pal.classList.add('open'); bpInput.value = ''; renderPal(); setTimeout(function () { bpInput.focus(); }, 30); }
    function closePal() { pal.classList.remove('open'); }
    function runSel() { if (bpItems[bpSel]) { closePal(); bpItems[bpSel].run(); } }
    bpInput.addEventListener('input', renderPal);
    bpInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        bpSel = (bpSel + (e.key === 'ArrowDown' ? 1 : -1) + bpItems.length) % Math.max(1, bpItems.length);
        bpList.querySelectorAll('.bp-item').forEach(function (el, i) { el.classList.toggle('sel', i === bpSel); });
        var selEl = bpList.querySelector('.bp-item.sel');
        if (selEl) selEl.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { runSel(); }
      else if (e.key === 'Escape') { closePal(); }
    });
    bpList.addEventListener('click', function (e) {
      var it = e.target.closest('.bp-item');
      if (it) { bpSel = +it.dataset.i; runSel(); }
    });
    pal.addEventListener('click', function (e) { if (e.target === pal) closePal(); });

    /* ================= 3. SHORTCUTS + CHEAT SHEET ================= */
    var cheat = document.createElement('div');
    cheat.className = 'boost-cheat';
    cheat.innerHTML = '<div class="bc-box"><h3>⌨ Admin Shortcuts</h3><table>' +
      '<tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Command palette — anything, instantly</td></tr>' +
      '<tr><td><kbd>/</kbd></td><td>Focus order search</td></tr>' +
      '<tr><td><kbd>F</kbd></td><td>Focus mode (hide panels, big table)</td></tr>' +
      '<tr><td><kbd>G</kbd> then <kbd>O</kbd>/<kbd>P</kbd>/<kbd>T</kbd></td><td>Go to Orders / Products / Pickup Tally</td></tr>' +
      '<tr><td><kbd>?</kbd></td><td>This cheat sheet</td></tr>' +
      '</table><p>Hover any order row → 💬 copies a ready WhatsApp pickup message.</p><button onclick="this.closest(\'.boost-cheat\').classList.remove(\'open\')">Got it</button></div>';
    document.body.appendChild(cheat);
    cheat.addEventListener('click', function (e) { if (e.target === cheat) cheat.classList.remove('open'); });

    var gPending = false, gTimer = null;
    document.addEventListener('keydown', function (e) {
      var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPal(); return; }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); var s = $('filterSearch'); if (s) { s.focus(); s.select(); } }
      else if (e.key === '?') { cheat.classList.toggle('open'); }
      else if (e.key.toLowerCase() === 'f') { toggleFocus(); }
      else if (e.key.toLowerCase() === 'g') { gPending = true; clearTimeout(gTimer); gTimer = setTimeout(function () { gPending = false; }, 900); }
      else if (gPending) {
        gPending = false;
        var map = { o: 'Orders', p: 'Manage Products', t: 'Pickup Tally', c: 'Customer Accounts', s: 'Subscribers', a: 'Accounting', r: 'Refunds', d: 'Growth Dashboard' };
        var want = map[e.key.toLowerCase()];
        if (want) document.querySelectorAll('.admin-tab').forEach(function (b) {
          if (b.textContent.indexOf(want) >= 0) b.click();
        });
      }
    });

    /* ================= 4. FOCUS MODE ================= */
    function toggleFocus() {
      document.body.classList.toggle('boost-focus');
      toast(document.body.classList.contains('boost-focus') ? 'Focus mode on — press F to exit' : 'Focus mode off');
    }

    /* ================= 5. COPY PICKUP MESSAGE + NEW-ORDER FLASH ================= */
    var seen = {};
    try { seen = JSON.parse(sessionStorage.getItem('boostSeenOrders') || '{}'); } catch (e) {}
    var firstRender = true;
    function decorateRows() {
      var rows = document.querySelectorAll('#ordersBody tr[id^="row-"]');
      rows.forEach(function (row) {
        var oid = row.id;
        if (!firstRender && !seen[oid]) {
          row.classList.add('boost-flash');
        }
        seen[oid] = 1;
        var actions = row.querySelector('.action-btns');
        if (actions && !actions.querySelector('.boost-copy')) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'action-btn boost-copy';
          b.textContent = '💬 Msg';
          b.title = 'Copy WhatsApp-ready pickup message';
          b.addEventListener('click', function () {
            var name = (row.querySelector('.customer-name') || {}).textContent || 'there';
            var num = (row.querySelector('.order-id') || {}).textContent || '';
            var total = (row.querySelector('.total-amount') || {}).textContent || '';
            var cells = row.querySelectorAll('td');
            var items = cells[4] ? cells[4].innerText.replace(/\s+/g, ' ').trim() : '';
            var loc = cells[6] ? cells[6].textContent.trim() : '';
            var msg = 'Hi ' + name.split(' ')[0] + '! 🥭 Your Shrish order ' + num + ' (' + items + ' — ' + total + ') is ready for pickup at ' + loc + '. See you soon!\n— Shrish LLC';
            (navigator.clipboard ? navigator.clipboard.writeText(msg) : Promise.reject()).then(
              function () { toast('Pickup message copied — paste into WhatsApp'); },
              function () { window.prompt('Copy this message:', msg); }
            );
          });
          actions.appendChild(b);
        }
      });
      if (rows.length) {
        firstRender = false;
        try { sessionStorage.setItem('boostSeenOrders', JSON.stringify(seen)); } catch (e) {}
      }
    }
    new MutationObserver(function () { decorateRows(); refreshBriefing(); }).observe($('ordersBody'), { childList: true });
    decorateRows();
  }
})();
