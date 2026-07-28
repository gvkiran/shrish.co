# SHRISH Website Audit and Implementation Report

**Audit date:** July 27–28, 2026  
**Audit branch:** `codex/full-site-audit`  
**Base:** `origin/main` / `origin/dev` at `a384b04`  
**Scope:** Git alignment, production crawl, local browser QA, checkout, accessibility, SEO, analytics, Firestore, Firebase Functions, dependencies, and security.

## 1. Executive status

| Area | Status | Result |
|---|---|---|
| Local audited build | PASS | Static checks and critical desktop/mobile flows pass |
| Production pages | PASS with one asset defect | 83/83 sitemap pages return HTTP 200 |
| Production resources | ACTION REQUIRED | Madatha Kaja image returns HTTP 404 |
| `main` and `dev` | ALIGNED | Both point to `a384b04` |
| Legacy branches | STALE | `developement` is 29 commits behind; `premerge-hardening` is 16 behind |
| SEO fundamentals | PASS | Titles/descriptions present, canonicals and JSON-LD valid, sitemap/robots aligned |
| SEO tuning | ADVISORY | 43 pages have title or description lengths outside common guidance |
| Meta Pixel | PASS | Production loads Shrish analytics, Meta Pixel library, and dataset configuration without browser console errors |
| Root dependencies | PASS | 0 known vulnerabilities |
| Functions dependencies | REVIEW | 9 moderate transitive advisories; no high or critical findings after compatible updates |
| Security scan | PARTIAL REMEDIATION | 3 findings mitigated; 4 architectural findings remain |

**Release judgment:** the audited branch is materially safer and cleaner than current production. Deploy only after reviewing the four remaining architectural security items and running a Firebase staging smoke test.

## 2. Git branch alignment

| Branch | Commit | Difference from `origin/main` | Recommendation |
|---|---:|---:|---|
| `origin/main` | `a384b04` | Baseline | Keep |
| `origin/dev` | `a384b04` | 0 ahead / 0 behind | Aligned |
| `origin/developement` | `7e454f4` | 0 ahead / 29 behind | Retire after confirming no external automation uses it |
| `origin/premerge-hardening` | `2353f4f` | 0 ahead / 16 behind | Archive or delete after confirmation |
| `codex/full-site-audit` | audit branch | 1+ local audit commit ahead | Review, stage-test, then merge |

The primary user worktree was left untouched because it contains unrelated uncommitted files.

## 3. Implemented now

1. Stopped recursive Meta Purchase retries by requiring a real transition into `paid`.
2. Fixed stale checkout payment wording and totals after asynchronous payment-policy changes.
3. Made subscriber document IDs random and restricted subscriber reads to admins.
4. Tightened anonymous order and refund create rules with auto-ID and status constraints.
5. Hardened admin order/refund rendering against stored XSS and unsafe inline IDs.
6. Added a stable accessible name to the recipe timer.
7. Added HSTS, MIME-sniffing, framing, referrer, permissions, and opener security headers.
8. Restored the missing Madatha Kaja product image locally.
9. Repaired visible UTF-8 mojibake in shared UI and order/admin utilities.
10. Reduced seven oversized product photos from 29.6 MiB total to 2.6 MiB (91.2%) while preserving 2048 px detail.
11. Updated compatible server packages: Firebase Admin 13.10.0, PostHog 5.46.1, and Stripe 22.3.2.
12. Migrated Firebase Admin imports to supported modular entry points, preserving current call behavior.
13. Added regression checks for Meta recursion, checkout state, Firestore privacy, admin XSS, accessibility, encoding, and oversized product images.

## 4. Verification evidence

