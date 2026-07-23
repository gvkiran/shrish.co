import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const OUTPUT_DIR = path.resolve("outputs/shrish-complete-qa-plan");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "SHRISH_Complete_QA_Test_Plan.xlsx");
const PREVIEW_DIR = path.join(OUTPUT_DIR, "previews");

const C = {
  black: "#0B0804",
  dark: "#17110A",
  dark2: "#241707",
  gold: "#D58A16",
  gold2: "#F1C453",
  cream: "#FFF8EA",
  white: "#FFFFFF",
  muted: "#8D7656",
  line: "#D8C39E",
  green: "#2E7D32",
  greenLight: "#E4F3E6",
  red: "#B3261E",
  redLight: "#FBE5E3",
  amber: "#B7791F",
  amberLight: "#FFF2CC",
  blue: "#2F6B9A",
  blueLight: "#E3F0FA",
  gray: "#E8E4DD",
};

const STATUS_VALUES = ["Not Run", "Pass", "Fail", "Blocked", "N/A"];
const PRIORITY_VALUES = ["P0", "P1", "P2", "P3"];
const SEVERITY_VALUES = ["Critical", "High", "Medium", "Low", "Cosmetic", "N/A"];

const wb = Workbook.create();
const start = wb.worksheets.add("Start Here");
const tests = wb.worksheets.add("Test Cases");
const dashboard = wb.worksheets.add("Release Dashboard");
const devices = wb.worksheets.add("Device Matrix");
const images = wb.worksheets.add("Image Audit");
const defects = wb.worksheets.add("Defect Log");
const checklist = wb.worksheets.add("Release Checklist");
const guide = wb.worksheets.add("Coverage Guide");

function titleBand(sheet, range, title, subtitle) {
  sheet.mergeCells(range);
  const cell = sheet.getRange(range.split(":")[0]);
  cell.values = [[title]];
  sheet.getRange(range).format = {
    fill: C.black,
    font: { color: C.gold2, bold: true, size: 20 },
    rowHeight: 34,
    verticalAlignment: "center",
  };
  const startCell = range.split(":")[0];
  const row = Number(startCell.match(/\d+/)[0]) + 1;
  const endCol = range.split(":")[1].replace(/\d+/g, "");
  sheet.mergeCells(`A${row}:${endCol}${row}`);
  sheet.getRange(`A${row}`).values = [[subtitle]];
  sheet.getRange(`A${row}:${endCol}${row}`).format = {
    fill: C.dark2,
    font: { color: C.white, italic: true, size: 10 },
    wrapText: true,
    rowHeight: 26,
    verticalAlignment: "center",
  };
}

function sectionHeader(sheet, range, text) {
  sheet.mergeCells(range);
  sheet.getRange(range.split(":")[0]).values = [[text]];
  sheet.getRange(range).format = {
    fill: C.gold,
    font: { color: C.black, bold: true, size: 12 },
    rowHeight: 24,
    verticalAlignment: "center",
  };
}

function headerStyle(range) {
  range.format = {
    fill: C.dark,
    font: { color: C.gold2, bold: true, size: 10 },
    wrapText: true,
    rowHeight: 32,
    borders: { preset: "all", style: "thin", color: C.gold },
    verticalAlignment: "center",
  };
}

function bodyStyle(range) {
  range.format = {
    fill: C.cream,
    font: { color: C.dark, size: 9 },
    wrapText: true,
    rowHeight: 50,
    borders: { preset: "all", style: "thin", color: C.line },
    verticalAlignment: "top",
  };
}

function addStatusRules(range, columnLetter, firstRow) {
  range.dataValidation = { rule: { type: "list", values: STATUS_VALUES } };
  range.conditionalFormats.addCustom(`=$${columnLetter}${firstRow}="Pass"`, { fill: C.greenLight, font: { color: C.green, bold: true } });
  range.conditionalFormats.addCustom(`=$${columnLetter}${firstRow}="Fail"`, { fill: C.redLight, font: { color: C.red, bold: true } });
  range.conditionalFormats.addCustom(`=$${columnLetter}${firstRow}="Blocked"`, { fill: C.amberLight, font: { color: C.amber, bold: true } });
  range.conditionalFormats.addCustom(`=$${columnLetter}${firstRow}="N/A"`, { fill: C.gray, font: { color: C.muted, italic: true } });
}

const testCases = [];
const counters = {};
function tc(code, area, feature, priority, env, device, preconditions, steps, expected) {
  counters[code] = (counters[code] || 0) + 1;
  testCases.push([
    `${code}-${String(counters[code]).padStart(3, "0")}`,
    area,
    feature,
    priority,
    env,
    device,
    preconditions,
    steps,
    expected,
    "Not Run",
    "",
    "N/A",
    "",
    "",
    "",
    "",
  ]);
}

function batch(code, area, defaults, rows) {
  for (const row of rows) tc(code, area, ...row.map((v, i) => v ?? defaults[i]));
}

const allDevices = "Desktop + mobile";
const dev = "Development";
const both = "Development + production smoke";

batch("REL", "Release & deployment", [], [
  ["Main/development branch alignment", "P0", dev, "Git", "Latest remote branches fetched", "Compare main and developement commit history; document intentional differences.", "No unexpected divergence; production changes are understood."],
  ["Clean working tree", "P0", dev, "Git", "Correct release branch checked out", "Run git status and review every tracked/untracked file.", "Only intended release files are present; no secrets, temp files, or accidental outputs."],
  ["Production branch mapping", "P0", dev, "Vercel", "Vercel access", "Confirm Production tracks main and Preview/dev.shrish.co tracks developement.", "Production cannot deploy from an unintended branch."],
  ["Preview deployment health", "P0", dev, "Desktop", "Latest preview deployed", "Open dev.shrish.co and inspect deployment status and browser console.", "Preview is Ready, correct commit is served, no boot errors."],
  ["Firebase Functions runtime", "P0", dev, "CLI", "Repository available", "Confirm functions/package.json uses supported Node runtime and dependencies install cleanly.", "Functions use Node 22 (or current approved runtime) and build successfully."],
  ["Functions and rules deployment", "P0", dev, "Firebase", "Firebase project selected", "Verify intended Cloud Functions and Firestore rules are deployed to the correct project.", "Deployed versions match the release commit."],
  ["Required environment variables", "P0", dev, "Vercel/Firebase", "Dashboard access", "Check required Stripe, Resend, Maps, PostHog, URLs, tax, and shipping variables without exposing values.", "Every required variable exists in the intended environment and no secret is client-exposed."],
  ["Stripe webhook registration", "P0", dev, "Stripe", "Stripe dashboard access", "Verify webhook endpoint, selected events, signing secret, and recent successful deliveries.", "Webhook deliveries return 2xx and use the correct environment secret."],
  ["Stripe enable flag decision", "P0", dev, "Config", "Release decision documented", "Confirm STRIPE_PAYMENTS_ENABLED and test/live key modes match release intent.", "No accidental live charging in dev; production behavior matches approved release."],
  ["Rollback point", "P1", dev, "Git/Vercel", "Candidate identified", "Record the last known-good commit and Vercel deployment before release.", "Rollback can be completed quickly without guessing."],
  ["Static asset cache refresh", "P1", both, allDevices, "New deployment available", "Hard reload; inspect CSS/JS/image responses and service-worker version.", "New assets are served; old cached behavior does not persist."],
  ["Post-deploy smoke", "P0", "Production", allDevices, "Production deployment complete", "Open home, shop, checkout, account, legal pages; add one item without completing live payment.", "Critical production paths load and behave normally."],
]);

batch("NAV", "Public pages & navigation", [], [
  ["All public pages load", "P0", both, allDevices, "Site reachable", "Open Home, About, Shop, Recipes, Contact, Account, Privacy, Refund, Terms.", "Each page returns content, has no blank state, and shows the shared header/footer."],
  ["Desktop header alignment", "P1", both, "Desktop 1366/1440/1920", "Page loaded", "Review logo, nav links, search, account, logout, and cart across widths.", "Header remains aligned with no clipping or unintended wrapping."],
  ["Mobile header alignment", "P0", both, "iPhone + Android", "Page loaded", "Review logo, cart, and hamburger at 360, 375, 390, 412, and 430px.", "Controls are evenly aligned and do not overlap content."],
  ["Hamburger open and close", "P0", both, "Mobile", "Mobile viewport", "Open menu, use close/hamburger, tap outside, press Escape where available.", "Menu opens once, closes reliably, and restores page scrolling."],
  ["Mobile menu content", "P1", both, "Mobile", "Menu open", "Check Home, About, Shop, Recipes, Contact, Cart, Search, Order Now, Account/Logout.", "Items are readable, tappable, correctly ordered, and route correctly."],
  ["Search from header", "P1", both, allDevices, "Products available", "Search a full product name, partial name, and no-match term.", "Relevant shop results appear; no-match state is helpful and reversible."],
  ["Cart count consistency", "P0", both, allDevices, "Cart starts empty", "Add, increment, decrement, remove products; navigate between pages.", "Header and floating cart counts always equal cart quantity."],
  ["Announcement bar", "P2", both, allDevices, "Page loaded", "Review shipping/mango message for wrapping, accuracy, and link behavior.", "Message is readable, current, and does not push or cover the header."],
  ["Footer links", "P1", both, allDevices, "Page loaded", "Open all legal, contact, WhatsApp, Instagram, and policy links.", "Links are correct, safe, and do not produce 404s."],
  ["Back/forward browser navigation", "P1", both, allDevices, "Navigate across three pages", "Use browser back/forward repeatedly after filters and modal use.", "Expected page state is restored without stale overlays or errors."],
]);

