# Shrish CRM — test plan

Work top to bottom. Anything marked **⚠** is a case where a bug would cost real money or annoy a real customer, so test those even if short on time.

Deploy state needed before testing:

```
git push origin dev
firebase deploy --only firestore:rules            # tags/notes, booth entry
firebase deploy --only functions:resendPaymentLink,functions:sendShipmentEmail
```

---

## 1. Today view

| # | Test | Expected |
|---|---|---|
| 1.1 | Open `/crm/` | Lands on **Today** by default |
| 1.2 | Read the three headline numbers | Last 7 days revenue, customer count, needs-attention count |
| 1.3 | Needs-attention colour | Red if anything urgent, amber if only warnings, green if zero |
| 1.4 | Each action card | Has a title, a money figure where relevant, a plain-English reason, and a button |
| 1.5 | Click "Open unpaid" | Jumps to Unpaid tab |
| 1.6 | Click "See who" on the running-out card | Jumps to Customers **with the "Running out now" segment already applied** |
| 1.7 | Click "See them" on new customers | Jumps to Customers with "New this month" applied |
| 1.8 | ⚠ Sanity | Would you actually have done these things today? If a card is noise, tell me |

---

## 2. Reorder prediction ⚠

This is the most novel and most breakable part.

| # | Test | Expected |
|---|---|---|
| 2.1 | ⚠ Find a customer who ordered in the last 14 days | Status reads **Active Xd**, never "past due" |
| 2.2 | ⚠ Laxmi AvR specifically (ordered Aug 4) | Reads Active, **not** 74d past due |
| 2.3 | Open a customer with repeat purchases | "Reorder timing" section lists products with "Lasts about N days, measured from M repeat purchases" |
| 2.4 | Check an interval against your gut | Does "Avakaya lasts about N days" match what you'd expect for a 250g jar? |
| 2.5 | A customer who ordered since a product fell due | That product appears in the "bought before but not taken since" line, not as due |
| 2.6 | Segment "Running out now" | Only contains people who have **not** ordered recently |
| 2.7 | A product bought only once ever by everyone | Never predicted — no interval should be invented |
| 2.8 | ⚠ Recency ignores mango entirely | "Active Nd" counts days since their last **non-mango** order |
| 2.9 | Reorder clock chart | Also built on non-mango recency; mango-only customers do not appear in it |

---

## 3. Customers list

| # | Test | Expected |
|---|---|---|
| 3.1 | Search by name, phone, and email | All three match |
| 3.2 | Each sort option | Order changes correctly, especially "longest since order" |
| 3.3 | Click any row | Detail modal opens |
| 3.4 | Segment chips | Counts add up sensibly; clicking filters the list |
| 3.5 | Export CSV | Downloads, opens in Excel, matches the on-screen list |
| 3.6 | ⚠ Cross-check one customer's lifetime value against admin | Figures must agree |

---

## 4. Customer detail

| # | Test | Expected |
|---|---|---|
| 4.1 | Stats block | Lifetime, orders, avg order, last/first order, guest vs registered |
| 4.2 | Buys most often | Matches their actual order history |
| 4.3 | Tap a tag | Saves immediately, "Saved" appears |
| 4.4 | Type notes, click Save notes | "Saved" appears |
| 4.5 | ⚠ Close, reopen, then hard-reload the page | Tags and notes both persist |
| 4.6 | Feedback section | Shows for customers who left feedback; cross-check one against admin Feedback tab |
| 4.7 | Order history | Every order listed with correct date, item count, status, value |

---

## 5. Unpaid checkouts ⚠

| # | Test | Expected |
|---|---|---|
| 5.1 | Tab badge | Red count matches the number of rows |
| 5.2 | ⚠ Send payment link **to yourself first** | Email arrives, total correct, link opens working Stripe checkout |
| 5.3 | ⚠ Complete that payment | Order flips to paid in admin |
| 5.4 | Button after sending | Reads "Retry email sent" and cannot be pressed again |
| 5.5 | Order with no email | Button disabled |
| 5.6 | Mark as test | Row dims, gets Test badge, disappears |
| 5.7 | "Show test orders" toggle | Marked rows come back with "Unmark test" |
| 5.8 | Unmark, reload | Returns to normal |
| 5.9 | Empty state | If none, reads "No unpaid checkouts", does not vanish |

---

## 6. Seasons

| # | Test | Expected |
|---|---|---|
| 6.1 | Season selector | Shows 2026 |
| 6.2 | Metrics | Buyers, boxes, revenue, date range the season actually ran |
| 6.3 | ⚠ Boxes by variety | Ranking matches your memory of what sold |
| 6.4 | ⚠ A mango *pickle* buyer | Must **not** appear here — only fresh fruit counts |
| 6.5 | Top buyers | Correct names and box counts |
| 6.6 | Export campaign list | CSV has name, phone, email, boxes, spend, varieties per person |
| 6.7 | Retention note | Says a second season is needed — should not show a fake 0% |
| 6.8 | ⚠ Weekly demand curve | Bars per week; the peak week is highlighted green |
| 6.9 | ⚠ Peak week vs your memory | Does the stated peak match when you were busiest? This drives next year's stock ordering |

---

## 7. Convert / Insights