| Check | Result |
|---|---|
| Local site audit | 87 HTML pages, 71 products, 83 sitemap URLs, 174 local references — PASS |
| Production crawl | 83 pages and 249 same-origin resources checked |
| Production page status | 83 HTTP 200 responses |
| Production broken resources | 1: Madatha Kaja JPG |
| JavaScript syntax | 24 files — PASS |
| Regression suite | PASS twice |
| `git diff --check` | PASS |
| Root `npm audit` | 0 vulnerabilities |
| Functions module-load smoke test | 16 exports loaded successfully |
| Desktop checkout | Correct online total/payment wording; no horizontal overflow |
| Mobile checkout | Correct online total/payment wording; no horizontal overflow |
| Product image pages | Ragi, Flaxseed, Rava, Samosa Putharekulu, and Madatha Kaja load with no broken images locally |
| Home, shop, recipes, admin login | No broken images or horizontal overflow in tested mobile states |
| Security scan coverage | 6,947/6,947 files accounted |

An actual production Stripe charge was not created during QA. Purchase tracking was validated through code, event-ID matching, page-state gates, and live library loading.

## 5. Remaining attention

### Before production deployment

1. Merge and deploy the audited Madatha Kaja image fix; current production returns 404.
2. Deploy the added response headers; current production has platform HSTS but lacks the other five audited headers.
3. Provide the dedicated dev/preview URL if one exists. Git `dev` equals `main`, but no separate dev deployment URL was discoverable.
4. Run one controlled staging Stripe checkout and verify:
   - Stripe webhook marks the order paid.
   - Confirmation page lists purchased items.
   - Browser Meta Purchase and server CAPI share `stripe_<orderId>`.
   - Confirmation and admin views show the same totals.

### Security items requiring architectural work

1. Anonymous order creation can trigger backend email/work.
2. Anonymous callers can request Stripe Checkout sessions.
3. The public Geet endpoint lacks durable server-side abuse controls.
4. Phone-based order/promo metadata remains publicly readable.

### Dependency note

Compatible updates removed all high and critical function-package advisories. Nine moderate advisories remain in Firebase/Google transitive packages. `npm audit` proposes an unsafe downgrade rather than a clean supported fix, so no forced override was applied.

## 6. SEO status

**Passing:** language, charset, viewport, page titles, meta descriptions, image alt attributes, duplicate IDs, JSON-LD parsing, canonical pages, sitemap references, and robots sitemap declaration.

**Tuning backlog:** 43 pages are outside common title/description length guidance:

- 11 short titles
- 19 long titles
- 14 short descriptions
- 3 long descriptions

These are ranking/snippet optimization opportunities, not crawl or indexing failures.

## 7. Ten future implementation plans

| # | Plan | Time frame |
|---:|---|---:|
| 1 | Move public order creation behind a validated callable API with App Check and rate limits | 3–5 days |
| 2 | Protect Stripe Checkout creation with App Check, server cart validation, idempotency, and abuse limits | 3–5 days |
| 3 | Add durable Geet throttling, quotas, monitoring, and safe failure responses | 2–3 days |
| 4 | Replace public phone metadata reads with authenticated claims or callable lookup | 2–4 days |
| 5 | Add GitHub CI for site audit, regression tests, dependency audit, and Firebase rules tests | 2–3 days |
| 6 | Build Firebase emulator integration tests for orders, refunds, account deletion, and webhooks | 4–7 days |
| 7 | Tune generated SEO titles/descriptions and add automated length/uniqueness checks | 2–3 days |
| 8 | Add responsive image generation, WebP/AVIF sources, dimensions, and lazy-loading policy | 3–5 days |
| 9 | Create a real dev preview environment with separate Firebase/Stripe test configuration | 3–5 days |
| 10 | Add release monitoring: uptime, broken-link crawl, checkout synthetic test, and analytics alerts | 3–5 days |

## 8. Recommended release sequence

1. Review the audit diff.
2. Deploy Firestore rules and Functions to a staging Firebase project.
3. Run the controlled staging checkout checklist.
4. Deploy the website to the dev preview.
5. Repeat the crawl and browser smoke tests.
6. Merge to `main`.
7. Deploy production.
8. Re-run production crawl and Meta/Stripe event verification.
