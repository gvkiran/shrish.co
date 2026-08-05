# SHRISH CRM — Design Spec (v0.2, for approval)

Status: **DRAFT — not implemented.** No code written, no rules changed, nothing pushed.
Branch policy for this work: all changes land on `dev` only. `main` is untouched until you explicitly approve a production release.

---

## 0. Decisions locked in

| Question | Answer | Consequence for the build |
|---|---|---|
| Who uses this? | **Only Kiran** | Keep the existing hardcoded `contact@shrish.co` admin check. No custom claims, no roles, no invite flow. Removes a large chunk of work. |
| Reorder cycle | **1–2 months** | `due` at **60 days**, `overdue` at **90 days** since last order. Configurable constant, not hardcoded in three places. |
| Booth volume | **20–50 per event** | Fast phone-first entry is worth building properly (Phase 3). At this volume, retyping from notes is an hour of tedium per event. |
| Does it replace admin? | **No — absorbs 3 tabs** | See §1.1. |

**Framing that governs the whole build:** this is not a data-entry tool, it is a **lens on `orders` data you already own**. Target ratio is ~90% computed automatically, ~10% manual (a tag, a note, a follow-up date). Every manual field is a field that will be empty in three months.

---

## 1. Why a CRM, given what already exists

| Already in the repo | What it does | Gap |
|---|---|---|
| `admin.html` → Customers tab | Lists `user_profiles` (registered accounts only). Name, email, phone, pickup pref, order count, delete. | Only shows people who **created an account**. Guest checkouts, booth walk-ups, WhatsApp and phone orders are invisible. No lifetime value, no history, no follow-up. |
| `orders` collection | Full order records with `phoneDigits`, `email`, `items`, `totalPrice`, `attribution`, `source`. | Never rolled up per person. `source` is locked to `'website'` at create time — offline sales cannot be recorded at all. |
| `accounting/` studio | Chase CSV → categorized P&L. | Money in aggregate, no link to *who* paid. |
| `order_feedback`, `promo_redemptions`, `email_subscribers` | Signals per order/code/email. | Never joined to a customer. |

**The CRM's job:** one record per *person or business*, regardless of how they bought, with history, follow-ups, and segments.

### 1.1 Relationship to `admin.html` — absorb, don't replace

`admin.html` has 11 tabs across a 52KB HTML file and a 5,743-line JS file. It answers **"what do I do today"** — order-centric, operational. The CRM answers **"who are my customers and who should I contact"** — person-centric, longitudinal. Merging them produces one page bad at both.

| Tab | Destination | Reasoning |
|---|---|---|
| `customers` | **→ CRM, Phase 1** | Registered accounts only, little beyond delete. CRM version strictly supersedes it. |
| `feedback` | **→ CRM, Phase 4** | Feedback is a customer attribute. Belongs on the person's timeline, not a flat list. |
| `subscribers` | **→ CRM, Phase 4** | An email list is a segment, and segments live in the CRM. |
| `orders`, `refunds`, `pickup-tally` | **Stays in admin** | Daily fulfillment. Different rhythm, different user intent. |
| `products`, `promos`, `accounting`, `meta-ads`, `growth` | **Stays in admin** | Not person-scoped at all. |

Net effect: admin loses 3 tabs over time and gets lighter. Nothing is deleted until the CRM equivalent is proven in use.

### 1.2 Why this is worth doing at all

Pickles and sweets are **consumables on a reorder clock**. A jar lasts a household 1–2 months, so every customer sits on an invisible timer; when it expires they reorder, forget, or buy elsewhere. Today there is no way to see that timer. Classic CRM value (pipelines, lead scoring, deal stages) is near-zero here — a sale takes four minutes on a checkout page, not six weeks of chasing. **Retention economics is the entire business case.**

---

## 2. Identity model (the most important decision)

**Canonical customer key = `phoneDigits`** (10–11 digits).

Rationale:
- Every order already carries it and Firestore rules validate the format (`^[0-9]{10,11}$`).
- `order_locks/{phoneDigits}` already treats it as a person identifier.
- It survives guest checkout, booth sales, and WhatsApp — email does not.
- Indian-American customer base frequently shares a household email but not a phone.

Secondary identifiers, stored on the record for matching and display: `customerUid` (when signed in), `email`, `fullName`.

Merge rule: if two phone numbers resolve to the same `customerUid`, offer a manual **Merge** action. Never auto-merge on email alone.

---

## 3. Architecture: overlay, not duplicate

The trap in most CRM builds is copying order data into customer documents and then fighting to keep them in sync.

We do the opposite:

```
  orders (source of truth)  ──┐
  user_profiles             ──┼──▶ computed in browser ──▶ Customer 360 view
  order_feedback            ──┘         (LTV, counts, recency, favorites)

  crm_customers   ──▶ overlay only: tags, stage, do-not-contact, owner
  crm_interactions──▶ timeline: calls, texts, booth chats, next action
  crm_accounts    ──▶ B2B entities that don't exist in `orders` at all
```

