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
function injectGlobalUI() {
  // 1. WhatsApp Floating Button
  const waBtn = document.createElement('a');
  waBtn.id = 'waFloat';
  waBtn.href = `https://wa.me/${SHRISH_CONFIG.whatsappNumber}?text=${encodeURIComponent(SHRISH_CONFIG.whatsappMessage)}`;
  waBtn.target = '_blank';
  waBtn.rel = 'noopener';
  waBtn.setAttribute('aria-label', 'Chat on WhatsApp');
  waBtn.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
    <span>Chat with us</span>`;
  document.body.appendChild(waBtn);

  // 2. Back-to-Top Button
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

  // 3. Inject global styles for WA button + back-to-top + TOAST FIX
  const style = document.createElement('style');
  style.textContent = `
    /* WhatsApp Float */
    #waFloat {
      position: fixed; bottom: 88px; right: 24px; z-index: 999;
      background: #25D366; color: #fff;
      display: flex; align-items: center; gap: 8px;
      padding: 12px 18px; border-radius: 50px;
      font-family: 'Jost', sans-serif; font-size: 14px; font-weight: 700;
      text-decoration: none;
      box-shadow: 0 4px 20px rgba(37,211,102,.45);
      transition: all .3s; white-space: nowrap;
    }
    #waFloat:hover { background: #1da851; transform: translateY(-3px); box-shadow: 0 8px 28px rgba(37,211,102,.5); }
    #waFloat span { display: inline; }
    @media (max-width: 480px) {
      #waFloat { padding: 12px; border-radius: 50%; bottom: 88px; right: 16px; }
      #waFloat span { display: none; }
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

