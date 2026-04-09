// ============================================================
//  SHRISH LLC - Shared Data Store  v2.0
//  available: false  -> Not Available (shown in shop, blocked in order form)
//  displayOnly: true -> Shown in shop catalog, never orderable
//  Putharekulu & Jelly & Snacks items can be displayOnly until ready to sell
// ============================================================

const SHRISH_DATA = {

  locations: [
    { id: "shortpump",    label: "Short Pump, VA" },
    { id: "chesterfield", label: "Chesterfield, VA" }
  ],

  categories: [
    { id: "all",         label: "All Products" },
    { id: "mangoes",     label: "🥭 Mangoes" },
    { id: "putharekulu", label: "🍬 Putharekulu" },
    { id: "jellysnacks", label: "🍡 Jelly & Snacks" }
  ],

  products: [

    // ═══════════════════════════════════════════
    //  MANGOES
    // ═══════════════════════════════════════════
    {
      id: "alphonso", category: "mangoes",
      name: "Alphonso (Hapus)", localName: "हापुस", origin: "Ratnagiri, Maharashtra",
      price: "$45", unit: "per box (~2.5 kg)",
      available: true, displayOnly: false, tag: "Most Popular",
      image: "img_alphonso.jpeg",
      description: "The undisputed King of Mangoes. Intensely sweet, saffron-yellow flesh with zero fibre and an intoxicating aroma. Sourced directly from Ratnagiri - the only region that produces the true Hapus. Limited seasonal availability.",
      season: "May - July", taste: "Sweet  -  Rich  -  Zero Fibre",
      bestFor: "Eating fresh  -  Aamras  -  Lassi  -  Shrikhand"
    },
    {
      id: "kesar", category: "mangoes",
      name: "Kesar", localName: "કેસર", origin: "Junagadh, Gujarat",
      price: "$40", unit: "per box (~3 kg)",
      available: true, displayOnly: false, tag: "Sweet & Aromatic",
      image: "img_kesar.jpeg",
      description: "Gujarat's pride and the 'Queen of Mangoes'. Named for its saffron-coloured pulp, Kesar delivers a honey-sweet richness with a floral aroma. Round, medium-sized with nearly fiberless flesh. A household favourite across India.",
      season: "May - June", taste: "Honey-Sweet  -  Floral  -  Aromatic",
      bestFor: "Lassi  -  Ice cream  -  Milkshakes  -  Eating fresh"
    },
    {
      id: "banganapalli", category: "mangoes",
      name: "Banganapalli (Safeda)", localName: "బంగినపల్లి", origin: "Andhra Pradesh",
      price: "$37", unit: "per box (~3 kg)",
      available: false, displayOnly: false, tag: "",
      image: "img_banganapalli.jpg",
      description: "A large, golden-yellow beauty from Andhra Pradesh with a GI tag. Tender, fiberless flesh with a mild, sweet flavour and thin skin. One of the most widely consumed mangoes across South India - perfect for families who prefer a mild, non-overpowering sweetness.",
      season: "April - June", taste: "Mild Sweet  -  Tender  -  Fiberless",
      bestFor: "Eating fresh  -  Juices  -  Pickles"
    },
    {
      id: "langra", category: "mangoes",
      name: "Langra", localName: "लंगड़ा", origin: "Varanasi, Uttar Pradesh",
      price: "$38", unit: "per box (~3 kg)",
      available: false, displayOnly: false, tag: "",
      image: "img_langra.jpg",
      description: "Langra stays green even when fully ripe - don't let the colour fool you! Inside is a tangy-sweet, incredibly juicy flesh with a distinctive bold character. Prized across North India and beloved by mango connoisseurs for its unique flavour profile.",
      season: "July - August", taste: "Tangy-Sweet  -  Juicy  -  Bold",
      bestFor: "Eating fresh  -  Pickles  -  Chutneys  -  Mango panna"
    },
    {
      id: "rasalu", category: "mangoes",
      name: "Rasalu", localName: "రసాలు", origin: "Andhra Pradesh & Telangana",
      price: "$40", unit: "per box (~2.5 kg)",
      available: false, displayOnly: false, tag: "Rare & Seasonal",
      image: "img_rasalu.jpeg",
      description: "A rare South Indian gem - small, round, deeply sweet with an almost candy-like richness. Rasalu is incredibly juicy with thin fibre and a melt-in-mouth texture. Very seasonal and hard to find outside India. When available, it sells out fast!",
      season: "May - June", taste: "Very Sweet  -  Juicy  -  Candy-like",
      bestFor: "Eating fresh  -  Milkshakes  -  Aamras"
    },
    {
      id: "himayat", category: "mangoes",
      name: "Himayat (Imam Pasand)", localName: "హిమాయత్", origin: "Hyderabad, Telangana",
      price: "$42", unit: "per box (~2.5 kg)",
      available: false, displayOnly: false, tag: "Premium",
      image: "img_himayath_real.jpg",
      description: "Known as the 'Mango of the King' - Imam Pasand means 'King's favourite'. Large, oval fruit with creamy, fiberless pulp that melts in your mouth. Exceptionally sweet with a mild aroma. A prized Hyderabadi variety, incredibly rare outside Andhra Pradesh and Telangana.",
      season: "June - July", taste: "Creamy  -  Sweet  -  Fiberless  -  Melt-in-mouth",
      bestFor: "Eating fresh  -  Kulfi  -  Premium desserts"
    },
    {
      id: "payari", category: "mangoes",
      name: "Payari (Paheri)", localName: "पहेरी", origin: "Gujarat & Maharashtra",
      price: "$36", unit: "per box (~3 kg)",
      available: false, displayOnly: false, tag: "",
      image: "img_payari.jpg",
      description: "A popular summer mango known for its round shape, sweet flavour, and vibrant golden-yellow skin. Payari has rich, pulpy flesh perfect for mango pulp and traditional Gujarati recipes. A childhood favourite - its sweetness is pure and uncomplicated.",
      season: "April - June", taste: "Sweet  -  Pulpy  -  Rich",
      bestFor: "Mango pulp  -  Aamras  -  Shakes  -  Eating fresh"
    },
    {
      id: "dasheri", category: "mangoes",
      name: "Dasheri", localName: "दशहरी", origin: "Malihabad, Uttar Pradesh",
      price: "$38", unit: "per box (~3 kg)",
      available: false, displayOnly: false, tag: "",
      image: null,
      description: "Long, greenish-yellow with a fiberless, syrupy pulp - Dasheri from Malihabad holds a GI tag and is legendary in UP. Sweet, fragrant pulp with thin skin. One of North India's most beloved varieties for desserts and eating fresh.",
      season: "June - July", taste: "Syrupy  -  Fragrant  -  Fiberless",
      bestFor: "Eating fresh  -  Shakes  -  Kulfi"
    },
    {
      id: "malgova", category: "mangoes",
      name: "Malgova", localName: "மல்கோவா", origin: "Tamil Nadu & Karnataka",
      price: "$40", unit: "per box (~2 kg)",
      available: false, displayOnly: false, tag: "",
      image: null,
      description: "One of the largest mango varieties - Malgova is huge, round, and packed with rich buttery sweetness. South India's most celebrated mango, often used in temples. Thick luscious pulp with low fibre makes it incredibly satisfying.",
      season: "May - July", taste: "Rich  -  Buttery  -  Sweet",
      bestFor: "Eating fresh  -  Juices  -  Temple offering"
    },
    {
      id: "neelam", category: "mangoes",
      name: "Neelam", localName: "నీలం", origin: "South India (AP, TN, Karnataka)",
      price: "$36", unit: "per box (~3 kg)",
      available: false, displayOnly: false, tag: "",
      image: null,
      description: "Small, oval, and intensely fragrant - Neelam is one of the last varieties of the mango season, extending the joy into August. Deep orange pulp is sweet with a mild tartness and unmistakable floral perfume.",
      season: "July - August", taste: "Sweet-Tart  -  Fragrant  -  Juicy",
      bestFor: "Eating fresh  -  Pickles  -  Late-season desserts"
    },

    //  PUTHAREKULU
    // ===========================================
    {
      id: "puth_sugar_kaju", category: "putharekulu",
      name: "Putharekulu - Sugar - Kaju Badam", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$6.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Best Seller",
      image: "img_puth_sugar_kaju.jpg",
      description: "A richer sugar-based Putharekulu made with roasted cashews and almonds layered inside paper-thin rice sheets. This is one of the easiest dry-fruit variants to gift and share, with a balanced sweetness and a fuller nutty bite.",
      details: "Ingredients: Rice starch sheets, sugar, cashews, almonds and ghee. Store in a cool dry place and serve fresh.",
      badges: ["Best Seller", "Dry Fruit Loaded"],
      variants: [
        { id: "opt1", label: "5 count", price: "$6.99", sku: "PSKB5" },
        { id: "opt2", label: "10 count", price: "$13.99", sku: "PSKB10" }
      ]
    },
    {
      id: "puth_sugar_kaju_pista", category: "putharekulu",
      name: "Putharekulu - Sugar - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$7.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Premium",
      image: "img_puth_sugar_kaju_pista.png",
      description: "Traditional Atreyapuram Putharekulu finished with sugar and a premium trio of cashews, almonds, and pistachios. It delivers the delicate paper-like layers customers expect, with an extra festive dry-fruit richness in every piece.",
      details: "Ingredients: Rice starch sheets, sugar, cashews, almonds, pistachios and ghee. A premium gifting-friendly variant.",
      badges: ["Premium Dry Fruit", "Gifting Special"],
      variants: [
        { id: "opt1", label: "5 count", price: "$7.99", sku: "PSKBP5" },
        { id: "opt2", label: "10 count", price: "$14.99", sku: "PSKBP10" }
      ]
    },
    {
      id: "puth_jaggery_kaju", category: "putharekulu",
      name: "Putharekulu - Jaggery - Kaju", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$6.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Rustic Sweetness",
      image: "img_puth_jaggery_kaju_pista.png",
      description: "A jaggery-sweetened version of classic dry-fruit Putharekulu with roasted cashews folded into delicate rice starch sheets. It has a deeper, warmer sweetness than the sugar version and a more traditional village-style finish.",
      details: "Ingredients: Rice starch sheets, jaggery, cashews and ghee. Richer jaggery flavour with a softer rustic sweetness.",
      badges: ["Jaggery Sweetened", "Traditional Sweet"],
      variants: [
        { id: "opt1", label: "5 count", price: "$6.99", sku: "PJK5" },
        { id: "opt2", label: "10 count", price: "$13.99", sku: "PJK10" }
      ]
    },
    {
      id: "puth_jaggery_kaju_badam", category: "putharekulu",
      name: "Putharekulu - Jaggery - Kaju Badam", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$7.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Most Requested",
      image: "img_puth_jaggery_kaju_pista.png",
      description: "This dry-fruit Putharekulu combines the deeper sweetness of jaggery with roasted cashews and almonds for a fuller bite. It is a dependable crowd-pleaser for customers who want a traditional sweet profile without refined sugar notes.",
      details: "Ingredients: Rice starch sheets, jaggery, cashews, almonds and ghee. Balanced dry-fruit richness with a traditional jaggery finish.",
      badges: ["Most Requested", "Jaggery Sweetened"],
      variants: [
        { id: "opt1", label: "5 count", price: "$7.99", sku: "PJKB5" },
        { id: "opt2", label: "10 count", price: "$14.99", sku: "PJKB10" }
      ]
    },
    {
      id: "puth_jaggery_kaju_pista", category: "putharekulu",
      name: "Putharekulu - Jaggery - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$7.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Most Requested",
      image: "img_puth_jaggery_kaju_pista.png",
      description: "A premium jaggery Putharekulu layered with cashews, almonds, and pistachios inside delicate rice flour sheets. It offers a richer, more indulgent dry-fruit profile with the darker sweetness and aroma customers expect from traditional jaggery sweets.",
      details: "Ingredients: Rice starch sheets, jaggery, cashews, almonds, pistachios and ghee. One of the most premium dry-fruit jaggery options in the range.",
      badges: ["Most Requested", "Premium Dry Fruit", "Jaggery Sweetened"],
      variants: [
        { id: "opt1", label: "5 count", price: "$7.99", sku: "PJKBP5" },
        { id: "opt2", label: "10 count", price: "$15.99", sku: "PJKBP10" }
      ]
    },
    {
      id: "puth_sugarfree", category: "putharekulu",
      name: "Putharekulu - Sugar (Diabetic) - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$7.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Diabetic Friendly",
      image: "img_puth_sugarfree.jpg",
      description: "Crafted for health-conscious customers, this dry-fruit Putharekulu uses a diabetic-friendly sweetener profile while keeping the classic paper-thin texture and generous mix of cashews, almonds, and pistachios. It is designed to deliver the traditional experience with a lighter sweetness profile.",
      details: "Ingredients: Rice starch sheets, diabetic-friendly sweetener, cashews, almonds, pistachios and ghee. Intended for customers who prefer a lower-sugar-style option.",
      badges: ["Diabetic Friendly", "Premium Dry Fruit"],
      variants: [
        { id: "opt1", label: "5 count", price: "$7.99", sku: "PSDKBP5" },
        { id: "opt2", label: "10 count", price: "$15.99", sku: "PSDKBP10" }
      ]
    },
    {
      id: "puth_dates_kaju_badam_pista", category: "putharekulu",
      name: "Putharekulu -- Dates -- Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$9.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Natural Sweetness",
      image: "img_puth_jaggery_kaju_pista.png",
      description: "An exotic dry-fruit Putharekulu that combines dates with cashews, almonds, and pistachios for a naturally deeper sweetness and chewy, rich finish. It is a premium gifting option for customers who enjoy fruit-based sweetness with traditional Atreyapuram texture.",
      details: "Ingredients: Rice starch sheets, dates, jaggery, cashews, almonds, pistachios and ghee. Rich and naturally sweet with a dense dry-fruit profile.",
      badges: ["Exotic Special", "Natural Sweetness"],
      variants: [
        { id: "opt1", label: "5 count", price: "$9.99", sku: "PDKBP5" },
        { id: "opt2", label: "10 count", price: "$18.99", sku: "PDKBP10" }
      ]
    },
    {
      id: "puth_organic_palm_kaju_badam_pista", category: "putharekulu",
      name: "Putharekulu - Organic Palm Jaggery - Kaju Badam Pista", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$9.99", unit: "5 count or 10 count",
      available: true, displayOnly: false, tag: "Premium Choice",
      image: "img_puth_jaggery_kaju_pista.png",
      description: "A premium exotic Putharekulu made with organic palm jaggery and a rich blend of cashews, almonds, and pistachios. It offers the deepest caramel-like sweetness in the range, with luxurious dry-fruit texture layered inside the signature paper-thin sheets.",
      details: "Ingredients: Rice starch sheets, organic palm jaggery, cashews, almonds, pistachios and ghee. Premium rich flavour with a deeper palm-jaggery finish.",
      badges: ["Premium Choice", "Organic Palm Jaggery", "Exotic Special"],
      variants: [
        { id: "opt1", label: "5 count", price: "$9.99", sku: "POPJKBP5" },
        { id: "opt2", label: "10 count", price: "$18.99", sku: "POPJKBP10" }
      ]
    },

    //  Mango Jelly  & SNACKS
    // ===========================================
    {
      id: "mango_jelly_sugar", category: "jellysnacks",
      name: "Mango Jelly - Sugar (Mamidi Thandra)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$6.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Best Seller",
      image: "img_mango_jelly.webp",
      description: "A year-round bestseller made from ripe mango pulp slowly dried into soft fruit leather sheets. This classic Mamidi Thandra has a bright mango flavour, chewy bite, and balanced sweetness that makes it an easy favourite for both gifting and snacking.",
      details: "Ingredients: Mango pulp and sugar. Store sealed in a cool dry place. Best enjoyed fresh after opening.",
      badges: ["Best Seller", "Year Round"],
      variants: [
        { id: "opt1", label: "250g", price: "$6.99", sku: "MJS250" },
        { id: "opt2", label: "500g", price: "$13.99", sku: "MJS500" }
      ]
    },
    {
      id: "mango_jelly_jaggery", category: "jellysnacks",
      name: "Mango Jelly - Jaggery (Mamidi Thandra)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$6.99", unit: "250g or 500g",
      available: true, displayOnly: false, tag: "Seasonal - Limited",
      image: "img_mango_jelly.webp",
      description: "A seasonal jaggery-based Mamidi Thandra with a deeper colour and warmer sweetness than the sugar version. It keeps the same chewy mango-fruit texture while adding a richer, more traditional finish that serious mango-jelly lovers usually look for first.",
      details: "Ingredients: Mango pulp and jaggery. Seasonal and limited compared with the regular sugar variety.",
      badges: ["Seasonal", "Very Limited", "Most Requested"],
      variants: [
        { id: "opt1", label: "250g", price: "$6.99", sku: "MJJ250" },
        { id: "opt2", label: "500g", price: "$13.99", sku: "MJJ500" }
      ]
    },
    {
      id: "palm_jelly", category: "jellysnacks",
      name: "Palm Fruit Jelly (Thati Thandra)", localName: "",
      origin: "Atreyapuram, Andhra Pradesh",
      price: "$14.99", unit: "500g",
      available: true, displayOnly: false, tag: "Seasonal - Unique",
      image: "img_palm_jelly.webp",
      description: "A distinctive seasonal Thati Thandra made from palm fruit pulp with a richer, earthier flavour than mango jelly. It is softer, darker, and more rustic in character, making it a niche favourite for customers who want a more traditional Andhra-style fruit sweet.",
      details: "Ingredients: Palm fruit pulp and palm jaggery. Naturally more rustic in taste than mango jelly and available seasonally.",
      badges: ["Seasonal", "Rare Delicacy", "Naturally Bitter"],
      variants: [
        { id: "opt1", label: "500g", price: "$14.99", sku: "PFJ500" }
      ]
    }
  ],

  orderForm: {
    duplicateCheckField: "phone",
    confirmationMessage: "🥭 Thank you! Your order has been placed. Please watch for my updates on the WhatsApp group for pickup details. If you’re not part of the group yet, please join using the link below. Payment collected at pickup"
  }
};

window.SHRISH_DATA = SHRISH_DATA;