batch("HOM", "Homepage", [], [
  ["First hero slide", "P1", both, allDevices, "Fresh session", "Open homepage and observe first slide.", "Pickles are the entrance slide with matching image, copy, and CTA."],
  ["Hero slide order", "P1", both, allDevices, "Homepage open", "Observe a full cycle.", "Slides progress Pickles, Podi, Mangoes, Tathi Thandra in approved order."],
  ["Hero timing", "P2", both, allDevices, "Homepage open", "Time two automatic transitions.", "Each slide remains visible about 6 seconds and is readable."],
  ["Hero content synchronization", "P0", both, allDevices, "Homepage open", "Observe every slide image, eyebrow, heading, body, and buttons.", "Image and text always describe the same product group."],
  ["Hero previous/next controls", "P1", both, allDevices, "Homepage open", "Click/tap previous and next several times.", "Controls move exactly one slide and wrap correctly."],
  ["Hero dots", "P2", both, allDevices, "Homepage open", "Select each dot and observe active state.", "Correct slide opens and active indicator updates."],
  ["Hero pause during interaction", "P2", both, allDevices, "Homepage open", "Hover/focus or interact with slide controls and CTA.", "Autoplay does not steal the slide while customer is interacting."],
  ["Hero category CTAs", "P0", both, allDevices, "Homepage open", "Click each Order/Shop CTA.", "Shop opens with the intended Pickle, Podi, Mango, or Tathi Thandra context."],
  ["Hero responsive framing", "P1", both, "Mobile + tablet + desktop", "Homepage open", "Review images and text at standard viewport sizes.", "Product remains inspectable; headline/buttons fit; next content is hinted without overlap."],
  ["Chat/cart overlay spacing", "P1", both, allDevices, "Widgets visible", "Open chat and scroll through hero and first section.", "Chat and cart controls never cover hero CTAs, arrows, or important text."],
]);

batch("SHP", "Shop & catalog", [], [
  ["Category hierarchy", "P0", both, allDevices, "Catalog loaded", "Review filters for All Products, Sweets, Pickles, Podi, Snacks, Mangoes and veg/non-veg subfilters where applicable.", "Categories are logically grouped, aligned, and easy to scan."],
  ["Category counts", "P1", both, allDevices, "Catalog loaded", "Compare displayed counts with visible products after each filter.", "Counts equal the number of matching catalog products."],
  ["All Products filter", "P0", both, allDevices, "Catalog loaded", "Select All Products after using another filter.", "All eligible products return and active state updates."],
  ["Sweets filter", "P1", both, allDevices, "Catalog loaded", "Select Sweets and any available subfilters.", "Only sweets display; unrelated products are excluded."],
  ["Veg pickles filter", "P1", both, allDevices, "Catalog loaded", "Select Pickles then Veg.", "Only vegetarian pickles display."],
  ["Non-veg pickles filter", "P1", both, allDevices, "Catalog loaded", "Select Pickles then Non-Veg.", "Only non-vegetarian pickles display with preorder messaging where applicable."],
  ["Podi filter", "P1", both, allDevices, "Catalog loaded", "Select Podi.", "Only podi/powder products display."],
  ["Snacks filter", "P1", both, allDevices, "Catalog loaded", "Select Snacks.", "Only snacks display and zero-state is accurate if none are live."],
  ["Mangoes filter", "P0", both, allDevices, "Catalog loaded", "Select Fruits/Mangoes.", "Only mango products display with correct availability."],
  ["Filter mouse-wheel behavior", "P1", both, "Desktop", "Long product list", "Place pointer over category sidebar and use mouse wheel.", "The page scrolls normally; the sidebar does not trap scrolling."],
  ["Price filter", "P2", both, allDevices, "Catalog loaded", "Set minimum/maximum boundaries and clear them.", "Only products in range display and clearing restores results."],
  ["Sort options", "P2", both, allDevices, "Catalog loaded", "Test Featured, price low/high, and name sorting if available.", "Ordering is correct and active filters remain applied."],
  ["Catalog search", "P0", both, allDevices, "Catalog loaded", "Search English and alternate product names such as podi/powder or prawn/shrimp.", "Expected products are discoverable and result count is correct."],
  ["Dense product grid", "P1", both, "Desktop", "Catalog loaded", "Review card density at 1366, 1440, and 1920 widths.", "Cards are about 30% more compact while text, prices, and buttons remain readable."],
  ["Mobile product cards", "P0", both, "Mobile", "Catalog loaded", "Scroll several card types, including long names and multiple variants.", "No text/button overlap, horizontal scroll, or clipped price."],
  ["Availability badges", "P0", both, allDevices, "Live and unavailable products exist", "Inspect Available, Preorder, Coming Soon, and unavailable states.", "Badge, button, and actual purchasability agree."],
  ["Notify when available", "P1", dev, allDevices, "Unavailable product", "Request notification with valid and invalid email; repeat request.", "Valid request is saved once; duplicate and invalid submissions are handled clearly."],
  ["Product modal", "P0", both, allDevices, "Catalog loaded", "Open Details on products across categories.", "Correct modal opens with title, description, pricing, variants, ingredients, policies, and close controls."],
  ["Product gallery", "P0", both, allDevices, "Product with multiple images", "Open modal, click each thumbnail, use keyboard/touch controls.", "Every expected image loads, switches correctly, and stays within the frame."],
  ["Logo fallback", "P1", both, allDevices, "Product without original photo", "Open card/modal for a product with no approved photo.", "SHRISH logo is used; no AI/stock/old mismatched image appears."],
  ["Variant add to cart", "P0", both, allDevices, "Multi-size product", "Add each size/price option and inspect cart.", "Correct variant, unit price, name, and quantity are stored."],
  ["Card add to cart", "P0", both, allDevices, "Available product", "Add from card, add again, then open cart.", "Cart updates once per click and merges/increments the matching variant correctly."],
  ["Unavailable product blocked", "P0", both, allDevices, "Unavailable product", "Try all purchase entry points.", "Product cannot be added; Notify action is offered instead."],
  ["Admin catalog changes surface", "P0", dev, allDevices, "Admin edit saved", "Hard reload shop and find the edited item.", "Approved price/content/image/availability changes are reflected without unrelated changes."],
]);

batch("CRT", "Cart & checkout UI", [], [
  ["Cart persistence", "P0", both, allDevices, "Cart contains items", "Reload and navigate away/back.", "Cart contents, variants, and quantities persist correctly."],
  ["Quantity increase", "P0", both, allDevices, "Item in cart", "Press plus repeatedly.", "Quantity and totals update exactly once per tap/click."],
  ["Quantity decrease above one", "P0", both, allDevices, "Quantity greater than one", "Press minus.", "Quantity decreases by one and totals recalculate."],
  ["Minus at quantity one", "P0", both, allDevices, "Quantity equals one", "Press minus.", "Centered SHRISH-themed confirmation asks whether to remove the item."],
  ["Remove confirmation cancel", "P1", both, allDevices, "Removal dialog open", "Choose Cancel and press Escape where supported.", "Dialog closes and item remains unchanged."],
  ["Remove confirmation approve", "P0", both, allDevices, "Removal dialog open", "Confirm removal.", "Only the selected line is removed and totals/counts update."],
  ["Delete icon visibility", "P1", both, allDevices, "Item in cart", "Inspect delete control on desktop and mobile.", "Boxed trash icon is visible, labeled for accessibility, and does not overlap price/quantity."],
  ["Delete icon behavior", "P0", both, allDevices, "Item in cart", "Activate trash icon, cancel once, confirm once.", "The same themed confirmation is used and the correct item is removed."],
  ["Empty cart", "P1", both, allDevices, "Remove final item", "Observe empty state and CTA.", "No stale totals remain; customer can return to shop."],
  ["Checkout totals presentation", "P0", both, allDevices, "Cart contains items", "Compare line totals, subtotal, tax, shipping, discount, and grand total.", "Math is correct to cents and labels are unambiguous."],
  ["Mobile checkout layout", "P0", both, "iPhone + Android", "Cart contains long-name product", "Review order card, quantity, price, delete, forms, and sticky CTA while scrolling.", "No overlaps, clipped fields, hidden actions, or horizontal scrolling."],
  ["Sticky mobile CTA", "P1", both, "Mobile", "Checkout open", "Scroll from top to bottom and open/close menu/dialog.", "CTA stays usable without covering required fields, dialogs, or browser safe area."],
  ["Contact required fields", "P0", both, allDevices, "Checkout open", "Submit blank name, phone, and email; then correct each field.", "Inline errors identify missing/invalid data and clear when corrected."],
  ["Phone validation", "P1", both, allDevices, "Checkout open", "Try short, formatted US, and international-style values.", "Accepted formats are intentional; impossible values are blocked."],
  ["Email validation", "P1", both, allDevices, "Checkout open", "Try malformed and valid emails.", "Malformed email is blocked; valid email is accepted."],
  ["Special instructions", "P2", both, allDevices, "Checkout open", "Enter punctuation and a long but reasonable note.", "Text is retained, safely displayed, and stored with order."],
  ["Duplicate submit protection", "P0", dev, allDevices, "Form complete", "Double-click/tap submit and simulate slow response.", "One order/payment session is created and button shows progress."],
]);

