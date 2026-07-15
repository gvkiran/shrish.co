// ============================================================
//  SHRISH LLC - Shared Data Store  v2.0
//  available: false  -> Not Available (shown in shop, blocked in order form)
//  displayOnly: true -> Shown in shop catalog, never orderable
//  Putharekulu & Jelly & Snacks items can be displayOnly until ready to sell
// ============================================================

const SHRISH_MAJOR_ALLERGEN_NOTICE = "Allergen notice: Products may contain or be prepared with peanut/groundnut oil and other major allergens, including milk, egg, fish, crustacean shellfish, tree nuts, peanuts, wheat, soy, and sesame. If you have food allergies, sensitivities, pregnancy-related concerns, or medical dietary restrictions, review ingredients and contact us before ordering.";
const SHRISH_SPICE_NOTICE = "Spice caution: Many pickles, podi, and specialty items are spicy or very spicy. Start with a small portion and stop eating if you notice discomfort or any reaction.";
const SHRISH_PICKLE_PODI_SHELF_LIFE_DISPLAY = "Best taste: 30-45 days. Refrigerate after opening, use a clean dry spoon, keep airtight, and follow the package Best Before date as final.";
const SHRISH_PICKLE_PODI_STORAGE_NOTE = "Refrigerate after opening. Use a clean, dry spoon, keep the container tightly closed, and consume within 30-45 days for best taste. Follow the package Best Before date and storage instructions as final.";
const SHRISH_PICKLE_PODI_FOOD_SAFETY_NOTE = "Ingredients, spice level, oil coverage, and shelf life may vary by supplier batch. Contact us before ordering if you have allergies or ingredient concerns.";
const SHRISH_PRODUCT_IMAGE_DISCLAIMER = "Product images are for illustration only. Actual product, packaging, label, color, texture, and batch details may vary.";
const SHRISH_LOGO_PRODUCT_IMAGE = "images/brand/logo-small.png";

