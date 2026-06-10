/* ============================================================
   SHRISH — LUXE v2 ANIMATION ENGINE
   Scroll progress, liquid blob tilt, sticky-stack depth,
   timeline draw, counters, magnetic buttons, recipe tilt,
   glass nav, ambient glow. Reduced-motion safe. Zero deps.
   ============================================================ */
(function () {
  'use strict';
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  var booted = false;

  function init() {
    if (booted || !document.body.classList.contains('luxe')) return;
    booted = true;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* -- glass nav condenses on scroll ------------------------ */
    var nav = document.querySelector('.nav');
    var progress = document.getElementById('lxProgressBar');
    var tlDraw = document.getElementById('lxTlDraw');
    var tlWrap = document.getElementById('lxTimeline');
    var onScroll = function () {
      var y = window.scrollY;
      if (nav) nav.classList.toggle('lx-scrolled', y > 40);
      if (progress) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
      if (tlDraw && tlWrap) {
        var r = tlWrap.getBoundingClientRect();
        var vh = window.innerHeight;
        var p = Math.min(1, Math.max(0, (vh * 0.75 - r.top) / (r.height || 1)));
        tlDraw.style.transform = 'scaleY(' + p + ')';
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* -- sticky stack: dim/scale covered panels --------------- */
    var panels = Array.prototype.slice.call(document.querySelectorAll('.lx-panel'));
    if (panels.length > 1 && 'IntersectionObserver' in window) {
      panels.forEach(function (panel, i) {
        if (i === 0) return;
        var prev = panels[i - 1];
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            prev.classList.toggle('lx-covered', entry.intersectionRatio > 0.28);
          });
        }, { threshold: [0, 0.28, 0.6] });
        io.observe(panel);
      });
    }

    if (reduce) return; /* decoration below */

    /* -- scroll reveals --------------------------------------- */
    var revealTargets = document.querySelectorAll(
      '.lx-panel-copy > *, .lx-story-art, .lx-quote-card, .faq-item, ' +
      '.footer-brand, .footer-nav, .footer-subscribe, .shop-sidebar, ' +
      '.sweets-spotlight-inner, .coming-banner, .shop-safety-notice'
    );
    if ('IntersectionObserver' in window && revealTargets.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('lx-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealTargets.forEach(function (el, i) {
        var rect = el.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.88) {
          el.classList.add('lx-reveal');
          el.style.transitionDelay = (i % 5) * 60 + 'ms';
          io.observe(el);
        }
      });
    }

    var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    /* -- 3D tilt: hero blob + recipe cards --------------------- */
    if (canHover) {
      var tiltTargets = [{ el: document.getElementById('lxBlob'), max: 7 }];
      document.querySelectorAll('.lx-tilt').forEach(function (el) {
        tiltTargets.push({ el: el, max: 5 });
      });
      tiltTargets.forEach(function (t) {
        if (!t.el) return;
        t.el.addEventListener('mousemove', function (e) {
          var r = t.el.getBoundingClientRect();
          var rx = ((e.clientY - r.top) / r.height - 0.5) * -2 * t.max;
          var ry = ((e.clientX - r.left) / r.width - 0.5) * 2 * t.max;
          t.el.style.transform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
        });
        t.el.addEventListener('mouseleave', function () {
          t.el.style.transform = '';
        });
      });
    }

    /* -- stat counters ----------------------------------------- */
    var stats = document.querySelectorAll('.stat-num');
    if (stats.length && 'IntersectionObserver' in window) {
      var statIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          statIO.unobserve(entry.target);
          var el = entry.target;
          var raw = el.textContent.trim();
          var match = raw.match(/^([0-9.]+)(.*)$/);
          if (!match) return;
          var target = parseFloat(match[1]);
          var suffix = match[2] || '';
          var decimals = (match[1].split('.')[1] || '').length;
          var start = null;
          var dur = 1400;
          var step = function (ts) {
            if (!start) start = ts;
            var p = Math.min(1, (ts - start) / dur);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = (target * eased).toFixed(decimals) + suffix;
            if (p < 1) window.requestAnimationFrame(step);
            else el.textContent = raw;
          };
          window.requestAnimationFrame(step);
        });
      }, { threshold: 0.6 });
      stats.forEach(function (el) { statIO.observe(el); });
    }

    /* -- magnetic buttons -------------------------------------- */
    if (canHover) {
      document.addEventListener('mousemove', function (e) {
        var btn = e.target.closest('.lx-btn, .btn-primary, .btn-ghost, .cart-checkout-btn, .st-price-apply');
        document.querySelectorAll('.lx-magnet').forEach(function (el) {
          if (el !== btn) {
            el.classList.remove('lx-magnet');
            el.style.translate = '';
          }
        });
        if (!btn) return;
        btn.classList.add('lx-magnet');
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.translate = (dx * 7) + 'px ' + (dy * 5) + 'px';
      }, { passive: true });

      /* -- ambient cursor glow -------------------------------- */
      var glow = document.createElement('div');
      glow.className = 'lx-glow';
      glow.style.opacity = '0';
      document.body.appendChild(glow);
      var gx = 0, gy = 0, tx = 0, ty = 0, glowRaf = null;
      var lerp = function () {
        gx += (tx - gx) * 0.08;
        gy += (ty - gy) * 0.08;
        glow.style.left = gx + 'px';
        glow.style.top = gy + 'px';
        if (Math.abs(tx - gx) > 0.5 || Math.abs(ty - gy) > 0.5) {
          glowRaf = window.requestAnimationFrame(lerp);
        } else {
          glowRaf = null;
        }
      };
      document.addEventListener('mousemove', function (e) {
        tx = e.clientX; ty = e.clientY;
        glow.style.opacity = '1';
        if (!glowRaf) glowRaf = window.requestAnimationFrame(lerp);
      }, { passive: true });
      document.addEventListener('mouseleave', function () { glow.style.opacity = '0'; });
    }

    /* -- gold spotlight follows cursor across product cards ---- */
    if (canHover) {
      var spotRaf = null, spotEvent = null;
      document.addEventListener('mousemove', function (e) {
        spotEvent = e;
        if (spotRaf) return;
        spotRaf = window.requestAnimationFrame(function () {
          spotRaf = null;
          var card = spotEvent.target.closest('.pc, .product-card');
          if (!card) return;
          var r = card.getBoundingClientRect();
          card.style.setProperty('--mx', ((spotEvent.clientX - r.left) / r.width * 100) + '%');
          card.style.setProperty('--my', ((spotEvent.clientY - r.top) / r.height * 100) + '%');
        });
      }, { passive: true });
    }

    /* -- flying gold droplet on add-to-cart -------------------- */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.pc-add-btn, .pc-size-add-btn, .cu-add, .modal-add-btn');
      if (!btn || btn.disabled) return;
      var fab = document.getElementById('cartFab') || document.getElementById('globalCartFab') || document.getElementById('navCartLink');
      if (!fab) return;
      var from = btn.getBoundingClientRect();
      var to = fab.getBoundingClientRect();
      var drop = document.createElement('div');
      drop.className = 'lx-drop';
      drop.style.left = (from.left + from.width / 2 - 11) + 'px';
      drop.style.top = (from.top + from.height / 2 - 11) + 'px';
      document.body.appendChild(drop);
      var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
      var dy = (to.top + to.height / 2) - (from.top + from.height / 2);
      var anim = drop.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '46% 54% 52% 48%/58% 44% 56% 42%' },
        { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 90) + 'px) scale(.85) rotate(120deg)', opacity: 1, borderRadius: '58% 42% 46% 54%/44% 58% 42% 56%', offset: 0.55 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.25) rotate(240deg)', opacity: .9 }
      ], { duration: 720, easing: 'cubic-bezier(.4,0,.6,1)' });
      anim.onfinish = function () {
        drop.remove();
        fab.classList.remove('lx-fab-pulse');
        void fab.offsetWidth;
        fab.classList.add('lx-fab-pulse');
      };
    }, true);

    /* -- scroll-velocity reactive marquees ---------------------- */
    var marqs = document.querySelectorAll('.marquee-wrap');
    if (marqs.length) {
      var lastY = window.scrollY, vel = 0, skew = 0, marqRaf = null;
      var marqTick = function () {
        skew += (vel - skew) * 0.12;
        vel *= 0.86;
        marqs.forEach(function (m) {
          m.style.transform = (m.closest('.lx-marq-tilt') ? 'skewX(' + skew + 'deg)' : 'skewX(' + skew + 'deg)');
        });
        if (Math.abs(skew) > 0.05 || Math.abs(vel) > 0.05) {
          marqRaf = window.requestAnimationFrame(marqTick);
        } else {
          marqs.forEach(function (m) { m.style.transform = ''; });
          marqRaf = null;
        }
      };
      window.addEventListener('scroll', function () {
        var y = window.scrollY;
        vel = Math.max(-8, Math.min(8, (y - lastY) * 0.35));
        lastY = y;
        if (!marqRaf) marqRaf = window.requestAnimationFrame(marqTick);
      }, { passive: true });
    }
  }
})();