batch("PAY", "Payment, tax & fulfillment", [], [
  ["Mango-only payment rule", "P0", dev, allDevices, "Cart contains only mango", "Open checkout and inspect fulfillment/payment options.", "Pay at pickup is available; shipping and Stripe-only requirement are not shown."],
  ["Mixed-cart payment rule", "P0", dev, allDevices, "Cart contains mango plus non-mango", "Open checkout.", "Pay at pickup is available and shipping is unavailable for the mixed cart."],
  ["Non-mango payment rule", "P0", dev, allDevices, "Cart contains only pickle/podi/sweet/snack", "Open checkout.", "Online Stripe payment is required; Pay at pickup is not offered."],
  ["Rule recalculation after mango removal", "P0", dev, allDevices, "Mixed cart open", "Remove all mango items without reloading.", "Checkout immediately switches to non-mango online-payment rules."],
  ["Rule recalculation after mango add", "P0", dev, allDevices, "Non-mango cart open", "Return to shop, add mango, reopen checkout.", "Checkout follows mixed-cart pickup rule consistently."],
  ["Pickup locations for pickup", "P1", dev, allDevices, "Pickup-eligible cart", "Choose pickup and review locations.", "Approved pickup locations display and one is required."],
  ["Pickup hidden for shipping", "P0", dev, allDevices, "Shipping-eligible non-mango cart", "Choose Shipping.", "Pickup location cards and pickup-only instructions are hidden."],
  ["Shipping address fields", "P0", dev, allDevices, "Shipping selected", "Review recipient, address line, city, state, ZIP, optional unit.", "Required shipping fields are visible, labeled, and validate correctly."],
  ["Address autocomplete", "P0", dev, allDevices, "Google Places key/config active", "Type a partial US street address slowly.", "Relevant address suggestions appear without exposing the key beyond approved browser use."],
  ["Select suggested address", "P0", dev, allDevices, "Suggestions visible", "Choose a suggestion.", "Street, city, state, ZIP, and country populate accurately and remain editable."],
  ["Manual address fallback", "P1", dev, allDevices, "Autocomplete unavailable or no match", "Enter a complete address manually.", "Checkout remains usable and validates required fields."],
  ["Address API failure", "P1", dev, allDevices, "Simulate blocked/failed Places request", "Type an address and inspect error handling.", "No crash; customer sees a non-blocking fallback path."],
  ["Virginia sales tax", "P0", dev, allDevices, "Known cart amount", "Calculate expected tax using configured rate and compare checkout/Stripe.", "Displayed, saved, and charged tax match to the cent."],
  ["Standard shipping fee", "P0", dev, allDevices, "Eligible non-mango cart below threshold", "Select shipping.", "Configured standard shipping (currently $8.99 unless changed) is added once."],
  ["Free shipping threshold", "P0", dev, allDevices, "Eligible non-mango cart", "Test $74.99, $75.00, and $75.01 merchandise totals.", "Free shipping starts at the configured threshold with clear messaging."],
  ["Mango shipping exclusion", "P0", dev, allDevices, "Cart has mango", "Attempt to reach shipping through UI and crafted state.", "Shipping is blocked for mango-containing carts."],
  ["Stripe test success", "P0", dev, allDevices, "Stripe test mode", "Complete checkout with Stripe success test card.", "One successful payment, one order, paid status, and confirmation page result."],
  ["Stripe decline", "P0", dev, allDevices, "Stripe test mode", "Use declined-card test data.", "Clear recoverable error; no paid order and cart remains available."],
  ["Stripe 3DS flow", "P1", dev, allDevices, "Stripe test mode", "Use authentication-required test card and complete/cancel challenge.", "Both paths return safely with accurate order/payment state."],
  ["Stripe cancel/back", "P1", dev, allDevices, "Stripe checkout launched", "Cancel and return to site.", "Customer returns to the same environment with cart/order state intact."],
  ["Development return host", "P0", dev, allDevices, "Start at dev.shrish.co", "Complete Stripe test payment.", "Success/cancel returns to dev.shrish.co, never shrish.co."],
  ["Confirmation order number", "P1", dev, allDevices, "Successful order", "Review confirmation page and account prompt.", "Order number is prominent, gold, readable, and consistent everywhere."],
  ["Webhook paid status", "P0", dev, "Stripe/Firebase", "Successful Stripe payment", "Inspect webhook delivery and stored order after completion.", "Webhook is verified and order becomes paid exactly once."],
  ["Webhook idempotency", "P0", dev, "Stripe/Firebase", "Successful event exists", "Replay the same Stripe event.", "No duplicate order, email, inventory update, or accounting entry."],
  ["Server price tamper defense", "P0", dev, "DevTools/API", "Test environment and known product price", "Alter client/cart price before creating checkout session.", "Server ignores/rejects tampered price and Stripe uses authoritative catalog price."],
  ["Promo percent", "P1", dev, allDevices, "Valid percent promo", "Apply valid code, wrong case, then remove it.", "Discount, tax, total, and usage rules calculate correctly."],
  ["Promo fixed amount", "P1", dev, allDevices, "Valid fixed promo", "Apply below and above discount value.", "Discount never makes merchandise total negative and totals remain accurate."],
  ["Promo free shipping", "P1", dev, allDevices, "Shipping-eligible cart and valid code", "Apply code before and after choosing shipping.", "Shipping becomes free only when eligibility requirements are met."],
  ["Promo restrictions", "P1", dev, allDevices, "Expired/minimum/one-use/capped promos", "Test each restriction and repeat one-use code.", "Invalid uses are rejected with specific, safe messages."],
]);

batch("ACC", "Customer accounts", [], [
  ["Create account", "P0", dev, allDevices, "Unused test email", "Register with valid details and verify account state.", "Account is created, signed in, and profile is available."],
  ["Create account validation", "P1", dev, allDevices, "Account page open", "Try duplicate email, weak password, mismatch, and missing fields.", "Specific errors display without exposing sensitive details."],
  ["Sign in and sign out", "P0", dev, allDevices, "Existing test account", "Sign in, navigate, refresh, then sign out.", "Session persists as intended and sign-out removes protected access."],
  ["Password reset", "P1", dev, allDevices, "Existing test email", "Request reset and inspect email/confirmation.", "One safe reset flow is sent and UI does not reveal unknown accounts."],
  ["Edit profile", "P1", dev, allDevices, "Signed in", "Update name, phone, preferred pickup, city/address.", "Changes save and prefill checkout without corrupting order history."],
  ["Claim recent order", "P1", dev, allDevices, "Guest order and matching account data", "Create/sign in with matching email/phone.", "Eligible order links once to the correct account."],
  ["Purchase history", "P0", dev, allDevices, "Account has orders", "Open history and compare order cards to Firestore/admin.", "Order number, date, items, total, payment, status, and location match."],
  ["Order details modal", "P1", dev, allDevices, "Order exists", "Open and close details; review all values.", "Correct order opens and modal is responsive/keyboard accessible."],
  ["Edit pending quantity", "P0", dev, allDevices, "Eligible pending order", "Increase/decrease existing item and save.", "Order totals and admin view update safely."],
  ["Add item to pending order", "P1", dev, allDevices, "Eligible pending order", "Use available edit/shop path to add a new product if supported.", "New item can be added only when business rules allow, with correct total/payment handling."],
  ["Cancel pending order", "P0", dev, allDevices, "Cancelable pending order", "Cancel, confirm, refresh, inspect admin.", "Order is canceled once and cannot be processed as active."],
  ["Prevent ineligible edit/cancel", "P0", dev, allDevices, "Paid/fulfilled/canceled order", "Attempt edit/cancel through UI and crafted request.", "Server and UI reject unauthorized state changes."],
  ["Order again", "P1", dev, allDevices, "Historical order", "Choose Order Again and inspect cart.", "Available items/variants are added; unavailable products are clearly handled."],
  ["Feedback", "P1", dev, allDevices, "Eligible fulfilled order", "Submit rating and answers; repeat submission.", "Feedback saves once and appears in admin with correct order/customer."],
  ["Cross-account isolation", "P0", dev, "Security", "Two test accounts", "Attempt to access another user's order/profile identifiers.", "Unauthorized reads/writes are denied by UI and Firestore rules."],
]);

