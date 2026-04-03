// ============================================================
//  SHRISH LLC — Main JavaScript
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // ── NAV SCROLL ──────────────────────────────────────────
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  // ── HAMBURGER ───────────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const navMobile = document.getElementById('navMobile');
  if (hamburger && navMobile) {
    hamburger.addEventListener('click', () => {
      navMobile.classList.toggle('open');
    });
  }

  // ── ACTIVE NAV LINK ─────────────────────────────────────
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // ── RENDER HOMEPAGE PRODUCTS ─────────────────────────────
  const productsGrid = document.getElementById('productsGrid');
  if (productsGrid && window.SHRISH_DATA) {
    const available = SHRISH_DATA.products.filter(p => p.available).slice(0, 3);
    const toShow = available.length ? available : SHRISH_DATA.products.slice(0, 3);
    toShow.forEach(p => {
      productsGrid.innerHTML += `
        <div class="product-card ${p.available ? '' : 'product-card-unavailable'}">
          ${p.tag ? `<div class="product-card-badge">${p.tag}</div>` : ''}
          <div class="product-card-img">${p.emoji}</div>
          <div class="product-card-body">
            <h3>${p.name}</h3>
            <p>${p.description}</p>
            <div class="product-card-footer">
              <div>
                <div class="product-price">${p.price}</div>
                <div class="product-unit">${p.unit}</div>
              </div>
              <span class="product-status-badge ${p.available ? 'available' : 'unavailable'}">
                ${p.available ? '✓ Available' : 'Sold Out'}
              </span>
            </div>
          </div>
        </div>`;
    });
  }

  // ── SMOOTH SCROLL REVEAL ─────────────────────────────────
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.section-header, .product-card, .how-step, .recipe-card, .testimonial-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
});
