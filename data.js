// ============================================================
//  SHRISH LLC — Shared Data Store
//  Edit this file to update products, prices, and availability
// ============================================================

const SHRISH_DATA = {
  // PICKUP LOCATIONS
  locations: [
    { id: "shortpump", label: "Short Pump, VA" },
    { id: "chesterfield", label: "Chesterfield, VA" }
  ],

  // MANGO PRODUCTS — set available: false to hide from order form
  products: [
    { id: "alphonso",      name: "Alphonso (Hapus)",    price: "$45 / box", unit: "per box (~2.5 kg)", available: true,  description: "The king of mangoes — intensely sweet, saffron-yellow, zero fibre. From Ratnagiri.", emoji: "🥭", tag: "Most Popular" },
    { id: "kesar",         name: "Kesar",               price: "$40 / box", unit: "per box (~3 kg)",   available: true,  description: "Saffron-hued, honey-sweet with rich aroma. Gujarat's pride.", emoji: "🥭", tag: "Sweet & Aromatic" },
    { id: "dasheri",       name: "Dasheri",             price: "$38 / box", unit: "per box (~3 kg)",   available: false, description: "Long, greenish-yellow with a fiberless, syrupy pulp. From UP.", emoji: "🥭", tag: "" },
    { id: "langra",        name: "Langra",              price: "$38 / box", unit: "per box (~3 kg)",   available: false, description: "Stays green even when ripe. Tangy-sweet and incredibly juicy.", emoji: "🥭", tag: "" },
    { id: "totapuri",      name: "Totapuri",            price: "$35 / box", unit: "per box (~3 kg)",   available: false, description: "Distinctive beak-shaped tip. Mild sweetness with a hint of tartness.", emoji: "🥭", tag: "" },
    { id: "banganapalli",  name: "Banganapalli (Safeda)",price: "$37 / box", unit: "per box (~3 kg)", available: false, description: "Large, golden-yellow, tender pulp with sweet mild flavour.", emoji: "🥭", tag: "" },
    { id: "malgova",       name: "Malgova",             price: "$40 / box", unit: "per box (~2 kg)",   available: false, description: "Huge, round South Indian variety with a rich buttery sweetness.", emoji: "🥭", tag: "" },
    { id: "neelam",        name: "Neelam",              price: "$36 / box", unit: "per box (~3 kg)",   available: false, description: "Small, oval, intensely fragrant. One of the last varieties of the season.", emoji: "🥭", tag: "" },
    { id: "imam_pasand",   name: "Imam Pasand",         price: "$42 / box", unit: "per box (~2.5 kg)", available: false, description: "The 'Mango of the King' — creamy, fiberless, melt-in-mouth texture.", emoji: "🥭", tag: "Premium" },
    { id: "raspuri",       name: "Raspuri",             price: "$36 / box", unit: "per box (~3 kg)",   available: false, description: "Karnataka's gem — juicy, reddish-orange pulp with a sweet-tart balance.", emoji: "🥭", tag: "" }
  ],

  // ORDER FORM CONFIG
  orderForm: {
    duplicateCheckField: "phone", // field used to detect duplicate orders
    confirmationMessage: "🥭 Thank you! Your order has been placed. We'll contact you to confirm the pickup details. Payment is collected at pickup."
  }
};

// Make available globally
window.SHRISH_DATA = SHRISH_DATA;