batch("NTF", "Notifications & communications", [], [
  ["Product notification request", "P1", dev, allDevices, "Unavailable product", "Submit notify request and inspect admin/Firestore.", "Request contains correct product and contact data once."],
  ["Availability email target", "P0", dev, "Email", "Two users subscribed to different products", "Mark one product available through the approved admin action.", "Only subscribers to that product receive the availability email."],
  ["No email on unrelated sync", "P0", dev, "Email/Admin", "Product subscriptions exist", "Use price sync without changing availability.", "No availability email is sent and no product is toggled live."],
  ["Email reminder", "P1", dev, "Admin/Email", "Pending order with valid email", "Send reminder from active orders.", "One correctly branded reminder references the right order/location."],
  ["WhatsApp reminder", "P1", dev, allDevices, "Pending order with phone", "Open WhatsApp reminder.", "Correct number and prefilled, accurate order message are used."],
  ["Order confirmation email", "P0", dev, "Email", "Complete pickup and Stripe test orders", "Inspect both emails.", "Order number, items, totals, payment, and fulfillment details are accurate."],
  ["Email failure handling", "P1", dev, "Functions", "Simulate email provider error", "Place order or send reminder.", "Order remains valid; error is logged and admin/customer receives safe feedback."],
]);

batch("ADM", "Admin operations", [], [
  ["Admin access control", "P0", dev, allDevices, "Signed out/non-admin/admin accounts", "Attempt admin URL and sign in with each account.", "Only authorized admins can view or mutate admin data."],
  ["Admin navigation", "P1", dev, "Desktop + tablet", "Admin signed in", "Open every sidebar section and return to Orders.", "All sections render, active state is correct, no content is hidden by navigation."],
  ["Summary metrics", "P1", dev, "Desktop", "Admin data loaded", "Reconcile total orders, pending, fulfilled, revenue, boxes, products live, subscribers.", "Cards match source data and definitions."],
  ["Active orders", "P0", dev, "Desktop", "Pending orders exist", "Search/filter by order, customer, location, date, and status.", "Only matching active orders display and counts recalculate."],
  ["Active item counts", "P1", dev, "Desktop", "Active orders exist", "Sum product quantities manually and compare chips.", "Order, box, and item counts are accurate and readable."],
  ["Manual order", "P0", dev, "Desktop", "Admin signed in", "Create a manual pickup order with multiple items.", "One valid order appears in active/admin/account flows with correct totals."],
  ["Edit active order", "P0", dev, "Desktop", "Pending order", "Edit customer/items/quantities where allowed and save.", "Changes persist safely and totals/counts update."],
  ["Fulfill order", "P0", dev, "Desktop", "Pending order", "Fulfill one order and inspect processed/all/accounting.", "Order leaves active list and is fulfilled exactly once."],
  ["Bulk fulfill", "P0", dev, "Desktop", "Multiple filtered pending orders", "Select a subset and use bulk fulfill.", "Only selected/filtered eligible orders change state."],
  ["No show/cancel/reset", "P1", dev, "Desktop", "Test orders", "Apply each action and confirm resulting lists/statuses.", "Transitions follow allowed state rules and are reversible only where intended."],
  ["Processed and all orders", "P1", dev, "Desktop", "Orders in multiple states", "Search/filter/export and open details.", "All states display in the correct section with complete data."],
  ["Active Excel export", "P1", dev, "Desktop", "Filtered active list", "Export and open workbook.", "Rows/columns match filtered orders and values are usable."],
  ["Print checklist content", "P0", dev, "Print preview", "Active orders exist", "Print checklist and inspect headers/rows.", "Payment type checkboxes are present; How to Use and Revenue are absent; layout is legible."],
  ["Active columns", "P1", dev, "Desktop", "Active orders open", "Inspect table and print output.", "Unneeded Payment and Status columns remain removed where requested without losing actions."],
  ["Add product collapsed", "P1", dev, "Desktop", "Manage Products open", "Confirm form is hidden; open Add New Product, complete, save, cancel.", "Form appears only on request and saves/cancels predictably."],
  ["Product filters and compact cards", "P1", dev, "Desktop", "Manage Products open", "Filter each category and scroll cards.", "Filters align, product cards stay compact, controls remain readable."],
  ["Edit product", "P0", dev, "Desktop", "Test product", "Change one safe field, save, reload admin and shop.", "Only intended field changes and storefront reflects it."],
  ["Product availability toggle", "P0", dev, "Desktop", "Test product unavailable", "Toggle live, save, reload shop; toggle off again.", "Only target product changes availability and notify workflow runs only when appropriate."],
  ["Sync prices isolation", "P0", dev, "Desktop", "Mango products off and mixed catalog", "Record availability; run Sync Prices to Live Store; reload admin/shop.", "Prices sync as designed; availability flags, especially mangoes, do not change."],
  ["Product order/save", "P1", dev, "Desktop", "Manage Products open", "Change display order and save.", "Only intended product ordering changes in storefront."],
  ["Hide product", "P1", dev, "Desktop", "Test product", "Hide/unhide and reload shop.", "Hidden item is not purchasable/discoverable; unhide restores it."],
  ["Product image fields", "P0", dev, "Desktop", "Manage Products edit", "Review primary/gallery path fields and save approved images.", "Valid paths persist, render, and do not overwrite unrelated galleries."],
  ["Customer accounts admin", "P1", dev, "Desktop", "Accounts exist", "Search/export; inspect orders; test permitted deletion.", "Counts are accurate; only accounts with no orders can be deleted."],
  ["Feedback admin", "P1", dev, "Desktop", "Feedback exists", "Filter/search by rating/location/product and inspect summary.", "Summary and rows match submissions and remain readable."],
  ["Subscribers admin", "P1", dev, "Desktop", "Subscribers exist", "Search/export/delete approved test subscriber.", "Data is accurate and deletion targets only selected record."],
  ["Promo codes admin", "P0", dev, "Desktop", "Admin signed in", "Create/edit/disable percent, fixed, free shipping, minimum, cap, expiry, one-use codes.", "Rules persist and checkout enforces exactly what admin configured."],
  ["Refund controls", "P0", dev, "Desktop", "Paid Stripe test order", "Inspect refund eligibility and test-mode refund flow.", "Customer refund UI remains hidden; admin refund is deliberate, auditable, and updates status."],
  ["Accounting batch dropdown", "P1", dev, "Desktop", "Open/closed batches exist", "Use dropdowns to select open/closed batches and open breakdown.", "No long uncontrolled scroll; selected batch metrics are compact and correct."],
  ["Accounting save/close/reopen", "P0", dev, "Desktop", "Test batch", "Save tally, close, locate closed, reopen, verify totals.", "State and totals persist without duplicate batches."],
  ["Accounting export", "P1", dev, "Desktop", "Batch selected", "Export CSV and reconcile key fields.", "Export matches displayed batch and is usable for bookkeeping."],
  ["Pickup tally compact layout", "P1", dev, "Desktop + tablet", "Tally open", "Review invoice, cash, Zelle, card, and balance inputs.", "Panels are compact, aligned, and all numeric calculations are accurate."],
  ["Growth analytics", "P2", dev, "Desktop", "Analytics data available", "Open Growth Dashboard and compare key events/metrics with source.", "Charts/metrics load without exposing PII and definitions are clear."],
]);

batch("SEO", "SEO & content", [], [
  ["Unique page titles", "P1", both, "Desktop", "Pages reachable", "Inspect title for every indexable page.", "Each title is unique, descriptive, and includes SHRISH appropriately."],
  ["Meta descriptions", "P1", both, "Desktop", "Pages reachable", "Inspect description tags for indexable pages.", "Descriptions are unique, accurate, and compelling without keyword stuffing."],
  ["Self-referencing canonicals", "P0", "Production", "Production pages reachable", "Inspect canonical on Home, Shop, About, Contact, Recipes, Privacy, Refund, Terms.", "Each points to its preferred www.shrish.co URL; no duplicate/missing canonical."],
  ["Robots directives", "P0", both, "Desktop", "Pages reachable", "Inspect robots meta and robots.txt.", "Public content is indexable; order, account, admin, and development are protected from indexing."],
  ["Sitemap", "P1", "Production", "sitemap.xml reachable", "Open sitemap and verify listed URLs, protocol, host, and current public pages.", "Only canonical public URLs are listed and all return 200."],
  ["Structured data", "P1", "Production", "Public pages reachable", "Run Google rich result/schema validation on organization and product data.", "Valid schema uses accurate business/product information and prices/availability."],
  ["Open Graph/social metadata", "P2", "Production", "Public pages reachable", "Inspect og:title, description, URL, image and share preview.", "Share preview is branded, readable, and uses an approved image."],
  ["Heading structure", "P1", both, allDevices, "Pages reachable", "Inspect H1-H3 hierarchy and visible page names.", "One meaningful H1 per page and logical nested headings."],
  ["Image alt text", "P1", both, allDevices, "Images loaded", "Inspect product, hero, recipe, and logo alt text.", "Alt text identifies meaningful images; decorative images are appropriately ignored."],
  ["Broken links/assets", "P0", both, "Crawler + browser", "Site reachable", "Crawl internal links and inspect network 404/500 responses.", "No broken internal links, missing scripts/styles, or missing product images."],
  ["Legal content links", "P0", both, allDevices, "Checkout/footer open", "Open Privacy, Refund, Terms from footer and checkout agreement.", "Pages load, dates/contact/business terms are current, and links point to canonical pages."],
  ["Content accuracy", "P1", both, allDevices, "Catalog and policies available", "Proofread pricing, product names, weights, pickup/shipping/payment statements, allergy notices.", "Copy matches actual business rules with no contradictory claims."],
]);

