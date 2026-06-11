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
    cards.forEach(function (card, idx) {
      var h2 = card.querySelector('h2');
      var title = h2 ? h2.childNodes[0].textContent.trim() : 'Recipe ' + (idx + 1);
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

    var cur = null, step = 0, timerInt = null;
    var $ = function (id) { return document.getElementById(id); };

    function openCook(i) {
      cur = recipes[i]; step = 0;
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
      $('rxCookNum').textContent = 'Step ' + (step + 1) + ' of ' + total;
      $('rxCookText').textContent = cur.steps[step];
      $('rxCookProg').style.width = ((step + 1) / total * 100) + '%';
      $('rxPrev').disabled = step === 0;
      $('rxNext').textContent = step === total - 1 ? 'Finish 🥭' : 'Next →';
      stopTimer();
      var m = cur.steps[step].match(/(\d+)\s*(?:-|–)?\s*(?:min|minute)/i);
      var tb = $('rxTimerBtn');
      if (m) {
        tb.hidden = false;
        tb.textContent = '⏱ Start ' + m[1] + '-minute timer';
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
          el.textContent = '✓ Time’s up!';
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
      $('rxCookText').textContent = 'Enjoy your ' + cur.title + '! Don’t forget to share. 🥭';
      $('rxCookNum').textContent = 'All done';
      $('rxNext').textContent = 'Close';
      $('rxNext').onclick = closeCook;
    }
    $('rxNext').addEventListener('click', function () {
      if (!cur) return;
      if (step < cur.steps.length - 1) { step++; render(); }
      else if ($('rxNext').textContent.indexOf('Finish') === 0) { celebrate(); }
      else { closeCook(); }
    });
    $('rxPrev').addEventListener('click', function () { if (cur && step > 0) { step--; render(); $('rxNext').onclick = null; } });
    overlay.querySelector('.rx-cook-close').addEventListener('click', closeCook);
    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') closeCook();
      if (e.key === 'ArrowRight') $('rxNext').click();
      if (e.key === 'ArrowLeft') $('rxPrev').click();
    });
  }
})();
