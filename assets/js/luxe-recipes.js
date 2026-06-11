/* ============================================================
   SHRISH — RECIPES EXPERIENCE
   Sidebar index w/ scrollspy, persistent ingredient checklists,
   full-screen Cook Mode with auto timers + finish celebration.
   Vanilla JS, no deps.
   ============================================================ */
(function () {
  'use strict';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  function slug(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  var LS_KEY = 'shrishRecipeChecks';
  function loadChecks() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveChecks(c) { try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch (e) {} }

  function init() {
    var list = document.getElementById('recipesList');
    if (!list || !document.body.classList.contains('luxe')) return;
    var cards = Array.prototype.slice.call(list.querySelectorAll('.recipe-full-card'));
    if (!cards.length) return;
    var checks = loadChecks();

    /* ---- layout: sidebar + main ---- */
    var layout = document.createElement('div');
    layout.className = 'rx-layout';
    var side = document.createElement('aside');
    side.className = 'rx-side';
    side.innerHTML = '<div class="rx-side-title">All Recipes <span>' + cards.length + '</span></div>';
    var main = document.createElement('div');
    main.className = 'rx-main';
    list.parentNode.insertBefore(layout, list);
    layout.appendChild(side);
    layout.appendChild(main);
    main.appendChild(list);

    var recipes = [];
    var cardRefs = [];
    cards.forEach(function (card, idx) {
      var h2 = card.querySelector('h2');
      var title = h2 ? h2.childNodes[0].textContent.trim() : 'Recipe ' + (idx + 1);
      cardRefs.push({
        titleNode: h2 ? h2.childNodes[0] : null,
        smallNode: h2 ? h2.querySelector('small') : null,
        metaSpans: card.querySelectorAll('.recipe-meta span'),
        h4s: card.querySelectorAll('.recipe-section h4'),
        ingLis: card.querySelectorAll('.recipe-section ul li'),
        stepLis: card.querySelectorAll('.recipe-section ol li'),
        notePs: card.querySelectorAll('p[style*="font-size:13px"]')
      });
      var id = 'rx-' + slug(title);
      card.id = id;
      var img = card.querySelector('.recipe-full-img');
      var meta = card.querySelector('.recipe-meta');
      var metaText = meta ? meta.textContent.replace(/\s+/g, ' ').trim() : '';
      var ings = Array.prototype.slice.call(card.querySelectorAll('.recipe-section ul li'));
      var steps = Array.prototype.slice.call(card.querySelectorAll('.recipe-section ol li'));
      recipes.push({ id: id, title: title, img: img ? img.src : '', steps: steps.map(function (s) { return s.textContent.trim(); }), ings: ings.map(function (s) { return s.textContent.trim(); }) });

      /* sidebar item */
      var a = document.createElement('a');
      a.className = 'rx-side-item';
      a.href = '#' + id;
      a.innerHTML = (img ? '<img src="' + img.src + '" alt="" loading="lazy">' : '') +
        '<div><strong>' + title + '</strong><span>' + metaText + '</span></div>';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + id);
      });
      side.appendChild(a);

      /* cook mode button */
      if (steps.length) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rx-cook-btn';
        btn.innerHTML = '👨‍🍳 Cook Mode <em>step-by-step</em>';
        btn.addEventListener('click', function () { openCook(idx); });
        (meta || h2).insertAdjacentElement('afterend', btn);
      }

      /* checkable ingredients (persisted) */
      ings.forEach(function (li, i) {
        var key = id + ':' + i;
        li.classList.add('rx-ing');
        li.setAttribute('role', 'checkbox');
        li.setAttribute('tabindex', '0');
        if (checks[key]) li.classList.add('done');
        li.setAttribute('aria-checked', checks[key] ? 'true' : 'false');
        var toggle = function () {
          li.classList.toggle('done');
          var on = li.classList.contains('done');
          li.setAttribute('aria-checked', on ? 'true' : 'false');
          checks[key] = on ? 1 : 0;
          saveChecks(checks);
        };
        li.addEventListener('click', toggle);
        li.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
      });
    });

    /* ---- scrollspy ---- */
    var items = side.querySelectorAll('.rx-side-item');
    if ('IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var i = cards.indexOf(entry.target);
          items.forEach(function (it, j) { it.classList.toggle('active', i === j); });
        });
      }, { rootMargin: '-30% 0px -55% 0px' });
      cards.forEach(function (c) { spy.observe(c); });
    }

    /* ============ COOK MODE ============ */
    var overlay = document.createElement('div');
    overlay.className = 'rx-cook';
    overlay.innerHTML =
      '<div class="rx-cook-head">' +
        '<div class="rx-cook-title" id="rxCookTitle"></div>' +
        '<button type="button" class="rx-cook-close" aria-label="Exit cook mode">×</button>' +
      '</div>' +
      '<div class="rx-cook-prog"><span id="rxCookProg"></span></div>' +
      '<div class="rx-cook-stage">' +
        '<div class="rx-cook-stepnum" id="rxCookNum"></div>' +
        '<div class="rx-cook-text" id="rxCookText"></div>' +
        '<button type="button" class="rx-timer-btn" id="rxTimerBtn" hidden></button>' +
        '<div class="rx-timer" id="rxTimer" hidden></div>' +
      '</div>' +
      '<details class="rx-cook-ings"><summary>Ingredients</summary><ul id="rxCookIngs"></ul></details>' +
      '<div class="rx-cook-nav">' +
        '<button type="button" id="rxPrev">← Back</button>' +
        '<button type="button" id="rxNext" class="rx-next">Next →</button>' +
      '</div>';
    document.body.appendChild(overlay);

    var cur = null, step = 0, timerInt = null, done = false;
    var $ = function (id) { return document.getElementById(id); };

    function openCook(i) {
      cur = recipes[i]; step = 0; done = false;
      $('rxCookTitle').textContent = cur.title;
      $('rxCookIngs').innerHTML = cur.ings.map(function (g) { return '<li>' + g + '</li>'; }).join('');
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      render();
    }
    function closeCook() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      stopTimer();
    }
    function stopTimer() {
      if (timerInt) { clearInterval(timerInt); timerInt = null; }
      $('rxTimer').hidden = true;
    }
    function render() {
      var total = cur.steps.length;
      $('rxCookNum').textContent = T('stepOf').replace('{a}', step + 1).replace('{b}', total);
      $('rxCookText').textContent = cur.steps[step];
      $('rxCookProg').style.width = ((step + 1) / total * 100) + '%';
      $('rxPrev').disabled = step === 0;
      $('rxPrev').textContent = T('back');
      $('rxNext').textContent = step === total - 1 ? T('finish') : T('next');
      overlay.querySelector('.rx-cook-ings summary').textContent = T('ings');
      stopTimer();
      var m = cur.steps[step].match(/(\d+)\s*(?:-|–)?\s*(?:min|minute|मिनट|मिनिट|निमिष|નિમિષ|મિનિટ|నిమిష)/i);
      var tb = $('rxTimerBtn');
      if (m) {
        tb.hidden = false;
        tb.textContent = T('timer').replace('{n}', m[1]);
        tb.onclick = function () { startTimer(parseInt(m[1], 10) * 60); tb.hidden = true; };
      } else { tb.hidden = true; }
    }
    function startTimer(secs) {
      var el = $('rxTimer');
      el.hidden = false;
      var end = Date.now() + secs * 1000;
      var tick = function () {
        var left = Math.max(0, Math.round((end - Date.now()) / 1000));
        el.textContent = '⏱ ' + Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
        if (left <= 0) {
          stopTimer();
          el.hidden = false;
          el.textContent = T('up');
          chime();
        }
      };
      tick();
      timerInt = setInterval(tick, 500);
    }
    function chime() {
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.18, 0.36].forEach(function (t, i) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = [880, 1100, 1320][i];
          g.gain.setValueAtTime(0.18, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.5);
          o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.5);
        });
      } catch (e) {}
    }
    function celebrate() {
      for (var i = 0; i < 26; i++) {
        var p = document.createElement('div');
        p.className = 'rx-confetti';
        p.textContent = ['🥭', '✦', '●'][i % 3];
        p.style.left = (15 + Math.random() * 70) + '%';
        p.style.animationDelay = (Math.random() * 0.5) + 's';
        p.style.fontSize = (12 + Math.random() * 18) + 'px';
        overlay.appendChild(p);
        (function (pp) { setTimeout(function () { pp.remove(); }, 3200); })(p);
      }
      $('rxCookText').textContent = T('enjoy').replace('{t}', cur.title);
      $('rxCookNum').textContent = T('done');
      $('rxNext').textContent = T('close');
    }
    $('rxNext').addEventListener('click', function () {
      if (!cur) return;
      if (done) { closeCook(); return; }
      if (step < cur.steps.length - 1) { step++; render(); }
      else { done = true; celebrate(); }
    });
    $('rxPrev').addEventListener('click', function () {
      if (!cur) return;
      if (done) { done = false; render(); return; }
      if (step > 0) { step--; render(); }
    });
    overlay.querySelector('.rx-cook-close').addEventListener('click', closeCook);

    /* ============ LANGUAGE SWITCHER (en/hi/te/gu/mr) ============ */
    var I18N = window.SHRISH_RX_I18N || null;
    var curLang = 'en';
    function T(key) {
      var ui = I18N && I18N.ui[curLang] ? I18N.ui[curLang] : (I18N ? I18N.ui.en : null);
      if (!ui) {
        var fallback = { stepOf:'Step {a} of {b}', ings:'Ingredients', back:'← Back', next:'Next →', finish:'Finish 🥭', close:'Close', done:'All done', enjoy:'Enjoy your {t}! 🥭', timer:'⏱ Start {n}-minute timer', up:'✓ Time’s up!' };
        return fallback[key] || key;
      }
      return ui[key] !== undefined ? ui[key] : (I18N.ui.en[key] || key);
    }
    window.__rxT = T;

    if (I18N) {
      var LANG_LABELS = { en:'EN', hi:'हिंदी', te:'తెలుగు', gu:'ગુજરાતી', mr:'मराठी' };
      var switcher = document.createElement('div');
      switcher.className = 'rx-lang';
      switcher.setAttribute('role', 'group');
      switcher.setAttribute('aria-label', 'Recipe language');
      switcher.innerHTML = '<span class="rx-lang-icon">🌐</span>' + Object.keys(LANG_LABELS).map(function (c) {
        return '<button type="button" data-lang="' + c + '"' + (c === 'en' ? ' class="active"' : '') + '>' + LANG_LABELS[c] + '</button>';
      }).join('');
      side.insertBefore(switcher, side.firstChild);

      function applyLang(code) {
        if (!I18N.ui[code]) code = 'en';
        curLang = code;
        try { localStorage.setItem('shrishRecipeLang', code); } catch (e) {}
        switcher.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('active', b.dataset.lang === code);
        });
        var ui = I18N.ui[code];
        var hero = document.querySelector('.page-hero h1');
        if (hero) hero.innerHTML = ui.heroTitle;
        var heroP = document.querySelector('.page-hero p');
        if (heroP) heroP.textContent = ui.heroSub;
        var st = side.querySelector('.rx-side-title');
        if (st) st.firstChild.textContent = ui.all + ' ';
        document.querySelectorAll('.rx-cook-btn').forEach(function (b) {
          b.innerHTML = '👨‍🍳 ' + ui.cook + ' <em>' + ui.cookEm + '</em>';
        });
        var noteBox = document.querySelector('[style*="max-width:1100px"] strong');
        if (noteBox) {
          noteBox.textContent = ui.note;
          var nb = noteBox.parentNode;
          while (nb.childNodes.length > 1) nb.removeChild(nb.lastChild);
          nb.appendChild(document.createTextNode(' ' + ui.noteText));
        }
        I18N.recipes.forEach(function (entry, i) {
          var t = entry[code] || entry.en;
          var refs = cardRefs[i];
          if (!refs) return;
          if (refs.titleNode) refs.titleNode.textContent = t.title + ' ';
          if (refs.smallNode) refs.smallNode.textContent = t.small || '';
          refs.metaSpans.forEach(function (sp, j) { if (t.meta[j]) sp.textContent = t.meta[j]; });
          refs.h4s.forEach(function (h, j) { if (t.heads[j]) h.textContent = t.heads[j]; });
          refs.ingLis.forEach(function (li, j) { if (t.ings[j]) li.textContent = t.ings[j]; });
          refs.stepLis.forEach(function (li, j) { if (t.steps[j]) li.textContent = t.steps[j]; });
          refs.notePs.forEach(function (pEl, j) { if (t.notes[j]) pEl.textContent = t.notes[j]; });
          recipes[i].title = t.title;
          recipes[i].steps = t.steps.slice();
          recipes[i].ings = t.ings.slice();
          var sideStrong = items[i] && items[i].querySelector('strong');
          if (sideStrong) sideStrong.textContent = t.title;
          var sideSpan = items[i] && items[i].querySelector('div span');
          if (sideSpan) sideSpan.textContent = t.meta.join(' ');
        });
        if (overlay.classList.contains('open') && cur) {
          var idx2 = recipes.indexOf(cur);
          if (idx2 >= 0) { cur = recipes[idx2]; if (step >= cur.steps.length) step = cur.steps.length - 1; render(); }
          $('rxCookTitle').textContent = cur.title;
          $('rxCookIngs').innerHTML = cur.ings.map(function (g) { return '<li>' + g + '</li>'; }).join('');
        }
      }
      switcher.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-lang]');
        if (b) applyLang(b.dataset.lang);
      });
      var saved = 'en';
      try { saved = localStorage.getItem('shrishRecipeLang') || 'en'; } catch (e) {}
      if (saved !== 'en') applyLang(saved);
    }

    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') closeCook();
      if (e.key === 'ArrowRight') $('rxNext').click();
      if (e.key === 'ArrowLeft') $('rxPrev').click();
    });
  }
})();