batch("A11Y", "Accessibility & responsive UI", [], [
  ["Keyboard navigation", "P1", both, "Desktop", "Page loaded", "Use Tab/Shift+Tab/Enter/Space through header, filters, cards, forms, dialogs.", "Focus order is logical and all actions work without a mouse."],
  ["Visible focus", "P1", both, allDevices, "Keyboard navigation", "Observe focus on links, buttons, fields, thumbnails, dialog controls.", "Focus indicator is clearly visible against dark and light backgrounds."],
  ["Modal focus management", "P1", both, "Desktop", "Open product/remove/order modal", "Tab through, press Escape, check focus after close.", "Focus is trapped inside while open and returns to the trigger."],
  ["Form labels and errors", "P0", both, allDevices, "Forms available", "Inspect accessible names; trigger validation errors with screen reader or accessibility tree.", "Every field has a persistent label and errors are programmatically associated."],
  ["Color contrast", "P1", both, allDevices, "Pages loaded", "Check gold, muted text, badges, buttons, form placeholders on black/cream surfaces.", "Essential text and controls meet WCAG AA contrast."],
  ["Zoom 200 percent", "P1", both, "Desktop", "Browser at 200%", "Navigate home, shop, checkout, account, legal pages.", "Content reflows without loss, overlap, or horizontal scrolling."],
  ["Text size and long content", "P1", both, "Mobile", "Largest system text/long product names", "Review navigation, cards, checkout, admin tables where applicable.", "Text wraps cleanly and controls retain stable dimensions."],
  ["Touch targets", "P1", both, "Mobile", "Mobile viewport", "Measure/tap hamburger, cart, arrows, plus/minus, trash, thumbnails, filters.", "Targets are comfortably tappable and separated."],
  ["Safe-area handling", "P1", both, "iPhone Safari", "Notched iPhone", "Review header, fixed CTA, floating widgets, and bottom browser chrome.", "No action is hidden under notches, home indicator, or browser controls."],
  ["Reduced motion", "P2", both, allDevices, "OS prefers-reduced-motion enabled", "Open homepage and interactions.", "Autoplay/animations are reduced or non-disruptive."],
  ["No horizontal overflow", "P0", both, "360-430px mobile", "Each page open", "Swipe horizontally at top/middle/bottom.", "Page has no unintended horizontal movement or clipped off-screen controls."],
  ["Landscape mobile/tablet", "P2", both, "Mobile landscape + tablet", "Rotate device", "Review header, modal, shop, and checkout.", "Layout adapts without requiring reload and remains usable."],
]);

batch("PERF", "Performance, security & analytics", [], [
  ["Console and network health", "P0", both, allDevices, "DevTools open", "Navigate all major flows and filter console/network errors.", "No uncaught errors, repeated failures, mixed content, or unexplained 4xx/5xx."],
  ["Core Web Vitals", "P1", "Production", "Mobile + desktop", "Run Lighthouse/PageSpeed on Home, Shop, Checkout.", "LCP, CLS, and INP are within agreed thresholds or documented."],
  ["Image optimization", "P1", both, allDevices, "Network throttling", "Inspect dimensions, file sizes, lazy loading, and below-fold requests.", "Images are appropriately sized/compressed; below-fold assets lazy load."],
  ["Service worker update", "P0", both, allDevices, "Old version cached", "Load old deployment, release new version, refresh/reopen.", "Customer receives new JS/CSS/catalog without a broken mixed-version state."],
  ["Firestore unauthorized access", "P0", dev, "Security", "Signed-out/non-admin session", "Attempt direct reads/writes to orders, admin data, refunds, promos, notifications.", "Rules deny unauthorized operations while valid customer/admin flows still work."],
  ["API key restrictions", "P0", dev, "Google Cloud", "Maps key configured", "Verify HTTP referrers and API restrictions for dev, shrish.co, www.shrish.co.", "Key works only on approved hosts and only required Maps/Places APIs."],
  ["Secret scan", "P0", dev, "Repository", "Release candidate", "Scan tracked files/history/diff for Stripe, webhook, Resend, Firebase admin, Maps, and other secrets.", "No server secret or unrestricted sensitive credential is committed."],
  ["Analytics page views", "P2", both, allDevices, "Analytics enabled", "Navigate public pages and inspect analytics debugger/network.", "One page-view event per navigation with correct path and no PII."],
  ["Commerce analytics", "P2", dev, allDevices, "Analytics enabled", "Search, view product, add/remove cart, begin checkout, purchase test order.", "Expected events fire once with correct product/value metadata and no PII."],
  ["Error logging", "P1", dev, "Functions/browser", "Safe simulated error", "Trigger recoverable client/function error and inspect logs.", "Enough context is logged for diagnosis without storing secrets or payment data."],
]);

// START HERE
titleBand(start, "A1:H1", "SHRISH Complete QA Test Plan", "Reusable release guide for development validation, production readiness, and post-deploy smoke testing");
start.getRange("A3:B8").values = [
  ["Workbook version", "1.0"],
  ["Prepared for", "SHRISH business website"],
  ["Development URL", "https://dev.shrish.co/"],
  ["Production URL", "https://www.shrish.co/"],
  ["Generated", new Date().toISOString().slice(0, 10)],
  ["Test library", `${testCases.length} detailed test cases`],
];
start.getRange("A3:A8").format = { fill: C.dark, font: { color: C.gold2, bold: true }, borders: { preset: "all", style: "thin", color: C.gold } };
start.getRange("B3:B8").format = { fill: C.cream, font: { color: C.dark }, borders: { preset: "all", style: "thin", color: C.line } };

sectionHeader(start, "A10:H10", "How to use this workbook");
start.getRange("A11:H16").values = [
  ["1", "Prepare", "Use a dedicated test account, test email, Stripe test mode, and orders prefixed with QA.", "", "", "", "", ""],
  ["2", "Run release gates", "Complete the Release Checklist first. Stop if any P0 gate fails.", "", "", "", "", ""],
  ["3", "Execute cases", "Filter Test Cases by area, priority, environment, or device. Record Pass/Fail and evidence.", "", "", "", "", ""],
  ["4", "Cover devices", "Use Device Matrix to confirm desktop, iPhone, Android, and tablet coverage.", "", "", "", "", ""],
  ["5", "Log defects", "Create a Defect Log row for each failure and link its test case ID.", "", "", "", "", ""],
  ["6", "Release decision", "Approve only when all P0/P1 tests pass or have an explicitly accepted exception.", "", "", "", "", ""],
];
for (let r = 11; r <= 16; r++) start.mergeCells(`C${r}:H${r}`);
start.getRange("A11:H16").format = { fill: C.cream, font: { color: C.dark, size: 10 }, wrapText: true, rowHeight: 34, borders: { preset: "all", style: "thin", color: C.line }, verticalAlignment: "center" };
start.getRange("A11:A16").format = { fill: C.gold2, font: { color: C.black, bold: true, size: 12 }, borders: { preset: "all", style: "thin", color: C.gold } };
start.getRange("B11:B16").format = { fill: C.dark2, font: { color: C.white, bold: true }, borders: { preset: "all", style: "thin", color: C.gold } };

sectionHeader(start, "A18:H18", "Release rules");
start.getRange("A19:H24").values = [
  ["Gate", "All P0 and P1 cases Pass, or an owner documents and accepts the exception.", "", "", "", "", "", ""],
  ["Defects", "Zero open Critical or High defects. Medium defects require an owner and target date.", "", "", "", "", "", ""],
  ["Payments", "Use Stripe test mode on development. Never place an unapproved live production charge.", "", "", "", "", "", ""],
  ["Production", "Do deep testing on development. Production receives a controlled smoke test after deployment.", "", "", "", "", "", ""],
  ["Data", "Use test customers/orders and clean them up. Do not alter real customer orders for QA.", "", "", "", "", "", ""],
  ["Evidence", "Attach screenshot, order number, deployment URL, console log, or defect ID for every failure.", "", "", "", "", "", ""],
];
for (let r = 19; r <= 24; r++) start.mergeCells(`B${r}:H${r}`);
start.getRange("A19:H24").format = { fill: C.cream, font: { color: C.dark, size: 10 }, wrapText: true, rowHeight: 30, borders: { preset: "all", style: "thin", color: C.line }, verticalAlignment: "center" };
start.getRange("A19:A24").format = { fill: C.dark, font: { color: C.gold2, bold: true }, borders: { preset: "all", style: "thin", color: C.gold } };