const SHRISH_DATA = {

  locations: [
    { id: "shortpump",    label: "Short Pump, VA" },
    { id: "chesterfield", label: "Chesterfield, VA" },
    { id: "mechanicsville", label: "Mechanicsville, VA" }
  ],

  categories: [
    { id: "all",         label: "All Products" },
    { id: "mangoes",     label: "Fruits/Mangoes" },
    { id: "sweets",      label: "Sweets" },
    { id: "snacks",      label: "Snacks" },
    { id: "picklespodi", label: "Pickles & Podi" }
  ],

  products: [

    // ═══════════════════════════════════════════
    //  MANGOES
    // ═══════════════════════════════════════════
    {
      id: "alphonso", category: "mangoes",
      name: "Alphonso (Hapus)", localName: "हापुस", origin: "Ratnagiri, Maharashtra",
      price: "$56", unit: "per box (~3kgs) (9 to 12)",
      available: true, displayOnly: false, tag: "Most Popular",
      image: "images/products/mangoes/img_alphonso.jpeg",
      description: "The undisputed King of Mangoes. Intensely sweet, saffron-yellow flesh with zero fibre and an intoxicating aroma. Sourced directly from Ratnagiri - the only region that produces the true Hapus. Limited seasonal availability.",
      season: "May - July", taste: "Sweet  -  Rich  -  Zero Fibre",
      bestFor: "Eating fresh  -  Aamras  -  Lassi  -  Shrikhand"
    },
    {
      id: "kesar", category: "mangoes",
      name: "Kesar", localName: "કેસર", origin: "Junagadh, Gujarat",
      price: "$55", unit: "per box (~3kgs) (9 to 12)",
      available: true, displayOnly: false, tag: "Sweet & Aromatic",
      image: "images/products/mangoes/img_kesar.jpeg",
      description: "Gujarat's pride and the 'Queen of Mangoes'. Named for its saffron-coloured pulp, Kesar delivers a honey-sweet richness with a floral aroma. Round, medium-sized with nearly fiberless flesh. A household favourite across India.",
      season: "May - June", taste: "Honey-Sweet  -  Floral  -  Aromatic",
      bestFor: "Lassi  -  Ice cream  -  Milkshakes  -  Eating fresh"
    },
    {
      id: "banganapalli", category: "mangoes",
      name: "Banganapalli (Safeda)", localName: "బంగినపల్లి", origin: "Andhra Pradesh",
      price: "$56", unit: "per box (~4kgs) (7 to 12)",
      available: true, displayOnly: false, tag: "",
      image: "images/products/mangoes/img_banganapalli_2026_display.jpg",
      gallery: [
        "images/products/mangoes/img_banganapalli_2026_display.jpg",
        "images/products/mangoes/img_banganapalli_2026_1.jpg",
        "images/products/mangoes/img_banganapalli_2026_2.jpg",
        "images/products/mangoes/img_banganapalli.jpg"
      ],
      description: "A large, golden-yellow beauty from Andhra Pradesh with a GI tag. Tender, fiberless flesh with a mild, sweet flavour and thin skin. One of the most widely consumed mangoes across South India - perfect for families who prefer a mild, non-overpowering sweetness.",
      season: "April - June", taste: "Mild Sweet  -  Tender  -  Fiberless",
      bestFor: "Eating fresh  -  Juices  -  Pickles"
    },
    {
      id: "langra", category: "mangoes",
      name: "Langra", localName: "लंगड़ा", origin: "Varanasi, Uttar Pradesh",
      price: "$55", unit: "per box (~3kgs) (9 to 12)",
      available: false, displayOnly: false, tag: "",
      image: "images/products/mangoes/img_langra.jpg",
      description: "Langra stays green even when fully ripe - don't let the colour fool you! Inside is a tangy-sweet, incredibly juicy flesh with a distinctive bold character. Prized across North India and beloved by mango connoisseurs for its unique flavour profile.",
      season: "July - August", taste: "Tangy-Sweet  -  Juicy  -  Bold",
      bestFor: "Eating fresh  -  Pickles  -  Chutneys  -  Mango panna"
    },
    {
      id: "rasalu", category: "mangoes",
      name: "Rasalu", localName: "రసాలు", origin: "Andhra Pradesh & Telangana",
      price: "$55", unit: "per box (~3kgs) (8 to 12)",
      available: true, displayOnly: false, tag: "Rare & Seasonal",
      image: "images/products/mangoes/img_rasalu.jpeg",
      description: "A rare South Indian gem - small, round, deeply sweet with an almost candy-like richness. Rasalu is incredibly juicy with thin fibre and a melt-in-mouth texture. Very seasonal and hard to find outside India. When available, it sells out fast!",
      season: "May - June", taste: "Very Sweet  -  Juicy  -  Candy-like",
      bestFor: "Eating fresh  -  Milkshakes  -  Aamras"
    },
    {
      id: "himayat", category: "mangoes",
      name: "Himayat (Imam Pasand)", localName: "హిమాయత్", origin: "Hyderabad, Telangana",
      price: "$58", unit: "per box (~4kgs) (6 to 9)",
      available: true, displayOnly: false, tag: "Premium",
      image: "images/products/mangoes/img_himayath_real.jpg",
      description: "Known as the 'Mango of the King' - Imam Pasand means 'King's favourite'. Large, oval fruit with creamy, fiberless pulp that melts in your mouth. Exceptionally sweet with a mild aroma. A prized Hyderabadi variety, incredibly rare outside Andhra Pradesh and Telangana.",
      season: "June - July", taste: "Creamy  -  Sweet  -  Fiberless  -  Melt-in-mouth",
      bestFor: "Eating fresh  -  Kulfi  -  Premium desserts"
    },
    {
      id: "payari", category: "mangoes",
      name: "Payari (Paheri)", localName: "पहेरी", origin: "Gujarat & Maharashtra",
      price: "$55", unit: "per box (~3kgs) (9 to 12)",
      available: false, displayOnly: false, tag: "",
      image: "images/products/mangoes/img_payari.jpg",
      description: "A popular summer mango known for its round shape, sweet flavour, and vibrant golden-yellow skin. Payari has rich, pulpy flesh perfect for mango pulp and traditional Gujarati recipes. A childhood favourite - its sweetness is pure and uncomplicated.",
      season: "April - June", taste: "Sweet  -  Pulpy  -  Rich",
      bestFor: "Mango pulp  -  Aamras  -  Shakes  -  Eating fresh"
    },
    {
      id: "dasheri", category: "mangoes",
      name: "Dasheri", localName: "दशहरी", origin: "Malihabad, Uttar Pradesh",
      price: "$55", unit: "per box (~3kgs) (9 to 12)",
      available: false, displayOnly: false, tag: "",
      image: "images/products/mangoes/img_dasheri.jpg",
      gallery: ["images/products/mangoes/img_dasheri.jpg", "images/products/mangoes/img_dasheri1.jpg"],
      description: "Long, greenish-yellow with a fiberless, syrupy pulp - Dasheri from Malihabad holds a GI tag and is legendary in UP. Sweet, fragrant pulp with thin skin. One of North India's most beloved varieties for desserts and eating fresh.",
      season: "June - July", taste: "Syrupy  -  Fragrant  -  Fiberless",
      bestFor: "Eating fresh  -  Shakes  -  Kulfi"
    },
    {
      id: "malgova", category: "mangoes",
      name: "Malgova", localName: "மல்கோவா", origin: "Tamil Nadu & Karnataka",
      price: "$55", unit: "per box (~3kgs) (9 to 12)",
      available: false, displayOnly: false, tag: "",
      image: "images/products/mangoes/img_malgova.jpg",
      gallery: ["images/products/mangoes/img_malgova.jpg", "images/products/mangoes/img_malgova1.jpg"],
      description: "One of the largest mango varieties - Malgova is huge, round, and packed with rich buttery sweetness. South India's most celebrated mango, often used in temples. Thick luscious pulp with low fibre makes it incredibly satisfying.",
      season: "May - July", taste: "Rich  -  Buttery  -  Sweet",
      bestFor: "Eating fresh  -  Juices  -  Temple offering"
    },
    {
      id: "neelam", category: "mangoes",
      name: "Neelam", localName: "నీలం", origin: "South India (AP, TN, Karnataka)",
      price: "$56", unit: "per box (~3kgs) (9 to 12)",
      available: false, displayOnly: false, tag: "",
      image: "images/products/mangoes/img_neelam.jpg",
      gallery: ["images/products/mangoes/img_neelam.jpg", "images/products/mangoes/img_neelam1.jpg"],
      description: "Small, oval, and intensely fragrant - Neelam is one of the last varieties of the mango season, extending the joy into August. Deep orange pulp is sweet with a mild tartness and unmistakable floral perfume.",
      season: "July - August", taste: "Sweet-Tart  -  Fragrant  -  Juicy",
      bestFor: "Eating fresh  -  Pickles  -  Late-season desserts"
    },

    //  PUTHAREKULU
    // ===========================================
    {
      id: "puth_plain_sugar", category: "putharekulu",
      name: "Putharekulu - Classic Plain (Sugar)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$6.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Classic",
      image: "images/products/putharekulu/img_puth_sugar_kaju.jpg",
      description: "The original Atreyapuram Putharekulu in its simplest, most traditional form - delicate paper-thin rice sheets layered with sugar and ghee, no dry fruits. Light, melt-in-mouth, and perfect for customers who love the classic sweet exactly as it has always been made.",
      details: "Ingredients: Rice starch sheets, sugar and ghee. Store in a cool dry place and serve fresh.",
      badges: ["Classic", "No Dry Fruit"],
      variants: [
        { id: "opt1", label: "5 count", price: "$6.99", sku: "PPLS5" },
        { id: "opt2", label: "10 count", price: "$12.99", sku: "PPLS10" }
      ]
    },
    {
      id: "puth_plain_jaggery", category: "putharekulu",
      name: "Putharekulu - Classic Plain (Jaggery)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$7.49", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Classic",
      image: "images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg",
      description: "The traditional jaggery (bellam) Putharekulu with no dry fruits - paper-thin rice sheets folded with jaggery and ghee for a deeper, warmer, more rustic sweetness. A pure, old-style version for customers who prefer jaggery over sugar.",
      details: "Ingredients: Rice starch sheets, jaggery and ghee. Richer jaggery flavour with a softer rustic sweetness. Store in a cool dry place and serve fresh.",
      badges: ["Classic", "Jaggery Sweetened", "No Dry Fruit"],
      variants: [
        { id: "opt1", label: "5 count", price: "$7.49", sku: "PPLJ5" },
        { id: "opt2", label: "10 count", price: "$13.99", sku: "PPLJ10" }
      ]
    },
    {
      id: "puth_sugar_kaju", category: "putharekulu",
      name: "Putharekulu - Sugar - Kaju Badam", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$8.49", unit: "5 count or 10 count",
      available: true, displayOnly: false, hidden: true, tag: "Best Seller",
      image: "images/products/putharekulu/img_puth_sugar_kaju.jpg",
      description: "A richer sugar-based Putharekulu made with roasted cashews and almonds layered inside paper-thin rice sheets. This is one of the easiest dry-fruit variants to gift and share, with a balanced sweetness and a fuller nutty bite.",
      details: "Ingredients: Rice starch sheets, sugar, cashews, almonds and ghee. Store in a cool dry place and serve fresh.",
      badges: ["Best Seller", "Dry Fruit Loaded"],
      variants: [
        { id: "opt1", label: "5 count", price: "$8.49", sku: "PSKB5" },
        { id: "opt2", label: "10 count", price: "$15.99", sku: "PSKB10" }
      ]
    },
    {
      id: "puth_sugar_kaju_pista", category: "putharekulu",
      name: "Putharekulu - Sugar - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$9.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Premium",
      image: "images/products/putharekulu/img_puth_sugar_kaju_pista.jpg",
      description: "Traditional Atreyapuram Putharekulu finished with sugar and a premium trio of cashews, almonds, and pistachios. It delivers the delicate paper-like layers customers expect, with an extra festive dry-fruit richness in every piece.",
      details: "Ingredients: Rice starch sheets, sugar, cashews, almonds, pistachios and ghee. A premium gifting-friendly variant.",
      badges: ["Premium Dry Fruit", "Gifting Special"],
      variants: [
        { id: "opt1", label: "5 count", price: "$9.99", sku: "PSKBP5" },
        { id: "opt2", label: "10 count", price: "$18.99", sku: "PSKBP10" }
      ]
    },
    {
      id: "puth_jaggery_kaju", category: "putharekulu",
      name: "Putharekulu - Jaggery - Kaju", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$8.49", unit: "5 count or 10 count",
      available: true, displayOnly: false, hidden: true, tag: "Rustic Sweetness",
      image: "images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg",
      description: "A jaggery-sweetened version of classic dry-fruit Putharekulu with roasted cashews folded into delicate rice starch sheets. It has a deeper, warmer sweetness than the sugar version and a more traditional village-style finish.",
      details: "Ingredients: Rice starch sheets, jaggery, cashews and ghee. Richer jaggery flavour with a softer rustic sweetness.",
      badges: ["Jaggery Sweetened", "Traditional Sweet"],
      variants: [
        { id: "opt1", label: "5 count", price: "$8.49", sku: "PJK5" },
        { id: "opt2", label: "10 count", price: "$15.99", sku: "PJK10" }
      ]
    },
    {
      id: "puth_jaggery_kaju_badam", category: "putharekulu",
      name: "Putharekulu - Jaggery - Kaju Badam", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$8.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, hidden: true, tag: "Most Requested",
      image: "images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg",
      description: "This dry-fruit Putharekulu combines the deeper sweetness of jaggery with roasted cashews and almonds for a fuller bite. It is a dependable crowd-pleaser for customers who want a traditional sweet profile without refined sugar notes.",
      details: "Ingredients: Rice starch sheets, jaggery, cashews, almonds and ghee. Balanced dry-fruit richness with a traditional jaggery finish.",
      badges: ["Most Requested", "Jaggery Sweetened"],
      variants: [
        { id: "opt1", label: "5 count", price: "$8.99", sku: "PJKB5" },
        { id: "opt2", label: "10 count", price: "$16.99", sku: "PJKB10" }
      ]
    },
    {
      id: "puth_jaggery_kaju_pista", category: "putharekulu",
      name: "Putharekulu - Jaggery - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$9.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Most Requested",
      image: "images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg",
      description: "A premium jaggery Putharekulu layered with cashews, almonds, and pistachios inside delicate rice flour sheets. It offers a richer, more indulgent dry-fruit profile with the darker sweetness and aroma customers expect from traditional jaggery sweets.",
      details: "Ingredients: Rice starch sheets, jaggery, cashews, almonds, pistachios and ghee. One of the most premium dry-fruit jaggery options in the range.",
      badges: ["Most Requested", "Premium Dry Fruit", "Jaggery Sweetened"],
      variants: [
        { id: "opt1", label: "5 count", price: "$9.99", sku: "PJKBP5" },
        { id: "opt2", label: "10 count", price: "$18.99", sku: "PJKBP10" }
      ]
    },
    {
      id: "puth_sugarfree", category: "putharekulu",
      name: "Putharekulu - Sugar (Diabetic) - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$9.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Diabetic Friendly",
      image: "images/products/putharekulu/img_puth_sugarfree.jpg",
      description: "Crafted for health-conscious customers, this dry-fruit Putharekulu uses a diabetic-friendly sweetener profile while keeping the classic paper-thin texture and generous mix of cashews, almonds, and pistachios. It is designed to deliver the traditional experience with a lighter sweetness profile.",
      details: "Ingredients: Rice starch sheets, diabetic-friendly sweetener, cashews, almonds, pistachios and ghee. Intended for customers who prefer a lower-sugar-style option.",
      badges: ["Diabetic Friendly", "Premium Dry Fruit"],
      variants: [
        { id: "opt1", label: "5 count", price: "$9.99", sku: "PSDKBP5" },
        { id: "opt2", label: "10 count", price: "$18.99", sku: "PSDKBP10" }
      ]
    },
    {
      id: "puth_dates_kaju_badam_pista", category: "putharekulu",
      name: "Putharekulu - Dates - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$11.49", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Natural Sweetness",
      image: "images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg",
      description: "An exotic dry-fruit Putharekulu that combines dates with cashews, almonds, and pistachios for a naturally deeper sweetness and chewy, rich finish. It is a premium gifting option for customers who enjoy fruit-based sweetness with traditional Atreyapuram texture.",
      details: "Ingredients: Rice starch sheets, dates, jaggery, cashews, almonds, pistachios and ghee. Rich and naturally sweet with a dense dry-fruit profile.",
      badges: ["Exotic Special", "Natural Sweetness"],
      variants: [
        { id: "opt1", label: "5 count", price: "$11.49", sku: "PDKBP5" },
        { id: "opt2", label: "10 count", price: "$21.99", sku: "PDKBP10" }
      ]
    },
    {
      id: "puth_organic_palm_kaju_badam_pista", category: "putharekulu",
      name: "Putharekulu - Organic Palm Jaggery - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$11.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Premium Choice",
      image: "images/products/putharekulu/img_puth_jaggery_kaju_pista.jpg",
      description: "A premium exotic Putharekulu made with organic palm jaggery and a rich blend of cashews, almonds, and pistachios. It offers the deepest caramel-like sweetness in the range, with luxurious dry-fruit texture layered inside the signature paper-thin sheets.",
      details: "Ingredients: Rice starch sheets, organic palm jaggery, cashews, almonds, pistachios and ghee. Premium rich flavour with a deeper palm-jaggery finish.",
      badges: ["Premium Choice", "Organic Palm Jaggery", "Exotic Special"],
      variants: [
        { id: "opt1", label: "5 count", price: "$11.99", sku: "POPJKBP5" },
        { id: "opt2", label: "10 count", price: "$22.99", sku: "POPJKBP10" }
      ]
    },
    {
      id: "puth_samosa_sugar_dryfruit", category: "putharekulu",
      name: "Samosa Putharekulu - Sugar (Dry Fruit)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$9.49", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "New Shape",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "A modern twist on the classic Atreyapuram Putharekulu, folded into a crisp samosa shape and layered with sugar and a rich mix of cashews, almonds, and pistachios. The signature paper-thin rice sheets stay delicate while the folded shape makes it easier to hold, gift, and share.",
      details: "Ingredients: Rice starch sheets, sugar, cashews, almonds, pistachios and ghee. Store in a cool dry place and serve fresh.",
      badges: ["New Shape", "Dry Fruit Loaded", "Gifting Special"],
      variants: [
        { id: "opt1", label: "5 count", price: "$9.49", sku: "PSAMS5" },
        { id: "opt2", label: "10 count", price: "$18.99", sku: "PSAMS10" }
      ]
    },
    {
      id: "puth_samosa_jaggery_dryfruit", category: "putharekulu",
      name: "Samosa Putharekulu - Jaggery (Dry Fruit)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$9.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "New Shape",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "The samosa-folded Putharekulu made with jaggery instead of sugar for a deeper, warmer sweetness. Delicate rice sheets are folded around roasted cashews, almonds, and pistachios, giving a traditional village-style finish in a fun, easy-to-share shape.",
      details: "Ingredients: Rice starch sheets, jaggery, cashews, almonds, pistachios and ghee. Richer jaggery flavour with a rustic sweetness.",
      badges: ["New Shape", "Jaggery Sweetened", "Premium Dry Fruit"],
      variants: [
        { id: "opt1", label: "5 count", price: "$9.99", sku: "PSAMJ5" },
        { id: "opt2", label: "10 count", price: "$19.99", sku: "PSAMJ10" }
      ]
    },

    //  Mango Jelly  & SNACKS
    // ===========================================
    {
      id: "mango_jelly_sugar", category: "jellysnacks",
      name: "Mango Jelly - Sugar (Mamidi Thandra)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$7.49", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Best Seller",
      image: "images/products/jellysnacks/img_mango_jelly.webp",
      description: "A year-round bestseller made from ripe mango pulp slowly dried into soft fruit leather sheets. This classic Mamidi Thandra has a bright mango flavour, chewy bite, and balanced sweetness that makes it an easy favourite for both gifting and snacking.",
      details: "Ingredients: Mango pulp and sugar. Store sealed in a cool dry place. Best enjoyed fresh after opening.",
      badges: ["Best Seller", "Year Round"],
      variants: [
        { id: "opt1", label: "250g", price: "$7.49", sku: "MJS250" },
        { id: "opt2", label: "500g", price: "$14.99", sku: "MJS500" }
      ]
    },
    {
      id: "mango_jelly_jaggery", category: "jellysnacks",
      name: "Mango Jelly - Jaggery (Mamidi Thandra)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$7.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Seasonal - Limited",
      image: "images/products/jellysnacks/img_mango_jelly.webp",
      description: "A seasonal jaggery-based Mamidi Thandra with a deeper colour and warmer sweetness than the sugar version. It keeps the same chewy mango-fruit texture while adding a richer, more traditional finish that serious mango-jelly lovers usually look for first.",
      details: "Ingredients: Mango pulp and jaggery. Seasonal and limited compared with the regular sugar variety.",
      badges: ["Seasonal", "Very Limited", "Most Requested"],
      variants: [
        { id: "opt1", label: "250g", price: "$7.99", sku: "MJJ250" },
        { id: "opt2", label: "500g", price: "$15.99", sku: "MJJ500" }
      ]
    },
    {
      id: "palm_jelly", category: "jellysnacks",
      name: "Palm Fruit Jelly (Thati Thandra)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$16.99", unit: "500g",
      available: true, displayOnly: false, tag: "Seasonal - Unique",
      image: "images/products/jellysnacks/img_palm_jelly.webp",
      description: "A distinctive seasonal Thati Thandra made from palm fruit pulp with a richer, earthier flavour than mango jelly. It is softer, darker, and more rustic in character, making it a niche favourite for customers who want a more traditional Andhra-style fruit sweet.",
      details: "Ingredients: Palm fruit pulp and palm jaggery. Naturally more rustic in taste than mango jelly and available seasonally.",
      badges: ["Seasonal", "Rare Delicacy", "Naturally Bitter"],
      variants: [
        { id: "opt1", label: "500g", price: "$16.99", sku: "PFJ500" }
      ]
    },

    //  SWEETS  (Kaja & Laddus)
    // ===========================================
    {
      id: "sweets-madatha-kaja", category: "sweets",
      name: "Madatha Kaja", localName: "",
      origin: "Tapeswaram, Godavari - Andhra Pradesh",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Godavari Special",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "The famous Tapeswaram Madatha Kaja from the Godavari region - deep-fried pastry folded into many delicate layers and soaked in sugar syrup. Crisp on the outside, soft and juicy inside, with a light cardamom aroma. A classic gifting and festival sweet.",
      details: "Ingredients: Maida (refined wheat flour), sugar, ghee, cardamom and a pinch of baking soda. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Godavari Special", "Tapeswaram Classic", "Festive Sweet"],
      variants: [
        { id: "opt1", label: "250g", price: "$10.99", sku: "SW-MADKAJA-250" },
        { id: "opt2", label: "500g", price: "$19.99", sku: "SW-MADKAJA-500" }
      ]
    },
    {
      id: "sweets-gottam-kaja", category: "sweets",
      name: "Gottam Kaja", localName: "",
      origin: "Kakinada, Godavari - Andhra Pradesh",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Godavari Special",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Kakinada's signature tube-shaped Kaja, a Godavari delicacy loved for its juicy syrup-soaked centre and crisp outer bite. A wonderful balance of sweet, fluffy, and crunchy in every hollow piece.",
      details: "Ingredients: Maida (refined wheat flour), sugar, ghee and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Godavari Special", "Kakinada Classic", "Festive Sweet"],
      variants: [
        { id: "opt1", label: "250g", price: "$10.99", sku: "SW-GOTKAJA-250" },
        { id: "opt2", label: "500g", price: "$19.99", sku: "SW-GOTKAJA-500" }
      ]
    },
    {
      id: "sweets-bellam-gavvalu", category: "sweets",
      name: "Bellam Gavvalu", localName: "",
      origin: "Andhra Pradesh",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Traditional",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Crisp little shell-shaped fritters coated in a glossy jaggery syrup. A traditional Andhra festival sweet with a satisfying crunch and warm, rustic jaggery sweetness - a Sankranthi and Diwali favourite.",
      details: "Ingredients: Maida (refined wheat flour), jaggery, ghee and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Traditional", "Jaggery Sweetened", "Festive Sweet"],
      variants: [
        { id: "opt1", label: "250g", price: "$9.99", sku: "SW-BGAVVALU-250" },
        { id: "opt2", label: "500g", price: "$17.99", sku: "SW-BGAVVALU-500" }
      ]
    },
    {
      id: "sweets-rava-laddu", category: "sweets",
      name: "Rava Laddu", localName: "",
      origin: "Andhra Pradesh",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Everyday Favourite",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Classic semolina laddus roasted in ghee and bound with sugar syrup, studded with cashews and a hint of cardamom. Soft, melt-in-mouth, and always a crowd-pleaser for festivals and everyday treats.",
      details: "Ingredients: Rava (semolina), sugar, ghee, cashews and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Everyday Favourite", "Ghee Roasted", "Festive Sweet"],
      variants: [
        { id: "opt1", label: "250g", price: "$10.99", sku: "SW-RAVALAD-250" },
        { id: "opt2", label: "500g", price: "$19.99", sku: "SW-RAVALAD-500" }
      ]
    },
    {
      id: "sweets-sunnundalu", category: "sweets",
      name: "Sunnundalu (Urad Dal Laddu)", localName: "",
      origin: "Andhra Pradesh",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Protein Rich",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "A wholesome traditional Andhra laddu made from roasted urad dal ground fine and bound with ghee and jaggery or sugar. Nutty, protein-rich, and deeply comforting - a homestyle sweet often made for new mothers and festivals.",
      details: "Ingredients: Roasted urad dal (minapa pappu), jaggery or sugar, ghee and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Protein Rich", "Traditional", "Ghee Roasted"],
      variants: [
        { id: "opt1", label: "250g", price: "$9.99", sku: "SW-SUNNUND-250" },
        { id: "opt2", label: "500g", price: "$18.99", sku: "SW-SUNNUND-500" }
      ]
    },
    {
      id: "sweets-tokkudu-laddu", category: "sweets",
      name: "Tokkudu Laddu (Bandar Laddu)", localName: "",
      origin: "Machilipatnam (Bandar), Andhra Pradesh",
      price: "$12.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Regional Special",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "The famous Bandar Laddu from Machilipatnam - crisp besan boondi that is ground and pounded (tokkudu) with sugar syrup and ghee into a stunningly smooth, melt-in-mouth laddu. A prized Andhra sweet with a rich, creamy texture.",
      details: "Ingredients: Besan (gram flour), sugar, ghee, cashews and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Regional Special", "Melt In Mouth", "Festive Sweet"],
      variants: [
        { id: "opt1", label: "250g", price: "$12.99", sku: "SW-TOKKUDU-250" },
        { id: "opt2", label: "500g", price: "$23.99", sku: "SW-TOKKUDU-500" }
      ]
    },
    {
      id: "sweets-flaxseed-laddu", category: "sweets",
      name: "Flaxseed Laddu (Avise Laddu)", localName: "",
      origin: "Andhra Pradesh",
      price: "$11.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Healthy Choice",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "A nourishing laddu made from roasted flaxseeds bound with jaggery and a touch of ghee. Earthy, lightly sweet, and rich in fibre and omega-3 - a guilt-free treat for health-conscious customers.",
      details: "Ingredients: Roasted flaxseeds (avise ginjalu), jaggery, ghee and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Healthy Choice", "Fibre Rich", "Jaggery Sweetened"],
      variants: [
        { id: "opt1", label: "250g", price: "$11.99", sku: "SW-FLAXLAD-250" },
        { id: "opt2", label: "500g", price: "$21.99", sku: "SW-FLAXLAD-500" }
      ]
    },
    {
      id: "sweets-ragi-laddu", category: "sweets",
      name: "Ragi Laddu (Finger Millet Laddu)", localName: "",
      origin: "Andhra Pradesh",
      price: "$11.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Healthy Choice",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "A wholesome millet laddu made with roasted ragi flour, jaggery, ghee, and nuts. Naturally rich in iron and calcium with a warm, malty sweetness - a nutritious sweet the whole family can enjoy.",
      details: "Ingredients: Ragi (finger millet) flour, jaggery, ghee, cashews and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Healthy Choice", "Millet Based", "Jaggery Sweetened"],
      variants: [
        { id: "opt1", label: "250g", price: "$11.99", sku: "SW-RAGILAD-250" },
        { id: "opt2", label: "500g", price: "$21.99", sku: "SW-RAGILAD-500" }
      ]
    },
    {
      id: "sweets-kajji-kayalu", category: "sweets",
      name: "Kajji Kayalu (Kobbari)", localName: "",
      origin: "Andhra Pradesh",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Traditional",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Crisp half-moon pastries stuffed with a sweet coconut, sugar, and cardamom filling, then deep-fried to a golden crunch. A beloved Andhra festival sweet with a delicate flaky shell and fragrant coconut centre.",
      details: "Ingredients: Maida (refined wheat flour), dry coconut, sugar, roasted gram, ghee and cardamom. Store sealed in a cool dry place and enjoy fresh.",
      badges: ["Traditional", "Coconut Filled", "Festive Sweet"],
      variants: [
        { id: "opt1", label: "250g", price: "$10.99", sku: "SW-KAJJIK-250" },
        { id: "opt2", label: "500g", price: "$19.99", sku: "SW-KAJJIK-500" }
      ]
    },

    //  SNACKS  (Hot / Savoury)
    // ===========================================
    {
      id: "snacks-ragi-murukulu", category: "snacks",
      name: "Ragi Murukulu", localName: "",
      origin: "Andhra Pradesh",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Crunchy Snack",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Crispy spiral murukulu made with nutritious ragi (finger millet) and rice flour, seasoned with cumin and a gentle spice. A wholesome, crunchy tea-time snack with an earthy millet flavour.",
      details: "Ingredients: Ragi (finger millet) flour, rice flour, chana dal, cumin, sesame, salt and oil. Store airtight in a cool dry place to keep crisp.",
      badges: ["Crunchy Snack", "Millet Based", "Tea Time"],
      variants: [
        { id: "opt1", label: "250g", price: "$9.99", sku: "SN-RAGIMUR-250" },
        { id: "opt2", label: "500g", price: "$17.99", sku: "SN-RAGIMUR-500" }
      ]
    },
    {
      id: "snacks-ribbon-pakodi", category: "snacks",
      name: "Ribbon Pakodi", localName: "",
      origin: "Andhra Pradesh",
      price: "$8.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Crunchy Snack",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Flat, ribbon-shaped deep-fried snack made from gram flour and rice flour with a mild spice and garlic note. Light, crisp, and moreish - a classic South Indian festival and tea-time savoury.",
      details: "Ingredients: Besan (gram flour), rice flour, chilli powder, garlic, salt, sesame and oil. Store airtight in a cool dry place to keep crisp.",
      badges: ["Crunchy Snack", "Festive Savoury", "Tea Time"],
      variants: [
        { id: "opt1", label: "250g", price: "$8.99", sku: "SN-RIBBON-250" },
        { id: "opt2", label: "500g", price: "$15.99", sku: "SN-RIBBON-500" }
      ]
    },
    {
      id: "snacks-chekkalu", category: "snacks",
      name: "Chekkalu (Rice Crackers)", localName: "",
      origin: "Andhra Pradesh",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Crunchy Snack",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Crisp, disc-shaped Andhra rice crackers studded with chana dal, curry leaves, and cumin for a spicy, savoury crunch. A traditional Sankranthi snack that pairs perfectly with hot tea or coffee.",
      details: "Ingredients: Rice flour, chana dal, red chilli, curry leaves, cumin, sesame, salt and oil. Store airtight in a cool dry place to keep crisp.",
      badges: ["Crunchy Snack", "Andhra Style", "Tea Time"],
      variants: [
        { id: "opt1", label: "250g", price: "$9.99", sku: "SN-CHEKKALU-250" },
        { id: "opt2", label: "500g", price: "$17.99", sku: "SN-CHEKKALU-500" }
      ]
    },
    {
      id: "snacks-kara-pusa", category: "snacks",
      name: "Kara Pusa (Kara Sev)", localName: "",
      origin: "Andhra Pradesh",
      price: "$7.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Crunchy Snack",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Crunchy, spicy sev made from gram flour and rice flour seasoned with chilli, cumin, and a hint of hing. A crisp, savoury nibble on its own or a perfect topping for chaat and mixtures.",
      details: "Ingredients: Besan (gram flour), rice flour, chilli powder, cumin, hing, salt and oil. Store airtight in a cool dry place to keep crisp.",
      badges: ["Crunchy Snack", "Spicy", "Tea Time"],
      variants: [
        { id: "opt1", label: "250g", price: "$7.99", sku: "SN-KARAPUSA-250" },
        { id: "opt2", label: "500g", price: "$13.99", sku: "SN-KARAPUSA-500" }
      ]
    },

    // PICKLES & PODI
    // ===========================================
    {
      id: "picklespodi-brinjal-amla-pickle", category: "picklespodi",
      name: "Brinjal Amla Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Unique brinjal and amla pickle with tangy, spicy, and earthy flavors. Good rare variety for customers who want something different.",
      ingredientsText: "Brinjal, amla, red chilli powder, mustard, fenugreek, salt, turmeric, peanut/groundnut oil, lemon",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Rare", "Tangy", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Hot rice - curd rice - chapati - dosa",
      variants: [
        { id: "pickle-brinjal-amla-250g", label: "250g", price: "$10.99", sku: "pickle-brinjal-amla-250g" },
        { id: "pickle-brinjal-amla-500g", label: "500g", price: "$19.99", sku: "pickle-brinjal-amla-500g" }
      ]
    },
    {
      id: "picklespodi-carrot-pickle", category: "picklespodi",
      name: "Carrot Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Andhra-style carrot pickle made with firm carrot pieces, chilli, mustard, fenugreek, turmeric, salt, and oil. Slightly sweet, spicy, and kid-friendly compared with very hot avakai.",
      ingredientsText: "Carrot pieces, red chilli powder, mustard powder, fenugreek, turmeric, salt, peanut/groundnut oil, lemon",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Mild Sweetness", "Family Friendly"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Curd rice - chapati - dosa - idli - upma - lemon rice",
      variants: [
        { id: "pickle-carrot-250g", label: "250g", price: "$10.99", sku: "pickle-carrot-250g" },
        { id: "pickle-carrot-500g", label: "500g", price: "$19.99", sku: "pickle-carrot-500g" }
      ]
    },
    {
      id: "picklespodi-cauliflower-pickle", category: "picklespodi",
      name: "Cauliflower Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/cauliflower-pickle-2026-1.jpg",
      gallery: ["images/products/pickles/cauliflower-pickle-2026-1.jpg", "images/products/pickles/cauliflower-pickle-2026-2.jpg", "images/products/pickles/cauliflower-pickle-2026-3.jpg"],
      description: "Andhra-style cauliflower pickle with crunchy cauliflower florets coated in red chilli, mustard, fenugreek, turmeric, salt, and oil. Tangy, spicy, and great as a rice or tiffin side.",
      ingredientsText: "Cauliflower florets, red chilli powder, mustard powder, fenugreek, turmeric, salt, peanut/groundnut oil, lemon",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Crunchy", "Spicy"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Curd rice - hot rice with ghee - dosa - idli - chapati - upma",
      variants: [
        { id: "pickle-cauliflower-250g", label: "250g", price: "$10.99", sku: "pickle-cauliflower-250g" },
        { id: "pickle-cauliflower-500g", label: "500g", price: "$20.99", sku: "pickle-cauliflower-500g" }
      ]
    },
    {
      id: "picklespodi-chintakaya-pachadi-tamarind-pickle", category: "picklespodi",
      name: "Chintakaya Pachadi / Tamarind Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Traditional tamarind-style pickle with sharp tangy flavor and South Indian spice. Excellent with rice, dal, curd rice, and breakfast items.",
      ingredientsText: "Raw tamarind, green or red chilli, mustard, fenugreek, turmeric, salt, peanut/groundnut oil, tempering spices, jaggery",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Tangy", "Traditional"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Hot",
      bestFor: "Hot rice - curd rice - dal - pesarattu - dosa",
      variants: [
        { id: "pickle-chintakaya-250g", label: "250g", price: "$10.99", sku: "pickle-chintakaya-250g" },
        { id: "pickle-chintakaya-500g", label: "500g", price: "$18.99", sku: "pickle-chintakaya-500g" }
      ]
    },
    {
      id: "picklespodi-drumstick-pickle", category: "picklespodi",
      name: "Drumstick Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/drumstick-pickle-2026-1.jpg",
      gallery: ["images/products/pickles/drumstick-pickle-2026-1.jpg", "images/products/pickles/drumstick-pickle-2026-2.jpg"],
      description: "Traditional drumstick pickle with spicy, tangy flavor. A good South Indian side for rice and dal.",
      ingredientsText: "Drumstick pieces, red chilli powder, mustard, fenugreek, lemon, salt, turmeric, peanut/groundnut oil",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Traditional", "Tangy", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Hot rice - curd rice - dal rice - chapati",
      variants: [
        { id: "pickle-drumstick-250g", label: "250g", price: "$10.99", sku: "pickle-drumstick-250g" },
        { id: "pickle-drumstick-500g", label: "500g", price: "$20.99", sku: "pickle-drumstick-500g" }
      ]
    },
    {
      id: "picklespodi-garlic-pickle", category: "picklespodi",
      name: "Garlic Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Bold garlic pickle with strong spice and deep flavor. Best for customers who love a punchy pickle with rice, dosa, or chapati.",
      ingredientsText: "Garlic cloves, red chilli powder, mustard, fenugreek, turmeric, salt, peanut/groundnut oil, lemon",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Bold Flavor", "Spicy"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Dal rice - curd rice - chapati - dosa - idli",
      variants: [
        { id: "pickle-garlic-250g", label: "250g", price: "$10.99", sku: "pickle-garlic-250g" },
        { id: "pickle-garlic-500g", label: "500g", price: "$18.99", sku: "pickle-garlic-500g" }
      ]
    },
    {
      id: "picklespodi-gongura-pickle", category: "picklespodi",
      name: "Gongura Pickle/Pachadi", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/gongura-pickle-2026-1.jpg",
      gallery: ["images/products/pickles/gongura-pickle-2026-1.jpg", "images/products/pickles/gongura-pickle-2026-2.jpg", "images/products/pickles/gongura-pickle-2026-3.jpg"],
      description: "Tangy gongura pickle with bold South Indian spice. A Telugu favorite that pairs beautifully with hot rice and ghee.",
      ingredientsText: "Gongura leaves, red chilli, garlic, mustard, fenugreek, salt, oil, tempering spices",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Telugu Favorite", "Tangy"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Hot",
      bestFor: "Hot rice with ghee - dal rice - curd rice - dosa - chapati",
      variants: [
        { id: "pickle-gongura-250g", label: "250g", price: "$10.99", sku: "pickle-gongura-250g" },
        { id: "pickle-gongura-500g", label: "500g", price: "$20.99", sku: "pickle-gongura-500g" }
      ]
    },
    {
      id: "picklespodi-karivepaku-pachadi-curry-leaf-pickle", category: "picklespodi",
      name: "Karivepaku / Curry Leaf Pachadi", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Aromatic curry leaf pickle with earthy South Indian flavor and medium spice. Good with rice, idli, dosa, and curd rice.",
      ingredientsText: "Curry leaves, red chilli, garlic, tamarind, mustard, fenugreek, salt, oil, tempering spices",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Curry Leaf", "Aromatic"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice - idli - dosa - curd rice",
      variants: [
        { id: "pickle-karivepaku-pachadi-250g", label: "250g", price: "$10.99", sku: "pickle-karivepaku-pachadi-250g" },
        { id: "pickle-karivepaku-pachadi-500g", label: "500g", price: "$18.99", sku: "pickle-karivepaku-pachadi-500g" }
      ]
    },
    {
      id: "picklespodi-kothimeera-coriander-pickle", category: "picklespodi",
      name: "Kothimeera Pachadi / Coriander Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "",
      gallery: [
      ],
      description: "Fresh coriander-style pickle with a herby, spicy, and tangy taste. A good everyday pickle for rice, dosa, idli, and chapati.",
      ingredientsText: "Fresh coriander leaves, green chilli or red chilli, garlic, tamarind, mustard, salt, peanut/groundnut oil, tempering spices, jaggery",
      storageNote: "Refrigerate after opening and use within 30 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 2-4 months. After opening: refrigerate and use within 30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Herby", "Everyday Pickle", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Idli - dosa - curd rice - chapati - upma",
      variants: [
        { id: "pickle-kothimeera-250g", label: "250g", price: "$10.99", sku: "pickle-kothimeera-250g" },
        { id: "pickle-kothimeera-500g", label: "500g", price: "$18.99", sku: "pickle-kothimeera-500g" }
      ]
    },
    {
      id: "picklespodi-mango-avakai-pickle", category: "picklespodi",
      name: "Mango Avakai Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Traditional Andhra-style raw mango avakai with mustard, red chilli, spices, and oil. Spicy, tangy, and perfect with hot rice, curd rice, dosa, idli, and chapati.",
      ingredientsText: "Raw mango pieces, mustard powder, red chilli powder, salt, turmeric, fenugreek, peanut/groundnut oil, garlic",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Best Seller", "Spicy", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Hot",
      bestFor: "Hot rice with ghee - curd rice - dosa - idli - chapati - dal rice",
      variants: [
        { id: "pickle-mango-avakai-250g", label: "250g", price: "$10.99", sku: "pickle-mango-avakai-250g" },
        { id: "pickle-mango-avakai-500g", label: "500g", price: "$20.99", sku: "pickle-mango-avakai-500g" }
      ]
    },
    {
      id: "picklespodi-mango-ginger-pickle", category: "picklespodi",
      name: "Mango Ginger Pickle / Pachadi", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "",
      gallery: [
      ],
      description: "A rare and flavorful pickle made with mango ginger. Fresh, aromatic, mildly tangy, and different from regular mango pickle.",
      ingredientsText: "Mango ginger, lemon or tamarind, green chilli or red chilli, mustard, salt, turmeric, oil",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Rare", "Limited Batch"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Curd rice - lemon rice - dosa - upma - chapati",
      variants: [
        { id: "pickle-mango-ginger-250g", label: "250g", price: "$10.99", sku: "pickle-mango-ginger-250g" },
        { id: "pickle-mango-ginger-500g", label: "500g", price: "$18.99", sku: "pickle-mango-ginger-500g" }
      ]
    },
    {
      id: "picklespodi-mango-thokku-magai-pickle", category: "picklespodi",
      name: "Mango Thokku / Magai Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Classic grated mango-style pickle with a rich spicy and tangy flavor. A strong everyday side for rice, dosa, idli, and curd rice.",
      ingredientsText: "Grated or chopped raw mango, red chilli powder, mustard, fenugreek, turmeric, salt, oil, garlic optional",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Tangy", "Everyday Pickle", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Curd rice - dosa - idli - upma - chapati - hot rice",
      variants: [
        { id: "pickle-mango-thokku-magai-250g", label: "250g", price: "$10.99", sku: "pickle-mango-thokku-magai-250g" },
        { id: "pickle-mango-thokku-magai-500g", label: "500g", price: "$18.99", sku: "pickle-mango-thokku-magai-500g" }
      ]
    },
    {
      id: "picklespodi-mixed-vegetable-pickle", category: "picklespodi",
      name: "Mixed Vegetable Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "",
      gallery: [
        "images/products/pickles/mixed-vegetable-2026-1.jpg",
        "images/products/pickles/mixed-vegetable-2026-2.jpg",
        "images/products/pickles/mixed-vegetable-2026-3.jpg"
      ],
      description: "Andhra-style mixed vegetable pickle with carrot, cauliflower, green chilli, and seasonal vegetables in a bold chilli-mustard spice mix. A colorful, crunchy side for rice and tiffins.",
      ingredientsText: "Mixed vegetables such as beans, carrot, cauliflower, green chilli, and seasonal vegetables, red chilli powder, mustard powder, fenugreek, turmeric, salt, peanut/groundnut oil, lemon",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Assorted Vegetables", "Combo Friendly"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Curd rice - hot rice - chapati - dosa - idli - upma",
      variants: [
        { id: "pickle-mixed-vegetable-250g", label: "250g", price: "$10.99", sku: "pickle-mixed-vegetable-250g" },
        { id: "pickle-mixed-vegetable-500g", label: "500g", price: "$18.99", sku: "pickle-mixed-vegetable-500g" }
      ]
    },
    {
      id: "picklespodi-pandu-mirchi-pickle", category: "picklespodi",
      name: "Pandu Mirchi Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Spicy red chilli pickle for customers who love serious heat. Strong, flavorful, and best with hot rice, dosa, idli, and curd rice.",
      ingredientsText: "Red ripe chillies, tamarind, mustard, fenugreek, salt, turmeric, peanut/groundnut oil, garlic",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Extra Spicy", "Limited Batch"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Very Hot",
      bestFor: "Hot rice with ghee - idli - dosa - pappu rice - curd rice",
      variants: [
        { id: "pickle-pandu-mirchi-250g", label: "250g", price: "$10.99", sku: "pickle-pandu-mirchi-250g" },
        { id: "pickle-pandu-mirchi-500g", label: "500g", price: "$18.99", sku: "pickle-pandu-mirchi-500g" }
      ]
    },
    {
      id: "picklespodi-tomato-pickle", category: "picklespodi",
      name: "Tomato Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "",
      gallery: [
      ],
      description: "Rich and spicy tomato pickle with a deep, tangy flavor. Great with rice, dosa, upma, idli, chapati, and curd rice.",
      ingredientsText: "Tomatoes, turmeric, red chilli powder, tamarind, mustard, fenugreek, salt, peanut/groundnut oil, garlic",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Tangy", "Everyday Pickle"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Idli - dosa - curd rice - chapati - upma - hot rice",
      variants: [
        { id: "pickle-tomato-250g", label: "250g", price: "$10.99", sku: "pickle-tomato-250g" },
        { id: "pickle-tomato-500g", label: "500g", price: "$18.99", sku: "pickle-tomato-500g" }
      ]
    },
    {
      id: "picklespodi-boneless-chicken-pickle", category: "picklespodi",
      name: "Chicken Boneless", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$14.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/chicken-pickle-2026-1.jpg",
      gallery: ["images/products/pickles/chicken-pickle-2026-1.jpg", "images/products/pickles/chicken-pickle-2026-2.jpg", "images/products/pickles/chicken-pickle-2026-3.jpg"],
      description: "Spicy Andhra-style boneless chicken pickle with bold masala and rich flavor. Best with rice, roti, dosa, and curd rice.",
      ingredientsText: "Boneless chicken, red chilli powder, ginger garlic, garam masala, salt, peanut/groundnut oil, lemon, spices",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Spicy", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa - curd rice - travel meals",
      variants: [
        { id: "pickle-chicken-boneless-250g", label: "250g", price: "$14.99", sku: "pickle-chicken-boneless-250g" },
        { id: "pickle-chicken-boneless-500g", label: "500g", price: "$26.99", sku: "pickle-chicken-boneless-500g" }
      ]
    },
    {
      id: "picklespodi-boneless-mutton-pickle", category: "picklespodi",
      name: "Mutton Boneless", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$18.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/mutton-pickle-2026-1.jpg",
      gallery: ["images/products/pickles/mutton-pickle-2026-1.jpg", "images/products/pickles/mutton-pickle-2026-2.jpg", "images/products/pickles/mutton-pickle-2026-3.jpg"],
      description: "Premium boneless mutton pickle with rich spice, deep flavor, and strong Andhra-style masala.",
      ingredientsText: "Boneless mutton, red chilli powder, ginger garlic, garam masala, salt, peanut/groundnut oil, lemon, spices",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Premium", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa - curd rice",
      variants: [
        { id: "pickle-mutton-boneless-250g", label: "250g", price: "$18.99", sku: "pickle-mutton-boneless-250g" },
        { id: "pickle-mutton-boneless-500g", label: "500g", price: "$32.99", sku: "pickle-mutton-boneless-500g" }
      ]
    },
    {
      id: "picklespodi-fish-pickle-koramenu-pickle", category: "picklespodi",
      name: "Fish Pickle / Koramenu Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$17.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Spicy fish pickle with Andhra-style masala. Premium seafood pickle for preorder customers.",
      ingredientsText: "Fish pieces, red chilli powder, ginger garlic, mustard, fenugreek, salt, peanut/groundnut oil, lemon, garam masala, spices. Fish variety may be Koramenu or Chanduva based on availability.",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Seafood", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa - curd rice",
      variants: [
        { id: "pickle-fish-koramenu-250g", label: "250g", price: "$17.99", sku: "pickle-fish-koramenu-250g" },
        { id: "pickle-fish-koramenu-500g", label: "500g", price: "$32.99", sku: "pickle-fish-koramenu-500g" }
      ]
    },
    {
      id: "picklespodi-gongura-chicken-pickle", category: "picklespodi",
      name: "Gongura Chicken", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$15.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Tangy gongura chicken pickle with spicy masala and bold Telugu flavor. A high-demand non-veg variety.",
      ingredientsText: "Chicken, gongura leaves, red chilli powder, ginger garlic, mustard, fenugreek, salt, peanut/groundnut oil, spices, garam masala, lemon",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Tangy", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa - curd rice",
      variants: [
        { id: "pickle-gongura-chicken-250g", label: "250g", price: "$15.99", sku: "pickle-gongura-chicken-250g" },
        { id: "pickle-gongura-chicken-500g", label: "500g", price: "$27.99", sku: "pickle-gongura-chicken-500g" }
      ]
    },
    {
      id: "picklespodi-gongura-mutton-pickle", category: "picklespodi",
      name: "Gongura Mutton", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$18.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Premium gongura mutton pickle with tangy gongura and rich mutton masala. Strong Telugu demand item.",
      ingredientsText: "Mutton, gongura leaves, red chilli powder, ginger garlic, mustard, fenugreek, salt, peanut/groundnut oil, spices, garam masala, lemon",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Premium", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa",
      variants: [
        { id: "pickle-gongura-mutton-250g", label: "250g", price: "$18.99", sku: "pickle-gongura-mutton-250g" },
        { id: "pickle-gongura-mutton-500g", label: "500g", price: "$32.99", sku: "pickle-gongura-mutton-500g" }
      ]
    },
    {
      id: "picklespodi-gongura-prawn-pickle", category: "picklespodi",
      name: "Prawns/Shrimp Gongura Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$18.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Premium gongura prawn pickle with tangy gongura and spicy seafood masala.",
      ingredientsText: "Prawns, gongura leaves, red chilli powder, ginger garlic, mustard, fenugreek, salt, peanut/groundnut oil, spices, garam masala, lemon",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Premium", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa",
      variants: [
        { id: "pickle-gongura-prawn-250g", label: "250g", price: "$18.99", sku: "pickle-gongura-prawn-250g" },
        { id: "pickle-gongura-prawn-500g", label: "500g", price: "$32.99", sku: "pickle-gongura-prawn-500g" }
      ]
    },
    {
      id: "picklespodi-natu-kodi-country-chicken-pickle", category: "picklespodi",
      name: "Natu Kodi/Country Chicken Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$17.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Country chicken pickle with strong traditional flavor and spicy masala. Preorder-only specialty item.",
      ingredientsText: "Country chicken, red chilli powder, ginger garlic, garam masala, salt, peanut/groundnut oil, spices",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Specialty", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa",
      variants: [
        { id: "pickle-natu-kodi-250g", label: "250g", price: "$17.99", sku: "pickle-natu-kodi-250g" },
        { id: "pickle-natu-kodi-500g", label: "500g", price: "$32.99", sku: "pickle-natu-kodi-500g" }
      ]
    },
    {
      id: "picklespodi-prawns-pickle", category: "picklespodi",
      name: "Prawns/Shrimp Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$17.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/shrimp-pickle-2026-1.jpg",
      gallery: ["images/products/pickles/shrimp-pickle-2026-1.jpg", "images/products/pickles/shrimp-pickle-2026-2.jpg"],
      description: "Spicy prawns pickle with rich seafood flavor and strong Andhra-style masala. Premium preorder item.",
      ingredientsText: "Prawns, red chilli powder, ginger garlic, mustard, fenugreek, salt, peanut/groundnut oil, lemon, garam masala",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Premium", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa - curd rice",
      variants: [
        { id: "pickle-prawns-250g", label: "250g", price: "$17.99", sku: "pickle-prawns-250g" },
        { id: "pickle-prawns-500g", label: "500g", price: "$31.99", sku: "pickle-prawns-500g" }
      ]
    },
    {
      id: "picklespodi-dhaniyalu-podi-coriander-spice-powder", category: "picklespodi",
      name: "Dhaniyalu Podi / Coriander Spice Powder", localName: "100g or 200g", origin: "Spice Powder",
      price: "$6.99", unit: "100g or 200g",
      available: true, displayOnly: false, hidden: true, preorderOnly: false, tag: "Podi",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Andhra-style dhaniyalu podi made with roasted coriander seeds, chillies, cumin, and traditional spices. Aromatic, earthy, and perfect for mixing with hot rice and ghee or sprinkling on tiffins.",
      ingredientsText: "Coriander seeds, red chillies, cumin, chana dal optional, garlic optional, curry leaves optional, salt",
      storageNote: "Use within 60-90 days after opening for best aroma. Keep airtight; refrigerate if your kitchen is humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 4-6 months. After opening: keep airtight and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Andhra Style", "Aromatic", "Easy Shipping"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice with ghee - idli - dosa - upma - curd rice - vegetable stir-fries",
      variants: [
        { id: "podi-dhaniyalu-100g", label: "100g", price: "$6.99", sku: "podi-dhaniyalu-100g" },
        { id: "podi-dhaniyalu-200g", label: "200g", price: "$12.99", sku: "podi-dhaniyalu-200g" }
      ]
    },
    {
      id: "picklespodi-drumstick-leaf-podi-munagaku-podi", category: "picklespodi",
      name: "Moringa Powder / Munagaku Podi", localName: "100g or 200g", origin: "Spice Powder",
      price: "$8.99", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/moringa-podi-2026-1.jpg",
      gallery: ["images/products/podi/moringa-podi-2026-1.jpg", "images/products/podi/moringa-podi-2026-2.jpg", "images/products/podi/moringa-podi-2026-3.jpg", "images/products/podi/moringa-podi-2026-4.jpg", "images/products/podi/moringa-podi-2026-5.jpg", "images/products/podi/moringa-podi-2026-6.jpg"],
      description: "Andhra-style moringa powder made with roasted munagaku leaves, dals, chillies, garlic, and spices. Nutty, earthy, and a wholesome option with hot rice, ghee, idli, and dosa.",
      ingredientsText: "Moringa leaves / munagaku, chana dal, red chillies, garlic optional, cumin, salt",
      storageNote: "Use within 45-60 days after opening for best aroma. Keep airtight; refrigerate if humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-4 months. After opening: keep airtight and use within 45-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Moringa Powder", "Podi", "Andhra Style", "Leaf Powder", "Wholesome"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice with ghee - idli - dosa - upma - curd rice - health-conscious meals",
      variants: [
        { id: "podi-drumstick-leaf-100g", label: "100g", price: "$8.99", sku: "podi-drumstick-leaf-100g" },
        { id: "podi-drumstick-leaf-200g", label: "200g", price: "$16.99", sku: "podi-drumstick-leaf-200g" }
      ]
    },
    {
      id: "picklespodi-idli-podi", category: "picklespodi",
      name: "Idli Podi", localName: "100g or 200g", origin: "Spice Powder",
      price: "$5.99", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/idli-podi-2026-1.jpg",
      gallery: ["images/products/podi/idli-podi-2026-1.jpg", "images/products/podi/idli-podi-2026-2.jpg"],
      description: "Classic South Indian idli karam podi. Mix with ghee or oil and serve with idli, dosa, uttapam, or hot rice.",
      ingredientsText: "Chana dal, red chillies, curry leaves optional, garlic, salt, tamarind, cumin seeds",
      storageNote: "Use within 60-90 days after opening for best aroma. Keep airtight; refrigerate if your kitchen is humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 4-6 months. After opening: keep airtight and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Breakfast Favorite", "Good Shelf Life"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Idli with ghee - dosa - uttapam - upma",
      variants: [
        { id: "podi-idli-100g", label: "100g", price: "$5.99", sku: "podi-idli-100g" },
        { id: "podi-idli-200g", label: "200g", price: "$10.99", sku: "podi-idli-200g" }
      ]
    },
    {
      id: "picklespodi-kandi-podi", category: "picklespodi",
      name: "Kandi Podi", localName: "100g or 200g", origin: "Spice Powder",
      price: "$7.49", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Traditional dal-based kandi podi with rich South Indian flavor. Best mixed with hot rice and ghee or served with breakfast items.",
      ingredientsText: "Toor dal, chana dal optional, red chillies, cumin, garlic optional, curry leaves optional, salt",
      storageNote: "Use within 60-90 days after opening for best aroma. Keep airtight; refrigerate if your kitchen is humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 4-6 months. After opening: keep airtight and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Protein Rich", "Traditional", "Good Shelf Life"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice with ghee - idli - dosa - upma",
      variants: [
        { id: "podi-kandi-100g", label: "100g", price: "$7.49", sku: "podi-kandi-100g" },
        { id: "podi-kandi-200g", label: "200g", price: "$13.99", sku: "podi-kandi-200g" }
      ]
    },
    {
      id: "picklespodi-karapu-podi-with-garlic", category: "picklespodi",
      name: "Karapu Podi with Garlic", localName: "100g or 200g", origin: "Spice Powder",
      price: "$6.99", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "Spicy garlic karam podi with bold flavor. Perfect with hot rice and ghee, idli, dosa, or as a spicy side for everyday meals.",
      ingredientsText: "Garlic cloves, red chilli powder, mustard, turmeric, salt, peanut/groundnut oil, tamarind",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Garlic", "Spicy", "Good Shelf Life"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Dal rice - curd rice - chapati - dosa - idli",
      variants: [
        { id: "podi-karapu-garlic-100g", label: "100g", price: "$6.99", sku: "podi-karapu-garlic-100g" },
        { id: "podi-karapu-garlic-200g", label: "200g", price: "$12.99", sku: "podi-karapu-garlic-200g" }
      ]
    },
    {
      id: "picklespodi-karivepaku-podi-curry-leaf-powder", category: "picklespodi",
      name: "Karivepaku Podi / Curry Leaf Powder", localName: "100g or 200g", origin: "Spice Powder",
      price: "$7.49", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/curry-leaf-podi-2026-1.jpg",
      gallery: ["images/products/podi/curry-leaf-podi-2026-1.jpg", "images/products/podi/curry-leaf-podi-2026-2.jpg"],
      description: "Aromatic curry leaf podi with traditional South Indian spices. Mix with hot rice and ghee or enjoy with idli, dosa, and upma.",
      ingredientsText: "Curry leaves, red chillies, chana dal, cumin, garlic optional, tamarind optional, salt",
      storageNote: "Use within 45-60 days after opening for best aroma. Keep airtight; refrigerate if humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-4 months. After opening: keep airtight and use within 45-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Curry Leaf", "Good Shelf Life"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice with ghee - idli - dosa - upma - curd rice",
      variants: [
        { id: "podi-karivepaku-100g", label: "100g", price: "$7.49", sku: "podi-karivepaku-100g" },
        { id: "podi-karivepaku-200g", label: "200g", price: "$13.99", sku: "podi-karivepaku-200g" }
      ]
    },
    {
      id: "picklespodi-karela-bitter-gourd-pickle", category: "picklespodi",
      name: "Karela Pickle / Kakarakaya Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$10.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/karela-pickle-2026-1.jpg",
      gallery: ["images/products/pickles/karela-pickle-2026-1.jpg", "images/products/pickles/karela-pickle-2026-2.jpg", "images/products/pickles/karela-pickle-2026-3.jpg", "images/products/pickles/karela-pickle-2026-4.jpg", "images/products/pickles/karela-pickle-2026-5.jpg", "images/products/pickles/karela-pickle-2026-6.jpg", "images/products/pickles/karela-pickle-2026-7.jpg", "images/products/pickles/karela-pickle-2026-8.jpg"],
      description: "Andhra-style bitter gourd pickle made with crisp fried karela pieces in a tangy, spicy tamarind and chilli masala. The frying and spices balance the natural bitterness, leaving a bold, appetising pickle for rice and tiffins.",
      ingredientsText: "Bitter gourd / kakarakaya, red chilli powder, tamarind, mustard, fenugreek, garlic, salt, turmeric, peanut/groundnut oil",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Tangy", "Rare"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Hot rice with ghee - curd rice - chapati - dosa",
      variants: [
        { id: "pickle-karela-250g", label: "250g", price: "$10.99", sku: "pickle-karela-250g" },
        { id: "pickle-karela-500g", label: "500g", price: "$19.99", sku: "pickle-karela-500g" }
      ]
    },
    {
      id: "picklespodi-flaxseed-podi-avise-podi", category: "picklespodi",
      name: "Flaxseed Podi / Avise Podi", localName: "100g or 200g", origin: "Spice Powder",
      price: "$7.99", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/flaxseed-podi-2026-1.jpg",
      gallery: ["images/products/podi/flaxseed-podi-2026-1.jpg", "images/products/podi/flaxseed-podi-2026-2.jpg"],
      description: "A wholesome Andhra-style flaxseed podi made with roasted avise ginjalu, dals, chillies, and garlic. Nutty, earthy, and rich in fibre and omega-3 - a healthy option mixed with hot rice and ghee or sprinkled over idli and dosa.",
      ingredientsText: "Roasted flaxseeds / avise ginjalu, chana dal, red chillies, garlic, cumin, salt",
      storageNote: "Use within 45-60 days after opening for best aroma. Keep airtight; refrigerate if humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-4 months. After opening: keep airtight and use within 45-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Healthy Choice", "Fibre Rich", "Easy Shipping"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice with ghee - idli - dosa - upma - curd rice - health-conscious meals",
      variants: [
        { id: "podi-flaxseed-100g", label: "100g", price: "$7.99", sku: "podi-flaxseed-100g" },
        { id: "podi-flaxseed-200g", label: "200g", price: "$14.99", sku: "podi-flaxseed-200g" }
      ]
    },
    {
      id: "picklespodi-kakarakaya-karam-podi-bitter-gourd", category: "picklespodi",
      name: "Kakarakaya Karam Podi / Bitter Gourd Podi", localName: "100g or 200g", origin: "Spice Powder",
      price: "$7.99", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/karela-podi-2026-1.jpg",
      gallery: ["images/products/podi/karela-podi-2026-1.jpg", "images/products/podi/karela-podi-2026-2.jpg", "images/products/podi/karela-podi-2026-3.jpg", "images/products/podi/karela-podi-2026-4.jpg", "images/products/podi/karela-podi-2026-5.jpg", "images/products/podi/karela-podi-2026-6.jpg", "images/products/podi/karela-podi-2026-7.jpg", "images/products/podi/karela-podi-2026-8.jpg"],
      description: "A specialty Andhra podi made from dried bitter gourd roasted with chillies, dals, and spices. Bold, earthy, and mildly bitter with a spicy kick - best mixed with hot rice and ghee for an appetising, wholesome meal.",
      ingredientsText: "Dried bitter gourd / kakarakaya, red chillies, chana dal, garlic, cumin, tamarind optional, salt",
      storageNote: "Use within 45-60 days after opening for best aroma. Keep airtight; refrigerate if humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-4 months. After opening: keep airtight and use within 45-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Rare", "Andhra Style", "Wholesome"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Hot rice with ghee - curd rice - idli - dosa",
      variants: [
        { id: "podi-kakarakaya-100g", label: "100g", price: "$7.99", sku: "podi-kakarakaya-100g" },
        { id: "podi-kakarakaya-200g", label: "200g", price: "$14.99", sku: "podi-kakarakaya-200g" }
      ]
    },
    {
      id: "picklespodi-sambar-powder", category: "picklespodi",
      name: "Sambar Powder / Sambar Karam", localName: "100g or 200g", origin: "Spice Powder",
      price: "$4.99", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: SHRISH_LOGO_PRODUCT_IMAGE,
      description: "A fresh, aromatic South Indian sambar powder made from roasted coriander, dals, chillies, fenugreek, and curry leaves. Adds authentic depth and warmth to sambar, rasam, and vegetable curries.",
      ingredientsText: "Coriander seeds, red chillies, chana dal, toor dal, fenugreek, cumin, curry leaves, turmeric, salt optional",
      storageNote: "Use within 60-90 days after opening for best aroma. Keep airtight; refrigerate if your kitchen is humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 4-6 months. After opening: keep airtight and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Aromatic", "Everyday Cooking", "Easy Shipping"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Sambar - rasam - vegetable curries - dal",
      variants: [
        { id: "podi-sambar-100g", label: "100g", price: "$4.99", sku: "podi-sambar-100g" },
        { id: "podi-sambar-200g", label: "200g", price: "$8.99", sku: "podi-sambar-200g" }
      ]
    }
  ],

  orderForm: {
    duplicateCheckField: "phone",
    confirmationMessage: "🥭 Thank you! Your order has been placed. Please watch for my updates on the WhatsApp group for pickup details. If you’re not part of the group yet, please join using the link below. Your confirmation shows whether payment is complete online or due at pickup."
  }
};