**Rollups are computed, never stored** (until volume forces it — see §8). Order data has exactly one home.

---

## 4. New Firestore collections

All three are **admin-only, full stop** — no customer-facing read path. Rules pattern:

```javascript
match /crm_customers/{customerKey} {
  allow read, write: if isAdmin();
}
```

### 4.1 `crm_customers/{phoneDigits}`
Overlay attributes only. Absent document = customer exists but has no CRM annotations yet.

| Field | Type | Notes |
|---|---|---|
| `displayName` | string | Manual override when order names are inconsistent |
| `tags` | string[] | `vip`, `festival-buyer`, `spice-mild`, `bulk`, `referrer` |
| `lifecycleStage` | string | `new` · `active` · `repeat` · `lapsed` · `do-not-contact` |
| `preferredChannel` | string | `whatsapp` · `sms` · `call` · `email` |
| `doNotContact` | bool | Hard suppression; overrides everything, enforced in every export |
| `linkedAccountId` | string? | FK to `crm_accounts` if they buy for a business |
| `internalNotes` | string | Free text, max 2000 chars |
| `createdAt` / `updatedAt` | timestamp | |

### 4.2 `crm_accounts/{accountId}` — wholesale / B2B
Stores, restaurants, temples, caterers. These have **no `orders` history at all** until §6 ships.

| Field | Type | Notes |
|---|---|---|
| `businessName` | string | required |
| `accountType` | string | `grocery` · `restaurant` · `temple` · `caterer` · `distributor` · `other` |
| `stage` | string | `lead` → `contacted` → `sampled` → `negotiating` → `active` → `dormant` → `lost` |
| `contactName`, `phone`, `email` | string | Primary decision maker |
| `address`, `city`, `state` | string | Drives booth/route planning later |
| `priceTier` | string | `retail` · `wholesale-a` · `wholesale-b` |
| `paymentTerms` | string | `prepaid` · `net15` · `net30` |
| `reorderCadenceDays` | number? | Powers the "overdue reorder" alert |
| `lastOrderAt`, `nextTouchAt` | timestamp? | |
| `estimatedMonthlyBoxes` | number? | Pipeline value |
| `notes` | string | |

### 4.3 `crm_interactions/{autoId}` — the timeline

| Field | Type | Notes |
|---|---|---|
| `subjectType` | string | `customer` \| `account` |
| `subjectId` | string | `phoneDigits` or `accountId` |
| `type` | string | `call` · `text` · `whatsapp` · `email` · `booth` · `visit` · `sample-drop` · `note` |
| `direction` | string | `inbound` · `outbound` |
| `summary` | string | ≤ 1000 chars |
| `occurredAt` | timestamp | |
| `nextAction` | string? | e.g. "Send Avakaya sample pack" |
| `nextActionAt` | timestamp? | Feeds the Follow-ups screen |
| `nextActionDone` | bool | |

Required composite indexes (add to `firestore.indexes.json`):
- `crm_interactions`: `subjectId ASC, occurredAt DESC`
- `crm_interactions`: `nextActionDone ASC, nextActionAt ASC`

---

## 5. Segments (computed, no storage)

| Segment | Definition |
|---|---|
| **Due to reorder** | ≥ 1 order, last order **60–89 days** ago — the money segment |
| **Overdue** | ≥ 1 order, last order **90+ days** ago |
| **New** | First order within last 30 days |
| **Repeat** | ≥ 2 paid orders |
| **VIP** | Top 10% by lifetime value **and** ≥ 2 orders |
| **Booth-only** | All orders have `source` ≠ `website` |
| **Cart-name-only** | In `user_profiles`, zero orders — likely a stalled signup |
| **B2B overdue** | Account where `now > lastOrderAt + reorderCadenceDays` |

Every segment export **hard-excludes** `doNotContact` and any customer flagged `deletion_requested` in `user_profiles`. Export is CSV, generated in-browser, never uploaded.

---

## 6. Offline / booth sales — requires one rules change

Today `orders` create is blocked for anything but a website checkout:

```javascript
// firestore.rules, current
allow create: if orderId.matches('^[A-Za-z0-9]{20}$')
  && newOrderCustomerIsValid()
  && newWebsiteOrderIsValid();   // ← forces source == 'website'
```

**Proposed change** — add an admin branch so booth/WhatsApp/phone sales live in the same collection as web orders:

```javascript
function newAdminOfflineOrderIsValid() {
  return request.resource.data.source in ['booth', 'whatsapp', 'phone', 'market', 'referral']
    && request.resource.data.phoneDigits.matches('^[0-9]{10,11}$')
    && request.resource.data.items is list
    && request.resource.data.items.size() >= 1
    && request.resource.data.totalPrice is number
    && request.resource.data.totalPrice >= 0
    && request.resource.data.createdAt == request.time;
}

allow create: if (orderId.matches('^[A-Za-z0-9]{20}$')
                  && newOrderCustomerIsValid()
                  && newWebsiteOrderIsValid())
              || (isAdmin() && newAdminOfflineOrderIsValid());
```