sectionHeader(start, "A26:H26", "Status legend");
start.getRange("A27:E28").values = [
  ["Not Run", "Pass", "Fail", "Blocked", "N/A"],
  ["Not executed", "Matches expected result", "Unexpected behavior", "Cannot run due to dependency", "Not applicable to this release"],
];
start.getRange("A27:E28").format = { wrapText: true, rowHeight: 30, borders: { preset: "all", style: "thin", color: C.line } };
start.getRange("A27").format = { fill: C.cream, font: { color: C.dark, bold: true } };
start.getRange("B27").format = { fill: C.greenLight, font: { color: C.green, bold: true } };
start.getRange("C27").format = { fill: C.redLight, font: { color: C.red, bold: true } };
start.getRange("D27").format = { fill: C.amberLight, font: { color: C.amber, bold: true } };
start.getRange("E27").format = { fill: C.gray, font: { color: C.muted, bold: true } };
start.getRange("A28:E28").format = { fill: C.cream, font: { color: C.dark, size: 9 }, wrapText: true, borders: { preset: "all", style: "thin", color: C.line } };
start.getRange("A1:H30").format.wrapText = true;
start.getRange("A1:H30").format.columnWidth = 15;
start.getRange("A:A").format.columnWidth = 16;
start.getRange("B:B").format.columnWidth = 23;
start.getRange("C:H").format.columnWidth = 16;
start.freezePanes.freezeRows(2);

// TEST CASES
titleBand(tests, "A1:P1", "Detailed Test Cases", "Filter by priority, area, environment, or device. Enter execution results in the white columns.");
const testHeaders = ["Test ID", "Area", "Feature", "Priority", "Environment", "Device / View", "Preconditions", "Test Steps", "Expected Result", "Status", "Actual Result", "Severity if Failed", "Evidence / URL", "Tester", "Test Date", "Defect / Notes"];
tests.getRange("A3:P3").values = [testHeaders];
headerStyle(tests.getRange("A3:P3"));
tests.getRange(`A4:P${testCases.length + 3}`).values = testCases;
bodyStyle(tests.getRange(`A4:P${testCases.length + 3}`));
tests.getRange(`D4:D${testCases.length + 3}`).dataValidation = { rule: { type: "list", values: PRIORITY_VALUES } };
addStatusRules(tests.getRange(`J4:J${testCases.length + 3}`), "J", 4);
tests.getRange(`L4:L${testCases.length + 3}`).dataValidation = { rule: { type: "list", values: SEVERITY_VALUES } };
tests.getRange(`O4:O${testCases.length + 3}`).setNumberFormat("yyyy-mm-dd");
const testsTable = tests.tables.add(`A3:P${testCases.length + 3}`, true, "ShrishTestCases");
testsTable.style = "TableStyleMedium2";
tests.freezePanes.freezeRows(3);
tests.freezePanes.freezeColumns(3);
const widths = [12, 22, 26, 9, 18, 18, 28, 42, 40, 11, 30, 15, 24, 16, 13, 28];
widths.forEach((w, i) => tests.getRangeByIndexes(0, i, testCases.length + 3, 1).format.columnWidth = w);

// DASHBOARD
titleBand(dashboard, "A1:J1", "Release Dashboard", "Formula-driven summary of the Test Cases sheet. Update statuses there and this page refreshes automatically.");
sectionHeader(dashboard, "A3:D3", "Execution summary");
dashboard.getRange("A4:B11").values = [
  ["Metric", "Result"],
  ["Total cases", ""],
  ["Executed", ""],
  ["Pass", ""],
  ["Fail", ""],
  ["Blocked", ""],
  ["Not Run", ""],
  ["Pass rate", ""],
];
dashboard.getRange("B5:B11").formulas = [
  [`=COUNTA('Test Cases'!$A$4:$A$${testCases.length + 3})`],
  [`=B5-B10-COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},"N/A")`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},"Pass")`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},"Fail")`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},"Blocked")`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},"Not Run")`],
  ["=IF((B7+B8+B9)=0,0,B7/(B7+B8+B9))"],
];
headerStyle(dashboard.getRange("A4:B4"));
dashboard.getRange("A5:B11").format = { fill: C.cream, font: { color: C.dark, size: 11 }, rowHeight: 26, borders: { preset: "all", style: "thin", color: C.line } };
dashboard.getRange("A5:A11").format = { fill: C.dark, font: { color: C.gold2, bold: true }, borders: { preset: "all", style: "thin", color: C.gold } };
dashboard.getRange("B11").setNumberFormat("0.0%");

const areas = [...new Set(testCases.map((r) => r[1]))];
sectionHeader(dashboard, "A13:F13", "Coverage by area");
dashboard.getRange("A14:F14").values = [["Area", "Total", "Pass", "Fail", "Blocked", "Not Run"]];
headerStyle(dashboard.getRange("A14:F14"));
dashboard.getRange(`A15:A${14 + areas.length}`).values = areas.map((a) => [a]);
for (let i = 0; i < areas.length; i++) {
  const r = 15 + i;
  dashboard.getRange(`B${r}:F${r}`).formulas = [[
    `=COUNTIF('Test Cases'!$B$4:$B$${testCases.length + 3},A${r})`,
    `=COUNTIFS('Test Cases'!$B$4:$B$${testCases.length + 3},A${r},'Test Cases'!$J$4:$J$${testCases.length + 3},"Pass")`,
    `=COUNTIFS('Test Cases'!$B$4:$B$${testCases.length + 3},A${r},'Test Cases'!$J$4:$J$${testCases.length + 3},"Fail")`,
    `=COUNTIFS('Test Cases'!$B$4:$B$${testCases.length + 3},A${r},'Test Cases'!$J$4:$J$${testCases.length + 3},"Blocked")`,
    `=COUNTIFS('Test Cases'!$B$4:$B$${testCases.length + 3},A${r},'Test Cases'!$J$4:$J$${testCases.length + 3},"Not Run")`,
  ]];
}
dashboard.getRange(`A15:F${14 + areas.length}`).format = { fill: C.cream, font: { color: C.dark, size: 9 }, rowHeight: 23, borders: { preset: "all", style: "thin", color: C.line } };
dashboard.getRange("A:A").format.columnWidth = 28;
dashboard.getRange("B:F").format.columnWidth = 13;
dashboard.getRange("H4:I9").values = [
  ["Status", "Count"],
  ["Pass", ""],
  ["Fail", ""],
  ["Blocked", ""],
  ["Not Run", ""],
  ["N/A", ""],
];
dashboard.getRange("I5:I9").formulas = [
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},H5)`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},H6)`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},H7)`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},H8)`],
  [`=COUNTIF('Test Cases'!$J$4:$J$${testCases.length + 3},H9)`],
];
headerStyle(dashboard.getRange("H4:I4"));
dashboard.getRange("H5:I9").format = { fill: C.cream, font: { color: C.dark }, borders: { preset: "all", style: "thin", color: C.line } };
const statusChart = dashboard.charts.add("bar", dashboard.getRange("H4:I9"));
statusChart.titleText = "Current execution status";
statusChart.hasLegend = false;
statusChart.setPosition("H11", "N26");
dashboard.freezePanes.freezeRows(2);

// DEVICE MATRIX
titleBand(devices, "A1:J1", "Device & Browser Matrix", "Use real devices where possible. Evidence should include screenshot, viewport, browser version, and test date.");
const deviceHeaders = ["ID", "Platform", "Device / Viewport", "Browser", "Required Scope", "Priority", "Status", "Evidence", "Tester", "Date / Notes"];
devices.getRange("A3:J3").values = [deviceHeaders];
headerStyle(devices.getRange("A3:J3"));
const deviceRows = [
  ["DEV-01", "Windows 11", "1366 x 768", "Chrome latest", "Full public regression + admin", "P0", "Not Run", "", "", ""],
  ["DEV-02", "Windows 11", "1920 x 1080", "Chrome latest", "Visual density, shop, admin", "P1", "Not Run", "", "", ""],
  ["DEV-03", "Windows 11", "1440 x 900", "Edge latest", "Public smoke + checkout", "P1", "Not Run", "", "", ""],
  ["DEV-04", "macOS", "1440 x 900 or similar", "Safari latest", "Public smoke + checkout", "P2", "Not Run", "", "", ""],
  ["DEV-05", "iOS", "iPhone SE / 375 x 667", "Safari", "Header, shop, checkout, account", "P0", "Not Run", "", "", ""],
  ["DEV-06", "iOS", "iPhone 14/15 / 390 x 844", "Safari", "Full mobile regression", "P0", "Not Run", "", "", ""],
  ["DEV-07", "iOS", "iPhone Pro Max / 430 x 932", "Safari", "Large mobile + safe area", "P1", "Not Run", "", "", ""],
  ["DEV-08", "Android", "360 x 800", "Chrome", "Small Android regression", "P0", "Not Run", "", "", ""],
  ["DEV-09", "Android", "412 x 915", "Chrome", "Full mobile regression", "P0", "Not Run", "", "", ""],
  ["DEV-10", "iPad/tablet", "768 x 1024 portrait", "Safari/Chrome", "Responsive public + checkout", "P1", "Not Run", "", "", ""],
  ["DEV-11", "iPad/tablet", "1024 x 768 landscape", "Safari/Chrome", "Responsive public + admin", "P2", "Not Run", "", "", ""],
  ["DEV-12", "Accessibility", "200% zoom + keyboard", "Chrome/Edge", "Public + checkout + dialogs", "P1", "Not Run", "", "", ""],
];
devices.getRange(`A4:J${deviceRows.length + 3}`).values = deviceRows;
bodyStyle(devices.getRange(`A4:J${deviceRows.length + 3}`));
addStatusRules(devices.getRange(`G4:G${deviceRows.length + 3}`), "G", 4);
devices.getRange(`J4:J${deviceRows.length + 3}`).setNumberFormat("yyyy-mm-dd");
devices.tables.add(`A3:J${deviceRows.length + 3}`, true, "ShrishDeviceMatrix").style = "TableStyleMedium2";
[11, 14, 24, 18, 34, 10, 12, 25, 15, 24].forEach((w, i) => devices.getRangeByIndexes(0, i, deviceRows.length + 3, 1).format.columnWidth = w);
devices.freezePanes.freezeRows(3);