SHRISH_DATA.products.forEach((product) => {
  product.allergenNote = SHRISH_MAJOR_ALLERGEN_NOTICE;
  product.spiceNotice = SHRISH_SPICE_NOTICE;
  product.imageDisclaimer = SHRISH_PRODUCT_IMAGE_DISCLAIMER;
  if (product.category === "picklespodi") {
    product.storageNote = SHRISH_PICKLE_PODI_STORAGE_NOTE;
    product.shelfLifeDisplay = SHRISH_PICKLE_PODI_SHELF_LIFE_DISPLAY;
    product.foodSafetyNote = SHRISH_PICKLE_PODI_FOOD_SAFETY_NOTE;
  }
});

const SHRISH_RECOMMENDATION_TAGS = {
  alphonso: ["Sweet", "Rich", "Aromatic", "Fiberless", "Creamy", "Cut and eat", "Dessert mango", "Aamras", "Lassi", "Shrikhand", "Premium"],
  kesar: ["Honey sweet", "Floral", "Aromatic", "Fiberless", "Smooth", "Cut and eat", "Lassi", "Milkshake", "Ice cream", "Aamras", "Family favorite"],
  banganapalli: ["Mild sweet", "Balanced", "Fiberless", "Smooth", "Buttery", "Cut and eat", "Juice", "Everyday mango", "Kids friendly", "Andhra vibe"],
  langra: ["Tangy sweet", "Juicy", "Bold flavor", "Aromatic", "Fiberless", "Cut and eat", "Chutney", "Mango panna", "Pickle friendly", "North Indian favorite"],
  rasalu: ["Very sweet", "Extremely juicy", "Squeeze and eat", "Andhra vibe", "Delicate", "Low shelf life", "Candy-like", "Aamras", "Milkshake", "Juice mango"],
  himayat: ["Very sweet", "Creamy", "Fiberless", "Royal", "Premium", "Aromatic", "Melt in mouth", "Cut and eat", "Dessert mango", "Kulfi"],
  payari: ["Sweet tangy", "Juicy", "Pulpy", "Aamras", "Milkshake", "Squeeze and eat", "Delicate", "Low shelf life", "Konkan favorite", "Mango pulp"],
  dasheri: ["Very sweet", "Fragrant", "Fiberless", "Juicy", "Smooth", "Cut and eat", "Squeeze and eat", "Lassi", "Mango shake", "North Indian favorite"],
  malgova: ["Very sweet", "Buttery", "Creamy", "Fiberless", "Large fruit", "Cut and eat", "Dessert mango", "Milkshake", "Tamil Nadu favorite", "Low acidity"],
  neelam: ["Sweet tart", "Fragrant", "Juicy", "Late season", "Balanced", "Cut and eat", "Juice", "Dessert", "South Indian favorite", "Long shelf life"],

  puth_sugar_kaju: ["Sweet", "Paper sweet", "Melt in mouth", "Dry fruit", "Kaju badam", "Ghee aroma", "Crunchy nuts", "Festive", "Gifting", "Atreyapuram"],
  puth_sugar_kaju_pista: ["Sweet", "Premium dry fruit", "Paper sweet", "Melt in mouth", "Kaju badam pista", "Ghee aroma", "Festive", "Gifting", "Rich", "Atreyapuram"],
  puth_jaggery_kaju: ["Jaggery sweet", "Traditional sweet", "Paper sweet", "Melt in mouth", "Kaju", "Ghee aroma", "Rustic sweetness", "Festive", "Andhra vibe", "Atreyapuram"],
  puth_jaggery_kaju_badam: ["Jaggery sweet", "Dry fruit", "Paper sweet", "Melt in mouth", "Kaju badam", "Traditional", "Nutty", "Festive", "Gifting", "Atreyapuram"],
  puth_jaggery_kaju_pista: ["Jaggery sweet", "Premium dry fruit", "Paper sweet", "Melt in mouth", "Kaju badam pista", "Traditional", "Rich", "Festive", "Gifting", "Atreyapuram"],
  puth_sugarfree: ["Diabetic friendly", "Less sugar", "Healthy choice", "Dry fruit", "Paper sweet", "Melt in mouth", "Kaju badam pista", "Light sweetness", "Gifting", "Atreyapuram"],
  puth_dates_kaju_badam_pista: ["Natural sweet", "Dates", "Dry fruit", "Paper sweet", "Melt in mouth", "Rich", "Chewy", "Premium", "Gifting", "Atreyapuram"],
  puth_organic_palm_kaju_badam_pista: ["Palm jaggery", "Organic palm", "Natural sweet", "Premium dry fruit", "Paper sweet", "Deep caramel", "Rich", "Gifting", "Healthy choice", "Atreyapuram"],

  mango_jelly_sugar: ["Mango sweet", "Chewy", "Fruit leather", "Mamidi thandra", "Kids friendly", "Snack", "Gifting", "Year round", "Balanced sweetness", "Andhra vibe"],
  mango_jelly_jaggery: ["Jaggery sweet", "Chewy", "Fruit leather", "Mamidi thandra", "Traditional", "Warm sweetness", "Snack", "Limited", "Andhra vibe", "Gifting"],
  palm_jelly: ["Palm fruit", "Thati thandra", "Rustic", "Earthy", "Palm jaggery", "Chewy", "Rare", "Seasonal", "Traditional", "Andhra vibe"],

  "picklespodi-brinjal-amla-pickle": ["Tangy", "Spicy", "Medium hot", "Veg pickle", "Rare", "Earthy", "Amla", "Brinjal", "Hot rice", "Curd rice"],
  "picklespodi-carrot-pickle": ["Mild spicy", "Slightly sweet", "Crunchy", "Veg pickle", "Family friendly", "Kids friendly", "Andhra style", "Curd rice", "Dosa", "Chapati"],
  "picklespodi-cauliflower-pickle": ["Spicy", "Tangy", "Crunchy", "Medium hot", "Veg pickle", "Andhra style", "Hot rice", "Curd rice", "Dosa", "Chapati"],
  "picklespodi-chintakaya-pachadi-tamarind-pickle": ["Very tangy", "Hot", "Traditional", "Veg pickle", "Tamarind", "Sour", "Andhra vibe", "Hot rice", "Dal rice", "Dosa"],
  "picklespodi-drumstick-pickle": ["Tangy", "Spicy", "Medium hot", "Traditional", "Veg pickle", "Drumstick", "Hot rice", "Dal rice", "Curd rice", "Chapati"],
  "picklespodi-garlic-pickle": ["Spicy", "Bold", "Garlic", "Medium hot", "Veg pickle", "Punchy", "Dal rice", "Curd rice", "Dosa", "Chapati"],
  "picklespodi-gongura-pickle": ["Very tangy", "Hot", "Gongura", "Sorrel", "Telugu favorite", "Andhra classic", "Veg pickle", "Hot rice ghee", "Dal rice", "Curd rice"],
  "picklespodi-karivepaku-pachadi-curry-leaf-pickle": ["Aromatic", "Curry leaf", "Medium spice", "Earthy", "Healthy choice", "Veg pickle", "Hot rice", "Idli", "Dosa", "Curd rice"],
  "picklespodi-kothimeera-coriander-pickle": ["Herby", "Fresh", "Tangy", "Medium spice", "Everyday pickle", "Veg pickle", "Coriander", "Idli", "Dosa", "Chapati"],
  "picklespodi-mango-avakai-pickle": ["Very spicy", "Tangy", "Raw mango", "Mustard", "Andhra classic", "Best seller", "Veg pickle", "Hot rice ghee", "Curd rice", "Dosa"],
  "picklespodi-mango-ginger-pickle": ["Mild tangy", "Aromatic", "Mango ginger", "Medium spice", "Rare", "Veg pickle", "Fresh flavor", "Curd rice", "Lemon rice", "Chapati"],
  "picklespodi-mango-thokku-magai-pickle": ["Tangy", "Spicy", "Medium hot", "Raw mango", "Everyday pickle", "Veg pickle", "Grated mango", "Curd rice", "Dosa", "Hot rice"],
  "picklespodi-mixed-vegetable-pickle": ["Spicy", "Tangy", "Crunchy", "Assorted vegetables", "Combo friendly", "Veg pickle", "Andhra style", "Curd rice", "Dosa", "Chapati"],
  "picklespodi-pandu-mirchi-pickle": ["Very spicy", "Extra hot", "Red chilli", "Limited batch", "Veg pickle", "Fiery", "Hot rice ghee", "Idli", "Dosa", "Pappu rice"],
  "picklespodi-tomato-pickle": ["Tangy", "Spicy", "Medium hot", "Everyday pickle", "Veg pickle", "Tomato", "Idli", "Dosa", "Curd rice", "Chapati"],
  "picklespodi-boneless-chicken-pickle": ["Spicy", "Hot", "Non veg pickle", "Chicken", "Protein rich", "Preorder", "Travel meals", "Hot rice", "Chapati", "Dosa"],
  "picklespodi-boneless-mutton-pickle": ["Spicy", "Hot", "Non veg pickle", "Mutton", "Premium", "Rich masala", "Preorder", "Hot rice", "Chapati", "Dosa"],
  "picklespodi-fish-pickle-koramenu-pickle": ["Spicy", "Hot", "Non veg pickle", "Seafood", "Fish", "Koramenu", "Preorder", "Hot rice", "Chapati", "Dosa"],
  "picklespodi-gongura-chicken-pickle": ["Tangy", "Spicy", "Hot", "Gongura", "Chicken", "Non veg pickle", "Telugu favorite", "Preorder", "Hot rice", "Chapati"],
  "picklespodi-gongura-mutton-pickle": ["Tangy", "Spicy", "Hot", "Gongura", "Mutton", "Non veg pickle", "Premium", "Preorder", "Hot rice", "Chapati"],
  "picklespodi-gongura-prawn-pickle": ["Tangy", "Spicy", "Hot", "Gongura", "Prawn", "Seafood", "Non veg pickle", "Premium", "Preorder", "Hot rice"],
  "picklespodi-natu-kodi-country-chicken-pickle": ["Spicy", "Hot", "Country chicken", "Natu kodi", "Non veg pickle", "Specialty", "Preorder", "Rustic", "Hot rice", "Chapati"],
  "picklespodi-prawns-pickle": ["Spicy", "Hot", "Prawn", "Seafood", "Non veg pickle", "Premium", "Preorder", "Rich masala", "Hot rice", "Curd rice"],
  "picklespodi-dhaniyalu-podi-coriander-spice-powder": ["Podi", "Aromatic", "Coriander", "Medium spice", "Earthy", "Andhra style", "Hot rice ghee", "Idli", "Dosa", "Easy shipping"],
  "picklespodi-drumstick-leaf-podi-munagaku-podi": ["Podi", "Healthy choice", "Leaf powder", "Medium spice", "Earthy", "Traditional", "Andhra style", "Hot rice ghee", "Idli", "Dosa"],
  "picklespodi-idli-podi": ["Podi", "Breakfast favorite", "Medium hot", "Spicy", "Good shelf life", "Idli", "Dosa", "Ghee", "Andhra style", "Everyday"],
  "picklespodi-kandi-podi": ["Podi", "Protein rich", "Mild spicy", "Traditional", "Comfort food", "Hot rice ghee", "Idli", "Dosa", "Andhra style", "Everyday"],
  "picklespodi-karapu-podi-with-garlic": ["Podi", "Spicy", "Garlic", "Medium hot", "Bold", "Andhra style", "Dal rice", "Curd rice", "Dosa", "Idli"],
  "picklespodi-karivepaku-podi-curry-leaf-powder": ["Podi", "Curry leaf", "Aromatic", "Medium spice", "Healthy choice", "Earthy", "Hot rice ghee", "Idli", "Dosa", "Curd rice"]
};

