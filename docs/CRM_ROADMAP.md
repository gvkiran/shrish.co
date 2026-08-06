# Shrish CRM — what's built, what's next

Written Aug 2026, after the first build. Ordered by value, not by effort.

---

## The biggest gap: the CRM knows revenue, not profit

Everything currently ranks by **revenue**. Top spenders, best varieties, bridge products, season totals — all revenue. For a business with perishable stock, cold-chain handling and shipping, revenue rankings can be actively misleading.

A $56 mango box that spoils 10% of the time, needs careful handling and ships heavy may well earn you less than a $10.99 pickle jar that keeps for a year and posts flat. **Right now nothing in the system can tell you which.** You could be optimising toward your least profitable line and the CRM would applaud.

What it needs: a cost per product. Ingredients, packaging, and for mangoes an assumed spoilage rate. Then every existing view can show margin beside revenue, and "top variety" starts meaning "the one that pays you most" rather than "the one that moves most".

You already hold most of the inputs in the Accounting Studio — Chase exports categorised by vendor. The missing piece is per-unit cost, which is a one-time data entry job of maybe an hour for ~70 products.

**This is the single most valuable thing left to build.** Everything below is smaller.

---

## Near term — small, useful, no trigger needed

| Item | Why |
|---|---|
| **WhatsApp compose** | One tap from a customer record to a pre-filled message with their name and usual products. You coordinate on WhatsApp daily; every other CRM forces copy-paste here. |
| **Booth offline mode** | If the venue has no signal, sales are currently lost. Queue locally, sync when back online. Needed before the next event, not after. |
| **Cost per product** | See above. Unlocks margin everywhere. |
| **Widen owner filter** | Your `9999999999` record slips past "Hide my account". |
| **Spoilage tracking** | Damaged-box handling exists in the pickup tally but never reaches the CRM. Mango spoilage is a real cost that is currently invisible. |

---

## Medium term — wait for the trigger

| Item | Trigger | Why wait |
|---|---|---|
| **Pre-season campaign builder** | Feb–Mar 2027 | Countdown, task list, and mail list generated from this season's data. Useless in August, valuable in February. |
| **Season-over-season retention** | Apr 2027 | The panel is built and says so honestly. It needs a second season to compare against. |
| **Stock forecast from the demand curve** | Mar 2027 | You now know the 2026 peak week was 25 May at 113 boxes. Next year that becomes an ordering plan instead of a memory. |
| **B2B accounts** | A real prospect | Spec'd but unbuilt. Building a pipeline for hypothetical customers is how CRMs get bloated. |

---

## Deliberately not building

These are what make ServiceNow and Salesforce feel heavy, and none fit a one-person business with 23 year-round customers.

- **Deal pipelines and stages** — your sale takes four minutes, not six weeks
- **Task assignment and activity feeds** — there is one of you
- **Lead scoring** — you know your customers by name
- **Real-time dashboards** — nothing here changes by the minute
- **A mobile app** — the web pages already work on a phone
- **AI chat over your data** — impressive in a demo, and at 405 customers the answer is usually visible on one screen

---

## Known limitations worth remembering

- **Reorder intervals are measured, not guessed** — but they come from one season of data. They will get more accurate, and any product without 3+ observed repeat gaps is deliberately left unpredicted rather than invented.
- **Feedback only links for signed-in customers.** It is stored against `customerUid`, so guest feedback cannot be attributed retroactively.
- **Anonymous booth sales never become customer records.** There is nothing to identify them by. Their revenue still counts everywhere else.
- **Affinity needs volume.** With few multi-product customers, lift is noisy. It suppresses small samples rather than showing tempting nonsense.
- **Marketing is intentionally outside this system.** Sent from a separate provider so a bad campaign can never affect order confirmation delivery.

---

## The honest recommendation

Use it for a month before building anything else.

One testing pass found ten issues, five of them real bugs. More will surface through use, and those are worth more than new surface area — a bug in the reorder model quietly sends you chasing the wrong people, which is worse than a feature you do not have.

The two things only you can validate:

1. **Do the measured reorder intervals match reality?** Does "Avakaya lasts about N days" match what you know about a 250g jar? The model comes from your data, but your judgement is the only check on it.
2. **Do Today's action cards match what you would actually have done?** If a card is noise, it should be removed. A dashboard you learn to ignore is worse than no dashboard.

If you want one thing built next, build **cost per product**. It is the difference between a CRM that tells you what sells and one that tells you what pays.