// IMAGE AUDIT
titleBand(images, "A1:K1", "Verified Product Image Audit", "Confirms every approved original image appears under the correct product on card, modal gallery, desktop, and mobile.");
const imageHeaders = ["Product", "Expected image files", "Expected count", "Card image correct", "Modal gallery count", "Images match product", "No old/mismatched image", "Mobile crop", "All files load", "Status", "Evidence / Notes"];
images.getRange("A3:K3").values = [imageHeaders];
headerStyle(images.getRange("A3:K3"));
const imageRows = [
  ["Cauliflower Pickle", "cauliflower-pickle-verified-1.jpg\ncauliflower-pickle-verified-2.jpg\ncauliflower-pickle-verified-3.jpg", 3],
  ["Drumstick Pickle", "drumstick-pickle-verified-1.jpg\ndrumstick-pickle-verified-2.jpg", 2],
  ["Gongura Pickle / Pachadi", "gongura-pickle-verified-1.jpg\ngongura-pickle-verified-2.jpg\ngongura-pickle-verified-3.jpg", 3],
  ["Mixed Vegetable Pickle", "mix-veg-pickle-original-1.jpg\nmix-veg-pickle-original-2.jpg\nmix-veg-pickle-original-3.jpg", 3],
  ["Chicken Boneless Pickle", "chicken-boneless-pickle-verified-1.jpg\nchicken-boneless-pickle-verified-2.jpg\nchicken-boneless-pickle-verified-3.jpg", 3],
  ["Mutton Boneless", "mutton-boneless-pickle-verified-1.jpg\nmutton-boneless-pickle-verified-2.jpg", 2],
  ["Prawns / Shrimp Pickle", "shrimp-pickle-verified-1.jpg\nshrimp-pickle-verified-2.jpg", 2],
  ["Moringa Powder / Munagaku Podi", "moringa-podi-verified-1.jpg\nmoringa-podi-verified-2.jpg", 2],
  ["Idli Podi", "idli-podi-verified-1.jpg\nidli-podi-verified-2.jpg", 2],
  ["Karivepaku Podi / Curry Leaf Powder", "curry-leaf-podi-verified-1.jpg\ncurry-leaf-podi-verified-2.jpg", 2],
  ["Karela / Kakarakaya Pickle", "karela-pickle-verified-1.jpg\nkarela-pickle-verified-2.jpg", 2],
  ["Flaxseed Podi", "flaxseed-podi-verified-1.jpg\nflaxseed-podi-verified-2.jpg", 2],
  ["Kakarakaya Karam / Bitter Gourd Podi", "karela-podi-verified-1.jpg\nkarela-podi-verified-2.jpg", 2],
].map((r) => [...r, "Not Run", "Not Run", "Not Run", "Not Run", "Not Run", "Not Run", "Not Run", ""]);
images.getRange(`A4:K${imageRows.length + 3}`).values = imageRows;
bodyStyle(images.getRange(`A4:K${imageRows.length + 3}`));
for (const col of ["D", "E", "F", "G", "H", "I", "J"]) addStatusRules(images.getRange(`${col}4:${col}${imageRows.length + 3}`), col, 4);
images.tables.add(`A3:K${imageRows.length + 3}`, true, "ShrishImageAudit").style = "TableStyleMedium2";
[30, 48, 13, 17, 17, 18, 20, 15, 15, 12, 30].forEach((w, i) => images.getRangeByIndexes(0, i, imageRows.length + 3, 1).format.columnWidth = w);
images.getRange(`A4:K${imageRows.length + 3}`).format.rowHeight = 74;
images.freezePanes.freezeRows(3);

// DEFECT LOG
titleBand(defects, "A1:O1", "Defect Log", "Create one row for every failed test. Keep reproduction steps exact and attach evidence.");
const defectHeaders = ["Defect ID", "Test Case ID", "Title", "Severity", "Page / Feature", "Environment", "Device / Browser", "Reproduction Steps", "Actual Result", "Expected Result", "Evidence", "Owner", "Status", "Opened", "Closed / Retest Notes"];
defects.getRange("A3:O3").values = [defectHeaders];
headerStyle(defects.getRange("A3:O3"));
const blankDefects = Array.from({ length: 40 }, (_, i) => [`BUG-${String(i + 1).padStart(3, "0")}`, "", "", "Medium", "", "Development", "", "", "", "", "", "", "Open", "", ""]);
defects.getRange("A4:O43").values = blankDefects;
bodyStyle(defects.getRange("A4:O43"));
defects.getRange("D4:D43").dataValidation = { rule: { type: "list", values: ["Critical", "High", "Medium", "Low", "Cosmetic"] } };
defects.getRange("M4:M43").dataValidation = { rule: { type: "list", values: ["Open", "In Progress", "Ready for Retest", "Closed", "Deferred"] } };
defects.getRange("N4:N43").setNumberFormat("yyyy-mm-dd");
defects.tables.add("A3:O43", true, "ShrishDefectLog").style = "TableStyleMedium2";
[12, 14, 28, 12, 20, 17, 22, 38, 30, 30, 24, 16, 18, 13, 30].forEach((w, i) => defects.getRangeByIndexes(0, i, 43, 1).format.columnWidth = w);
defects.freezePanes.freezeRows(3);
defects.freezePanes.freezeColumns(2);

// RELEASE CHECKLIST
titleBand(checklist, "A1:I1", "Production Release Checklist", "Complete in order. A failed P0 gate means stop the release until fixed or explicitly approved by the business owner.");
const checklistHeaders = ["Gate ID", "Phase", "Check", "Priority", "How to verify", "Expected evidence", "Owner", "Status", "Notes / Link"];
checklist.getRange("A3:I3").values = [checklistHeaders];
headerStyle(checklist.getRange("A3:I3"));
const releaseRows = [
  ["GATE-01", "Source", "Fetch remotes; compare main and developement; review all intentional differences", "P0", "git fetch --prune; log/diff; review release commit", "Commit IDs and approved diff", "", "Not Run", ""],
  ["GATE-02", "Source", "Working tree contains only intended files", "P0", "git status plus manual review", "Clean or documented status", "", "Not Run", ""],
  ["GATE-03", "Security", "No secrets or unrestricted keys in tracked files/diff", "P0", "Secret scan and GitHub alerts", "Zero unresolved valid alerts", "", "Not Run", ""],
  ["GATE-04", "Firebase", "Functions build and tests pass on supported Node runtime", "P0", "Install/build/test functions", "Passing command output", "", "Not Run", ""],
  ["GATE-05", "Firebase", "Cloud Functions and Firestore rules deployed to correct project", "P0", "Firebase dashboard/CLI deploy history", "Deployment IDs and timestamp", "", "Not Run", ""],
  ["GATE-06", "Payments", "Stripe keys, enable flag, webhook secret, URLs match environment", "P0", "Vercel/Firebase/Stripe dashboard review", "Configuration screenshots without values", "", "Not Run", ""],
  ["GATE-07", "Payments", "Webhook endpoint is healthy and idempotent", "P0", "Send/replay test event", "2xx delivery and one order update", "", "Not Run", ""],
  ["GATE-08", "Payments", "Server rejects client price tampering", "P0", "Alter client price and create test session", "Stripe charges catalog price", "", "Not Run", ""],
  ["GATE-09", "Shipping", "Maps public-config, referrers, and required APIs are correct", "P0", "Check /api/public-config and Google Cloud restrictions", "Autocomplete works only on approved hosts", "", "Not Run", ""],
  ["GATE-10", "Checkout", "Mango-only, mixed, and non-mango payment/fulfillment rules pass", "P0", "Run PAY-001 through PAY-006", "Screenshots for all three cart types", "", "Not Run", ""],
  ["GATE-11", "Checkout", "Tax, shipping fee, free threshold, and promo math pass", "P0", "Boundary tests and Stripe amount comparison", "Reconciled totals", "", "Not Run", ""],
  ["GATE-12", "Catalog", "All approved product images and galleries pass Image Audit", "P1", "Complete Image Audit sheet", "All rows Pass", "", "Not Run", ""],
  ["GATE-13", "Admin", "Price sync does not alter availability; storefront changes reflect", "P0", "Run ADM sync/edit/toggle cases", "Before/after evidence", "", "Not Run", ""],
  ["GATE-14", "Mobile", "Required iPhone and Android device rows pass", "P0", "Complete Device Matrix P0 rows", "Screenshots and browser versions", "", "Not Run", ""],
  ["GATE-15", "SEO", "Canonicals, robots, sitemap, noindex, metadata and broken links pass", "P1", "Run SEO cases/crawl", "Crawler/validator output", "", "Not Run", ""],
  ["GATE-16", "Quality", "All P0/P1 tests pass and no Critical/High defects are open", "P0", "Review Dashboard and Defect Log", "Dashboard screenshot and approvals", "", "Not Run", ""],
  ["GATE-17", "Release", "Rollback commit/deployment recorded", "P1", "Record last known-good main/Vercel deployment", "Commit and deployment URL", "", "Not Run", ""],
  ["GATE-18", "Release", "Deploy main and verify Vercel Ready status", "P0", "Push approved commit; monitor deployment", "Production deployment URL", "", "Not Run", ""],
  ["GATE-19", "Smoke", "Production public smoke passes without a live test charge", "P0", "Home, shop, cart, checkout rules, account, policies", "Smoke evidence", "", "Not Run", ""],
  ["GATE-20", "Monitor", "Analytics, logs, Stripe webhook, Firebase errors checked after release", "P1", "Monitor 30-60 minutes", "No unexplained error spike", "", "Not Run", ""],
];
checklist.getRange(`A4:I${releaseRows.length + 3}`).values = releaseRows;
bodyStyle(checklist.getRange(`A4:I${releaseRows.length + 3}`));
addStatusRules(checklist.getRange(`H4:H${releaseRows.length + 3}`), "H", 4);
checklist.getRange(`D4:D${releaseRows.length + 3}`).dataValidation = { rule: { type: "list", values: PRIORITY_VALUES } };
checklist.tables.add(`A3:I${releaseRows.length + 3}`, true, "ShrishReleaseChecklist").style = "TableStyleMedium2";
[12, 14, 34, 10, 40, 30, 16, 12, 28].forEach((w, i) => checklist.getRangeByIndexes(0, i, releaseRows.length + 3, 1).format.columnWidth = w);
checklist.freezePanes.freezeRows(3);

