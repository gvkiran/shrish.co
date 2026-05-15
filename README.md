# shrish.co

Shrish LLC website for online ordering, product browsing, customer accounts, and admin order management.

## Branch Workflow

- `main` is production. Do not push there unless production release is explicitly approved.
- `developement` is the working branch for all new changes and Vercel preview validation.
- Pull production-only fixes into `developement` first, test there, then promote to `main` only after approval.

## Project Structure

- `index.html`, `shop.html`, `order.html`, `account.html`, `admin.html`: main customer and admin pages.
- `assets/css/`: shared styles.
- `assets/js/`: shared browser scripts, Firebase client logic, analytics, cart, account, and shop behavior.
- `images/brand/`: Shrish logo assets.
- `images/products/`: product images organized by category.
- `images/site/` and `images/recipes/`: page and recipe images.
- `shop/products/`: generated SEO product pages grouped by category.
- `scripts/generate-product-pages.js`: rebuilds product SEO pages and `sitemap.xml` from `assets/js/data.js`.
- `functions/`: Firebase Cloud Functions for orders, accounts, emails, reminders, and feedback.
- `docs/`: owner/developer notes.
- `archive/legacy/`: old reference files kept out of the site root.

## Product Page Updates

When product data, product images, or SEO page template details change, run:

```powershell
node scripts\generate-product-pages.js
```

Then validate the changed pages before pushing `developement`.