| # | Test | Expected |
|---|---|---|
| 7.1 | Crossover metrics | Mango buyers, crossed over, still mango-only |
| 7.2 | What mango buyers also buy | No mango *variety* appears in this list |
| 7.3 | Repeat rate by first product | Only products with 5+ customers show a percentage |
| 7.4 | Bought together | Lift values ≥ 1.2; check a pair against intuition |
| 7.5 | Where your demand is | ZIPs ranked by revenue; pickup locations listed |
| 7.6 | ⚠ Compare ZIP clusters to your 3 pickup points | Any big cluster far from all three is a booth opportunity |
| 7.7 | How customers find you | Each customer counted once; per-customer value shown |
| 7.8 | Discount reliance | Given-away total, dependent count, never-discounted count |
| 7.9 | ⚠ Check one "never discounted" customer | Confirm they genuinely never used a code |

---

## 8. Group filters ⚠

Customers now fall into exactly one of three groups by what they have ever bought.

| Group | Meaning |
|---|---|
| **Mango only** | Fresh fruit only. Purely seasonal. |
| **Mango + other** | Bought fruit *and* year-round lines. The crossover group. |
| **Non-mango only** | Never bought fresh fruit. Pure year-round customer. |

| # | Test | Expected |
|---|---|---|
| 8.1 | Each group button shows a live count | Three counts add up to your total customers |
| 8.2 | Toggle each group on and off | List, metrics and chart all change; note reads "N hidden · showing X of Y" |
| 8.3 | Try to switch all three off | The last one refuses to turn off — never shows an empty CRM |
| 8.4 | Default state | Mango-only hidden; the other two shown |
| 8.5 | ⚠ A "Mango + other" customer who bought mangoes recently but no pickles for months | Must read **overdue**, not active. Mango recency is deliberately ignored |
| 8.6 | A mango-only customer's status | Reads **Seasonal Nd**, never "past due" — they have no year-round cycle |
| 8.7 | Toggle "Hide my account" | Your own record appears/disappears |
| 8.8 | ⚠ Known gap | Your record shows phone 9999999999 / gkiran2387@gmail.com. The filter matches the support phone and `contact@shrish.co`, so it may not catch this one. Tell me and I will widen it |
| 8.9 | Insights and Seasons | Should **ignore** these filters — they always use the whole population |

---

## 9. Booth entry (`/crm/booth.html`) ⚠

Test on your phone, not a desktop.

| # | Test | Expected |
|---|---|---|
| 9.1 | Type a known customer's phone | "Returning — name · N orders · $X lifetime", name auto-fills |
| 9.2 | Type an unknown phone | "New customer" |
| 9.3 | Tap products | Count badge appears, tile highlights, bottom total updates |
| 9.4 | − and + in the cart | Quantity adjusts, line total updates |
| 9.5 | Category chips and filter box | Narrow the grid correctly |
| 9.6 | ⚠ Save a sale | Toast confirms, form clears, session tally increments |
| 9.7 | ⚠ Save a second sale to the same phone | Now shows "Returning" without a page refresh |
| 9.8 | Check admin | The booth sale appears with correct total and "✓ Paid · Cash" |
| 9.9 | ⚠ Time one complete sale | Target is under 20 seconds. Tell me where the friction is |
| 9.10 | Leave phone blank and save | Should still save |

---

## 10. Admin — shipping and payment

| # | Test | Expected |
|---|---|---|
| 10.1 | Every admin tab | No stray dialog rendered inline |
| 10.2 | Stats panel | Sits under the nav on the left, compact and styled |
| 10.3 | Orders table | Actions column fully visible, not clipped |
| 10.4 | ⚠ Mark Shipped & Notify | Dialog opens; carrier, ship date, delivery window, one tracking field per order |
| 10.5 | ⚠ Save with tracking, to your own order | Email arrives with working tracking link |
| 10.6 | Admin row after sending | "✓ Customer emailed" in green |
| 10.7 | Order with no tracking entered | Marked shipped, no email, shows "Email not sent · Send now" |
| 10.8 | Click "Send now" | Email sends, flips to green |
| 10.9 | ⚠ Edit a tracking number after emailing | Does **not** auto-resend; use "Resend" if you want it to |
| 10.10 | ⚠ Payment badges | Cash reads "✓ Paid · Cash", Stripe reads "💳 Paid online", pending reads "Pay at pickup" |
| 10.11 | "+ Manual Order" | Saves successfully (this was broken before the rules change) |

---

## 11. Customer-facing (`account.html`) ⚠

Test in an incognito window, signed in as a **customer**, not as admin.

| # | Test | Expected |
|---|---|---|
| 11.1 | ⚠ A shipped order | Shows carrier, clickable tracking number, expected delivery |
| 11.2 | ⚠ Tracking link | Opens the real carrier page for that number |
| 11.3 | An unshipped order | No tracking panel |
| 11.4 | ⚠ Security | You see only your own orders — never anyone else's tracking |

---

## 12. Cross-cutting

| # | Test | Expected |
|---|---|---|
| 12.1 | Reload on each tab | Returns to that tab |
| 12.2 | Reorder chart after switching tabs | Renders at correct size, not collapsed |
| 12.3 | Whole CRM on your phone | Tab bar scrolls sideways; tables scroll; nothing overflows |
| 12.4 | ⚠ Every money figure | Cross-check at least two against admin |
| 12.5 | First impression | Hand it to someone who has never seen it. Can they say what needs doing? |

---

## What to report back

For anything that fails, the most useful things are: which test number, what you saw, and a screenshot. For the reorder intervals specifically, tell me if any number looks wrong against your real-world knowledge of how long a jar lasts — that model is measured from your data, but your judgement is the check on it.