// COVERAGE GUIDE
titleBand(guide, "A1:H1", "Testing Coverage Guide", "Recommended execution order, test data, and evidence standards for a practical SHRISH release cycle.");
sectionHeader(guide, "A3:H3", "Recommended execution sequence");
const phases = [
  ["Phase 1", "Release gates", "20-30 min", "REL P0, config, deploy, secrets, webhook, functions/rules", "Stop immediately on a P0 failure"],
  ["Phase 2", "Core business regression", "2-3 hours", "Shop, cart, payment rules, shipping, tax, accounts, admin", "Use development and Stripe test mode"],
  ["Phase 3", "Cross-device and accessibility", "1-2 hours", "Required Device Matrix rows, keyboard, zoom, mobile safe areas", "Capture screenshots for every P0 device"],
  ["Phase 4", "SEO, performance, and content", "45-90 min", "SEO, links, structured data, console, cache, analytics", "Record validator/crawl output"],
  ["Phase 5", "Production smoke", "10-15 min", "Home, shop, cart, checkout-rule display, account, legal pages", "Do not place an unapproved live charge"],
];
guide.getRange("A4:E4").values = [["Phase", "Focus", "Typical time", "Scope", "Rule"]];
headerStyle(guide.getRange("A4:E4"));
guide.getRange("A5:E9").values = phases;
bodyStyle(guide.getRange("A5:E9"));

sectionHeader(guide, "A11:H11", "Required test data");
guide.getRange("A12:D12").values = [["Data", "Recommended setup", "Purpose", "Cleanup"]];
headerStyle(guide.getRange("A12:D12"));
const dataRows = [
  ["Customer", "Unique QA email alias, valid US phone, non-real name prefixed QA", "Account, order claim, email, profile", "Delete only if no retained test orders"],
  ["Products", "One mango, one veg pickle, one non-veg pickle, one podi, one unavailable product", "Cart rules, filters, images, notify", "Restore availability/order after test"],
  ["Stripe", "Official Stripe test cards for success, decline, and 3DS", "Payment outcomes and webhook", "Keep in test mode; never store card data"],
  ["Shipping", "Valid Virginia address plus one out-of-state US address", "Places, tax, shipping fee", "Do not use sensitive personal address in evidence"],
  ["Promos", "Percent, fixed, free shipping, expired, minimum, one-use", "Promo enforcement", "Disable/delete QA promos after test"],
  ["Admin orders", "Manual orders clearly labeled QA", "Fulfill, no-show, cancel, reset, print, accounting", "Cancel/archive after regression"],
];
guide.getRange("A13:D18").values = dataRows;
bodyStyle(guide.getRange("A13:D18"));

sectionHeader(guide, "A20:H20", "Evidence standard");
guide.getRange("A21:H25").values = [
  ["Pass", "Record test date, tester, environment, and concise evidence for P0/P1 cases.", "", "", "", "", "", ""],
  ["Fail", "Capture full-screen screenshot, exact URL, device/browser, order number, steps, actual result, console/network evidence.", "", "", "", "", "", ""],
  ["Payment", "Record Stripe test session/payment ID and order number. Never paste secret keys or full card data.", "", "", "", "", "", ""],
  ["Admin", "Use before/after screenshots and identify the exact test product/order changed.", "", "", "", "", "", ""],
  ["Production", "Record deployment URL/commit and keep production smoke read-only unless a specific live action is approved.", "", "", "", "", "", ""],
];
for (let r = 21; r <= 25; r++) guide.mergeCells(`B${r}:H${r}`);
guide.getRange("A21:H25").format = { fill: C.cream, font: { color: C.dark, size: 10 }, wrapText: true, rowHeight: 32, borders: { preset: "all", style: "thin", color: C.line } };
guide.getRange("A21:A25").format = { fill: C.dark, font: { color: C.gold2, bold: true }, borders: { preset: "all", style: "thin", color: C.gold } };

sectionHeader(guide, "A27:H27", "Reference links");
guide.getRange("A28:B33").values = [
  ["Development site", "https://dev.shrish.co/"],
  ["Production site", "https://www.shrish.co/"],
  ["Stripe test cards", "https://docs.stripe.com/testing"],
  ["Google Places JavaScript", "https://developers.google.com/maps/documentation/javascript/place-autocomplete-overview"],
  ["Google Rich Results", "https://search.google.com/test/rich-results"],
  ["PageSpeed Insights", "https://pagespeed.web.dev/"],
];
guide.getRange("A28:A33").format = { fill: C.dark, font: { color: C.gold2, bold: true }, borders: { preset: "all", style: "thin", color: C.gold } };
guide.getRange("B28:B33").format = { fill: C.cream, font: { color: C.blue, underline: true }, borders: { preset: "all", style: "thin", color: C.line } };

guide.getRange("A:A").format.columnWidth = 18;
guide.getRange("B:B").format.columnWidth = 34;
guide.getRange("C:C").format.columnWidth = 20;
guide.getRange("D:E").format.columnWidth = 38;
guide.getRange("F:H").format.columnWidth = 16;
guide.freezePanes.freezeRows(2);

// Global page polish.
for (const sheet of [start, tests, dashboard, devices, images, defects, checklist, guide]) {
  sheet.showGridlines = false;
}

await fs.mkdir(PREVIEW_DIR, { recursive: true });
const previewSpecs = [
  ["Start Here", "A1:H28", "start-here.png", 0.9],
  ["Test Cases", "A1:P18", "test-cases.png", 0.55],
  ["Release Dashboard", `A1:N${Math.min(30, 16 + areas.length)}`, "dashboard.png", 0.8],
  ["Device Matrix", "A1:J15", "device-matrix.png", 0.7],
  ["Image Audit", "A1:K16", "image-audit.png", 0.62],
  ["Defect Log", "A1:O14", "defect-log.png", 0.55],
  ["Release Checklist", "A1:I23", "release-checklist.png", 0.68],
  ["Coverage Guide", "A1:H33", "coverage-guide.png", 0.72],
];
for (const [sheetName, range, filename, scale] of previewSpecs) {
  const rendered = await wb.render({ sheetName, range, scale, format: "png" });
  const previewBytes = new Uint8Array(await rendered.arrayBuffer());
  await fs.writeFile(path.join(PREVIEW_DIR, filename), previewBytes);
}

const inspectSummary = await wb.inspect({
  kind: "region",
  sheetId: tests.id,
  range: "A1:P8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 16,
  maxChars: 12000,
});
await fs.writeFile(path.join(OUTPUT_DIR, "inspection.txt"), String(inspectSummary), "utf8");

const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(OUTPUT_FILE);

console.log(JSON.stringify({ output: OUTPUT_FILE, previews: PREVIEW_DIR, testCases: testCases.length, areas: areas.length }, null, 2));
