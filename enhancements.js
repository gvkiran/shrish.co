/* ============================================================
   SHRISH LLC — Site Enhancements v1.0
   Add this script tag AFTER main.js in every HTML page:
   <script src="enhancements.js"></script>
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. IMAGE FALLBACK PLACEHOLDERS
     Show a styled SVG placeholder when product images 404
     ---------------------------------------------------------- */
  function initImageFallbacks() {
    document.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('error', function handleError() {
        // Don't replace if already replaced
        if (img.dataset.fallback) return;
        img.dataset.fallback = '1';

        // Determine category from context
        var card = img.closest('.pc-v2, .modal-images, .hero-img-wrap, [class*="product"]');
        var category = 'mango'; // default
        if (img.src.indexOf('puth') > -1) category = 'sweet';
        else if (img.src.indexOf('jelly') > -1 || img.src.indexOf('palm') > -1) category = 'jelly';
        else if (img.src.indexOf('logo') > -1) category = 'logo';

        var emoji = { mango: '🥭', sweet: '🍬', jelly: '🍡', logo: '🌿' }[category];
        var label = img.alt || 'Product Image';

        // Create SVG data URI
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">'
          + '<defs><linearGradient id="bg' + category + '" x1="0%" y1="0%" x2="100%" y2="100%">'
          + '<stop offset="0%" style="stop-color:#FFF8E7"/>'
          + '<stop offset="100%" style="stop-color:#FFE4B5"/>'
          + '</linearGradient></defs>'
          + '<rect width="400" height="400" rx="12" fill="url(#bg' + category + ')"/>'
          + '<text x="200" y="170" text-anchor="middle" font-size="72">' + emoji + '</text>'
          + '<text x="200" y="230" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" '
          + 'font-weight="600" fill="#8B6914">' + escapeXml(label.substring(0, 30)) + '</text>'
          + '<text x="200" y="260" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" '
          + 'fill="#B8860B" opacity="0.7">Image coming soon</text>'
          + '</svg>';

        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        img.style.objectFit = 'cover';
      });

      // If image already broken (cached fail), trigger fallback
      if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) {
        img.dispatchEvent(new Event('error'));
      }
    });
  }

  function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }


  /* ----------------------------------------------------------
     2. SHARE BUTTON IN PRODUCT MODAL
     Adds WhatsApp share + copy link buttons below price row
     ---------------------------------------------------------- */
  function initShareButtons() {
    // Patch the openModal function to inject share buttons after modal renders
    var originalOpenModal = window.openModal;
    if (!originalOpenModal) return;

    window.openModal = function (id) {
      originalOpenModal(id);
      // Inject share buttons after a small delay for DOM to update
      setTimeout(function () { injectShareRow(id); }, 50);
    };
  }

  function injectShareRow(productId) {
    var modalInfo = document.querySelector('.modal-info');
    if (!modalInfo) return;

    // Remove any existing share row
    var existing = modalInfo.querySelector('.modal-share-row');
    if (existing) existing.remove();

    // Find the product data
    var product = null;
    if (window.SHRISH_DATA && window.SHRISH_DATA.products) {
      product = window.SHRISH_DATA.products.find(function (p) { return p.id === productId; });
    }
    if (!product) return;

    var productName = product.name;
    var productPrice = product.price || 'Coming Soon';
    var shareUrl = window.location.origin + '/shrish.co/shop.html?product=' + productId;
    var waText = encodeURIComponent(
      '🥭 Check out ' + productName + ' (' + productPrice + ') from Shrish LLC!\n'
      + 'Fresh Indian mangoes, pickup in Richmond VA.\n'
      + shareUrl
    );

    var shareRow = document.createElement('div');
    shareRow.className = 'modal-share-row';
    shareRow.innerHTML =
      '<span class="share-label">Share:</span>'
      + '<button class="share-btn share-wa" onclick="window.open(\'https://wa.me/?text=' + waText + '\',\'_blank\')" title="Share on WhatsApp">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.625-1.477A11.924 11.924 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-2.168 0-4.19-.595-5.927-1.628l-.424-.255-2.744.877.87-2.698-.27-.434A9.78 9.78 0 012.182 12c0-5.42 4.398-9.818 9.818-9.818S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>'
      + ' WhatsApp</button>'
      + '<button class="share-btn share-copy" onclick="copyShareLink(\'' + shareUrl + '\')" title="Copy link">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'
      + ' Copy Link</button>';

    // Insert after .modal-qty-row or .modal-price-row
    var insertAfter = modalInfo.querySelector('.modal-qty-row') || modalInfo.querySelector('.modal-price-row');
    if (insertAfter && insertAfter.nextSibling) {
      modalInfo.insertBefore(shareRow, insertAfter.nextSibling);
    } else {
      modalInfo.appendChild(shareRow);
    }
  }

  // Global copy function
  window.copyShareLink = function (url) {
    navigator.clipboard.writeText(url).then(function () {
      if (window.showToast) window.showToast('🔗 Link copied to clipboard!');
    }).catch(function () {
      // Fallback for older browsers
      var textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (window.showToast) window.showToast('🔗 Link copied to clipboard!');
    });
  };


  /* ----------------------------------------------------------
     3. FIX CLOUDFLARE EMAIL PROTECTION LINKS
     GitHub Pages doesn't support Cloudflare's email obfuscation
     ---------------------------------------------------------- */
  function fixEmailLinks() {
    // Fix any Cloudflare-protected email links
    document.querySelectorAll('a[href*="cdn-cgi/l/email-protection"]').forEach(function (a) {
      a.setAttribute('href', 'mailto:contact@shrishllc.com');
      // Also fix the visible text if it shows encoded
      if (a.textContent.indexOf('[email') > -1 || a.textContent.indexOf('email-protection') > -1) {
        a.textContent = 'contact@shrishllc.com';
      }
    });

    // Also fix any span with data-cfemail
    document.querySelectorAll('[data-cfemail]').forEach(function (el) {
      el.textContent = 'contact@shrishllc.com';
      // If parent is a link, fix the href too
      var parent = el.closest('a');
      if (parent) parent.setAttribute('href', 'mailto:contact@shrishllc.com');
    });
  }


  /* ----------------------------------------------------------
     4. STRUCTURED DATA (JSON-LD) FOR LOCAL BUSINESS SEO
     Injects LocalBusiness schema on every page
     ---------------------------------------------------------- */
  function injectStructuredData() {
    // Don't double-inject
    if (document.querySelector('script[data-shrish-ld]')) return;

    var ld = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Shrish LLC',
      description: 'Fresh Indian mangoes and authentic sweets — Alphonso, Kesar, Putharekulu — available for pickup in Richmond, Virginia.',
      url: 'https://shrish.co',
      telephone: '+1-765-325-5577',
      email: 'contact@shrishllc.com',
      image: 'https://gvkiran.github.io/shrish.co/logo.png',
      address: [
        {
          '@type': 'PostalAddress',
          addressLocality: 'Short Pump',
          addressRegion: 'VA',
          addressCountry: 'US'
        },
        {
          '@type': 'PostalAddress',
          addressLocality: 'Chesterfield',
          addressRegion: 'VA',
          addressCountry: 'US'
        }
      ],
      areaServed: {
        '@type': 'City',
        name: 'Richmond',
        containedInPlace: { '@type': 'State', name: 'Virginia' }
      },
      openingHours: 'Mo-Fr 09:00-17:00',
      paymentAccepted: 'Cash',
      priceRange: '$$',
      sameAs: [
        'https://www.instagram.com/richmond_mangos/'
      ],
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Indian Mangoes',
        itemListElement: [
          {
            '@type': 'Offer',
            itemOffered: { '@type': 'Product', name: 'Alphonso (Hapus) Mangoes', description: 'Premium Ratnagiri Alphonso mangoes' },
            price: '45.00',
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock'
          },
          {
            '@type': 'Offer',
            itemOffered: { '@type': 'Product', name: 'Kesar Mangoes', description: 'Gujarat Kesar mangoes' },
            price: '40.00',
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock'
          }
        ]
      }
    };

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.shrishLd = '1';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }


  /* ----------------------------------------------------------
     5. COPYRIGHT YEAR AUTO-UPDATE
     ---------------------------------------------------------- */
  function updateCopyrightYear() {
    var currentYear = new Date().getFullYear();
    document.querySelectorAll('footer, .footer-bottom').forEach(function (footer) {
      var walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        var node = walker.currentNode;
        if (node.textContent.indexOf('© 2025') > -1) {
          if (currentYear > 2025) {
            node.textContent = node.textContent.replace('© 2025', '© 2025–' + currentYear);
          }
        }
      }
    });
  }


  /* ----------------------------------------------------------
     6. DEEP LINK TO PRODUCT FROM URL
     If URL has ?product=alphonso, auto-open that modal
     ---------------------------------------------------------- */
  function handleDeepLink() {
    var params = new URLSearchParams(window.location.search);
    var productId = params.get('product');
    if (productId && window.openModal) {
      // Wait for shop to render
      setTimeout(function () {
        window.openModal(productId);
      }, 500);
    }
  }


  /* ----------------------------------------------------------
     7. GOOGLE ANALYTICS PLACEHOLDER
     Replace GA_MEASUREMENT_ID with your real GA4 ID
     ---------------------------------------------------------- */
  function initAnalyticsPlaceholder() {
    // Uncomment and replace GA_MEASUREMENT_ID when ready:
    /*
    var gaId = 'G-XXXXXXXXXX'; // <-- Replace with your GA4 Measurement ID
    var script1 = document.createElement('script');
    script1.async = true;
    script1.src = 'https://www.googletagmanager.com/gtag/js?id=' + gaId;
    document.head.appendChild(script1);

    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', gaId);
    window.gtag = gtag;
    */
  }


  /* ----------------------------------------------------------
     8. ENHANCED NOTIFY-ME WITH EMAIL CAPTURE
     Shows a mini form to collect email for Coming Soon items
     ---------------------------------------------------------- */
  function initEnhancedNotify() {
    var originalNotifyMe = window.notifyMe;
    if (!originalNotifyMe) return;

    window.notifyMe = function (productId, btn) {
      // Call original first
      originalNotifyMe(productId, btn);

      // Show a more helpful message
      if (window.showToast) {
        window.showToast('🔔 Join our WhatsApp group for launch alerts!');
      }
    };
  }


  /* ----------------------------------------------------------
     INIT — Run all enhancements after DOM is ready
     ---------------------------------------------------------- */
  function initAll() {
    fixEmailLinks();
    initImageFallbacks();
    initShareButtons();
    injectStructuredData();
    updateCopyrightYear();
    handleDeepLink();
    initAnalyticsPlaceholder();
    initEnhancedNotify();

    console.log('✅ Shrish enhancements loaded');
  }

  // Run on DOM ready or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

})();
