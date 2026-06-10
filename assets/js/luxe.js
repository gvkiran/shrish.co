/* ============================================================
   SHRISH - LUXE ANIMATION ENGINE
   Scroll reveals, parallax, counters, glass nav, magnetic
   buttons, ambient glow. Reduced-motion safe. No dependencies.
   ============================================================ */
(function () {
  'use strict';
  if (!document.body || !document.body.classList.contains('luxe')) {
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
    if (nav) {
      var onScrollNav = function () {
        nav.classList.toggle('lx-scrolled', window.scrollY > 40);
      };
      window.addEventListener('scroll', onScrollNav, { passive: true });
      onScrollNav();
    }

    if (reduce) return; /* everything below is pure decoration */

    /* -- scroll reveals (elements main.js does not handle) ---- */
    var revealTargets = document.querySelectorAll(
      '.sweets-spotlight-inner, .shop-sidebar, .about-img-wrap, .about-teaser-img-wrap, ' +
      '.faq-item, .footer-brand, .footer-col, .coming-banner, .shop-safety-notice, .section-cta'
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
        if (rect.top > window.innerHeight * 0.9) {
          el.classList.add('lx-reveal');
          el.style.transitionDelay = (i % 4) * 70 + 'ms';
          io.observe(el);
        }
      });
    }

    /* -- hero parallax ---------------------------------------- */
    var heroVisuals = document.querySelectorAll('.hero-img-frame');
    if (heroVisuals.length) {
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          var y = window.scrollY;
          if (y < window.innerHeight * 1.2) {
            heroVisuals.forEach(function (el) {
              el.style.translate = '0 ' + y * 0.12 + 'px';
            });
          }
          ticking = false;
        });
      }, { passive: true });
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
    var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover) {
      document.addEventListener('mousemove', function (e) {
        var btn = e.target.closest('.btn-primary, .btn-ghost, .cart-checkout-btn, .st-price-apply');
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
  }
})();