Why one collection instead of `crm_offline_orders`:
- Revenue, LTV, and segments stay correct without unioning two schemas.
- The accounting studio and any future reporting see all sales.
- `source` already exists as the discriminator — the site's own queries filter on `source == 'website'` where it matters.

Risk and mitigation: this widens admin write surface. Mitigation is that `isAdmin()` is a single hardcoded email (`contact@shrish.co`) and offline orders are marked with a distinct `source`, so they are trivially filterable and auditable. **This is the only rules change in the whole plan, and it can be deferred to Phase 2.**

Booth entry UX: phone number first → instant lookup shows "Returning: 4 orders, $186 LTV" or "New" → product quick-picks from `data.js` → total → save. Under 20 seconds per sale, usable one-handed on a phone at a stall.

---

## 7. Screens

`/crm/index.html` + `/crm/app.js` + `/crm/styles.css` — mirrors the `accounting/` folder layout, but gated by the same Firebase admin auth as `admin.html` (`onAuthStateChanged` + email check against `contact@shrish.co`).

1. **Dashboard** — customers total, new this month, repeat rate, LTV distribution, follow-ups due today, B2B pipeline value.
2. **Customers** — searchable table (phone / name / email), sortable by LTV, orders, last order. Segment chips as filters.
3. **Customer detail** — identity block, computed stats, full order timeline, interaction timeline, tags/stage editor, "Log interaction" button.
4. **Accounts** — kanban by `stage`, card shows business, city, last order, next touch. Detail drawer with contacts and interaction log.
5. **Follow-ups** — Overdue / Today / This week, from `crm_interactions.nextActionAt`. One-click complete.
6. **Booth entry** — the fast path from §6.
7. **Segments & export** — pick segment, preview, download CSV.

Styling reuses `assets/css/` tokens so it reads as part of the Shrish admin surface, not a bolt-on.

---

## 8. Phasing — small, reviewable commits on `dev`

| Phase | Deliverable | Rules change? | Risk |
|---|---|---|---|
| **0** | ~~Pull `dev`~~ **done** — now at `eae1442`, synced with `origin/dev` | No | Complete |
| **1** | **Decision gate.** Read-only Customer 360: read `orders` + `user_profiles`, compute rollups, dashboard + customers list + detail, segments + CSV export | No | None — read-only |
| **2** | `crm_customers` + `crm_interactions`, tags/notes editing, Follow-ups screen | Add 2 admin-only match blocks | Low |
| **3** | Booth / offline fast entry (justified by 20–50 sales per event) | Modify `orders` create rule (§6) | **Medium — needs explicit sign-off** |
| **4** | `crm_accounts` B2B pipeline; absorb `feedback` + `subscribers` tabs from admin | Add 1 admin-only match block | Low |
| **5** | *Only if needed*: nightly Cloud Function writing rollups to `crm_customers` when client-side compute slows (~5k+ orders) | No | Low |

Each phase is one commit on `dev`, validated on the Vercel preview before the next starts.

### 8.1 Phase 1 is a test, not just a deliverable

Phase 1 writes nothing and changes no rules, so it is nearly free to abandon. Its real purpose is to put a number on the business case: **how many customers are sitting past 60 days, and what were they worth?**

- If that number is meaningful → every later phase is justified, build on.
- If it is small or boring → we learned it in one commit instead of six, and we stop.

This is the cheapest available way to de-risk a first-time CRM build. Do not skip ahead to Phase 2 before looking at the Phase 1 numbers.

---

## 9. UI principles (non-negotiable for a solo operator)

1. **Every number is a filter.** Tapping a metric card or segment chip drills into the filtered list. The dashboard *is* the navigation — no separate reports area, no menu to memorise.
2. **No empty state on day one.** Because everything is derived from existing `orders`, the tool is full the first time it opens. CRMs that greet you with "import a CSV to begin" do not survive week three.
3. **Phone-first.** Single column, 36px minimum tap targets, no hover-dependent controls. This gets opened at a booth more often than at a desk.
4. **Charts earn their place.** Reorder-clock distribution and revenue-by-segment are decision tools. Anything decorative gets cut.
5. **Manual input is capped.** If a field can be derived, derive it. Free-text notes and one follow-up date are the only routine typing.

Chart rendering: Chart.js via CDN, matching the approach already used in `admin/shrish_growth_dashboard.html`.

## 10. Remaining open questions

1. **Wholesale reality check** — do you have live B2B accounts today, or is Phase 4 aspirational?
2. **Historical backfill** — any past booth sales on paper or in a sheet worth importing?

---

## 11. Explicitly out of scope for v1

Email/SMS sending from the CRM, automated drip campaigns, Instagram DM ingestion, Stripe customer sync, multi-user permissions, mobile app. Each is a real conversation, none belongs in the first build.