SHRISH_DATA.products.forEach((product) => {
  const extraTags = SHRISH_RECOMMENDATION_TAGS[product.id] || [];
  const tasteTags = String(product.taste || '')
    .split(/\s+-\s+|,|\|/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  product.recommendationTags = Array.from(new Set([
    ...extraTags,
    ...tasteTags,
    product.tag,
    product.filterGroup,
    ...(product.badges || [])
  ].filter(Boolean)));
});

const SHRISH_CATALOG_FIELD_OVERRIDE_IDS = new Set(
  SHRISH_DATA.products
    .filter((product) => ["picklespodi", "putharekulu", "jellysnacks"].includes(product.category))
    .map((product) => product.id)
);

const SHRISH_CATALOG_FIELD_OVERRIDES = Object.fromEntries(
  SHRISH_DATA.products
    .filter((product) => SHRISH_CATALOG_FIELD_OVERRIDE_IDS.has(product.id))
    .map((product) => [product.id, {
      name: product.name,
      category: product.category,
      localName: product.localName,
      price: product.price,
      unit: product.unit,
      ingredientsText: product.ingredientsText,
      storageNote: product.storageNote,
      shelfLifeDisplay: product.shelfLifeDisplay,
      foodSafetyNote: product.foodSafetyNote,
      allergenNote: product.allergenNote,
      spiceNotice: product.spiceNotice,
      imageDisclaimer: product.imageDisclaimer,
      variants: (product.variants || []).map((variant) => ({ ...variant }))
    }])
);

window.SHRISH_RECOMMENDATION_TAGS = SHRISH_RECOMMENDATION_TAGS;
window.SHRISH_CATALOG_FIELD_OVERRIDES = SHRISH_CATALOG_FIELD_OVERRIDES;
window.SHRISH_MAJOR_ALLERGEN_NOTICE = SHRISH_MAJOR_ALLERGEN_NOTICE;
window.SHRISH_SPICE_NOTICE = SHRISH_SPICE_NOTICE;
window.SHRISH_PRODUCT_IMAGE_DISCLAIMER = SHRISH_PRODUCT_IMAGE_DISCLAIMER;
window.SHRISH_DATA = SHRISH_DATA;
