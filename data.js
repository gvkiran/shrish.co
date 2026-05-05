// ============================================================
//  SHRISH LLC - Shared Data Store  v2.0
//  available: false  -> Not Available (shown in shop, blocked in order form)
//  displayOnly: true -> Shown in shop catalog, never orderable
//  Putharekulu & Jelly & Snacks items can be displayOnly until ready to sell
// ============================================================

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
      image: "img_dasheri.jpg",
      description: "Long, greenish-yellow with a fiberless, syrupy pulp - Dasheri from Malihabad holds a GI tag and is legendary in UP. Sweet, fragrant pulp with thin skin. One of North India's most beloved varieties for desserts and eating fresh.",
      season: "June - July", taste: "Syrupy  -  Fragrant  -  Fiberless",
      bestFor: "Eating fresh  -  Shakes  -  Kulfi"
    },
    {
      id: "malgova", category: "mangoes",
      name: "Malgova", localName: "மல்கோவா", origin: "Tamil Nadu & Karnataka",
      price: "$40", unit: "per box (~2 kg)",
      available: false, displayOnly: false, tag: "",
      image: "img_malgova.jpg",
      description: "One of the largest mango varieties - Malgova is huge, round, and packed with rich buttery sweetness. South India's most celebrated mango, often used in temples. Thick luscious pulp with low fibre makes it incredibly satisfying.",
      season: "May - July", taste: "Rich  -  Buttery  -  Sweet",
      bestFor: "Eating fresh  -  Juices  -  Temple offering"
    },
    {
      id: "neelam", category: "mangoes",
      name: "Neelam", localName: "నీలం", origin: "South India (AP, TN, Karnataka)",
      price: "$36", unit: "per box (~3 kg)",
      available: false, displayOnly: false, tag: "",
      image: "img_neelam.jpg",
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
    },

    // PICKLES & PODI
    // ===========================================
    {
      id: "picklespodi-brinjal-amla-pickle", category: "picklespodi",
      name: "Brinjal Amla Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$8.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/brinjal-amla-pickle.jpg",
      description: "Unique brinjal and amla pickle with tangy, spicy, and earthy flavors. Good rare variety for customers who want something different.",
      ingredientsText: "Brinjal, amla, red chilli powder, mustard, fenugreek, salt, turmeric, oil, tamarind optional",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Rare", "Tangy", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Hot rice - curd rice - chapati - dosa",
      variants: [
        { id: "pickle-brinjal-amla-250g", label: "250g", price: "$8.99", sku: "pickle-brinjal-amla-250g" },
        { id: "pickle-brinjal-amla-500g", label: "500g", price: "$16.99", sku: "pickle-brinjal-amla-500g" }
      ]
    },
    {
      id: "picklespodi-carrot-pickle", category: "picklespodi",
      name: "Carrot Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$8.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/carrot.jpg",
      description: "Andhra-style carrot pickle made with firm carrot pieces, chilli, mustard, fenugreek, turmeric, salt, and oil. Slightly sweet, spicy, and kid-friendly compared with very hot avakai.",
      ingredientsText: "Carrot pieces, red chilli powder, mustard powder, fenugreek, turmeric, salt, oil, lemon or vinegar depending on supplier recipe",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Mild Sweetness", "Family Friendly"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Curd rice - chapati - dosa - idli - upma - lemon rice",
      variants: [
        { id: "pickle-carrot-250g", label: "250g", price: "$8.99", sku: "pickle-carrot-250g" },
        { id: "pickle-carrot-500g", label: "500g", price: "$16.99", sku: "pickle-carrot-500g" }
      ]
    },
    {
      id: "picklespodi-cauliflower-pickle", category: "picklespodi",
      name: "Cauliflower Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$8.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/cauliflower.jpg",
      description: "Andhra-style cauliflower pickle with crunchy cauliflower florets coated in red chilli, mustard, fenugreek, turmeric, salt, and oil. Tangy, spicy, and great as a rice or tiffin side.",
      ingredientsText: "Cauliflower florets, red chilli powder, mustard powder, fenugreek, turmeric, salt, oil, lemon or vinegar depending on supplier recipe",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Crunchy", "Spicy"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Curd rice - hot rice with ghee - dosa - idli - chapati - upma",
      variants: [
        { id: "pickle-cauliflower-250g", label: "250g", price: "$8.99", sku: "pickle-cauliflower-250g" },
        { id: "pickle-cauliflower-500g", label: "500g", price: "$16.99", sku: "pickle-cauliflower-500g" }
      ]
    },
    {
      id: "picklespodi-chintakaya-pachadi-tamarind-pickle", category: "picklespodi",
      name: "Chintakaya Pachadi / Tamarind Pickle", localName: "250g", origin: "Veg Pickle",
      price: "$7.99", unit: "250g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/chintakaya-pachadi.jpg",
      description: "Traditional tamarind-style pickle with sharp tangy flavor and South Indian spice. Excellent with rice, dal, curd rice, and breakfast items.",
      ingredientsText: "Raw tamarind, green or red chilli, mustard, fenugreek, turmeric, salt, oil, tempering spices",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Tangy", "Traditional"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Hot",
      bestFor: "Hot rice - curd rice - dal - pesarattu - dosa",
      variants: [
        { id: "pickle-chintakaya-250g", label: "250g", price: "$7.99", sku: "pickle-chintakaya-250g" }
      ]
    },
    {
      id: "picklespodi-drumstick-pickle", category: "picklespodi",
      name: "Drumstick Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$8.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/drumstick-pickle.jpg",
      description: "Traditional drumstick pickle with spicy, tangy flavor. A good South Indian side for rice and dal.",
      ingredientsText: "Drumstick pieces, red chilli powder, mustard, fenugreek, tamarind or lemon, salt, turmeric, oil",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Traditional", "Tangy", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Hot rice - curd rice - dal rice - chapati",
      variants: [
        { id: "pickle-drumstick-250g", label: "250g", price: "$8.99", sku: "pickle-drumstick-250g" },
        { id: "pickle-drumstick-500g", label: "500g", price: "$16.99", sku: "pickle-drumstick-500g" }
      ]
    },
    {
      id: "picklespodi-garlic-pickle", category: "picklespodi",
      name: "Garlic Pickle", localName: "250g", origin: "Veg Pickle",
      price: "$7.99", unit: "250g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/garlic-pickle.jpg",
      description: "Bold garlic pickle with strong spice and deep flavor. Best for customers who love a punchy pickle with rice, dosa, or chapati.",
      ingredientsText: "Garlic cloves, red chilli powder, mustard, fenugreek, turmeric, salt, oil, tamarind optional",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Bold Flavor", "Spicy"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Dal rice - curd rice - chapati - dosa - idli",
      variants: [
        { id: "pickle-garlic-250g", label: "250g", price: "$7.99", sku: "pickle-garlic-250g" }
      ]
    },
    {
      id: "picklespodi-gongura-pickle", category: "picklespodi",
      name: "Gongura Pickle", localName: "250g", origin: "Veg Pickle",
      price: "$7.99", unit: "250g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/gongura-pickle.jpg",
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
        { id: "pickle-gongura-250g", label: "250g", price: "$7.99", sku: "pickle-gongura-250g" }
      ]
    },
    {
      id: "picklespodi-karivepaku-pachadi-curry-leaf-pickle", category: "picklespodi",
      name: "Karivepaku Pachadi / Curry Leaf Pickle", localName: "200g", origin: "Veg Pickle",
      price: "$7.99", unit: "200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/karivepaku-pachadi.jpg",
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
        { id: "pickle-karivepaku-pachadi-200g", label: "200g", price: "$7.99", sku: "pickle-karivepaku-pachadi-200g" }
      ]
    },
    {
      id: "picklespodi-kothimeera-coriander-pickle", category: "picklespodi",
      name: "Kothimeera / Coriander Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$7.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/kothimeera-pickle.jpg",
      description: "Fresh coriander-style pickle with a herby, spicy, and tangy taste. A good everyday pickle for rice, dosa, idli, and chapati.",
      ingredientsText: "Fresh coriander leaves, green chilli or red chilli, garlic, tamarind, mustard, salt, oil, tempering spices",
      storageNote: "Refrigerate after opening and use within 30 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 2-4 months. After opening: refrigerate and use within 30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Herby", "Everyday Pickle", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Idli - dosa - curd rice - chapati - upma",
      variants: [
        { id: "pickle-kothimeera-250g", label: "250g", price: "$7.99", sku: "pickle-kothimeera-250g" },
        { id: "pickle-kothimeera-500g", label: "500g", price: "$15.99", sku: "pickle-kothimeera-500g" }
      ]
    },
    {
      id: "picklespodi-mango-avakai-pickle", category: "picklespodi",
      name: "Mango Avakai Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/mango-avakai.jpg",
      description: "Traditional Andhra-style raw mango avakai with mustard, red chilli, spices, and oil. Spicy, tangy, and perfect with hot rice, curd rice, dosa, idli, and chapati.",
      ingredientsText: "Raw mango pieces, mustard powder, red chilli powder, salt, turmeric, fenugreek, sesame or groundnut oil, garlic optional",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Best Seller", "Spicy", "Family Pack"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Hot",
      bestFor: "Hot rice with ghee - curd rice - dosa - idli - chapati - dal rice",
      variants: [
        { id: "pickle-mango-avakai-250g", label: "250g", price: "$9.99", sku: "pickle-mango-avakai-250g" },
        { id: "pickle-mango-avakai-500g", label: "500g", price: "$17.99", sku: "pickle-mango-avakai-500g" }
      ]
    },
    {
      id: "picklespodi-mango-ginger-pickle", category: "picklespodi",
      name: "Mango Ginger Pickle", localName: "250g", origin: "Veg Pickle",
      price: "$8.99", unit: "250g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/mango-ginger-pickle.jpg",
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
        { id: "pickle-mango-ginger-250g", label: "250g", price: "$8.99", sku: "pickle-mango-ginger-250g" }
      ]
    },
    {
      id: "picklespodi-mango-thokku-magai-pickle", category: "picklespodi",
      name: "Mango Thokku / Magai Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$9.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/mango-thokku-magai.jpg",
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
        { id: "pickle-mango-thokku-magai-250g", label: "250g", price: "$9.99", sku: "pickle-mango-thokku-magai-250g" },
        { id: "pickle-mango-thokku-magai-500g", label: "500g", price: "$16.99", sku: "pickle-mango-thokku-magai-500g" }
      ]
    },
    {
      id: "picklespodi-mixed-vegetable-pickle", category: "picklespodi",
      name: "Mixed Vegetable Pickle", localName: "250g or 500g", origin: "Veg Pickle",
      price: "$8.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/mixed-vegetable.jpg",
      description: "Andhra-style mixed vegetable pickle with carrot, cauliflower, green chilli, and seasonal vegetables in a bold chilli-mustard spice mix. A colorful, crunchy side for rice and tiffins.",
      ingredientsText: "Mixed vegetables such as carrot, cauliflower, green chilli, and seasonal vegetables, red chilli powder, mustard powder, fenugreek, turmeric, salt, oil, lemon or vinegar depending on supplier recipe",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Andhra Style", "Assorted Vegetables", "Combo Friendly"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Curd rice - hot rice - chapati - dosa - idli - upma",
      variants: [
        { id: "pickle-mixed-vegetable-250g", label: "250g", price: "$8.99", sku: "pickle-mixed-vegetable-250g" },
        { id: "pickle-mixed-vegetable-500g", label: "500g", price: "$16.99", sku: "pickle-mixed-vegetable-500g" }
      ]
    },
    {
      id: "picklespodi-pandu-mirchi-pickle", category: "picklespodi",
      name: "Pandu Mirchi Pickle", localName: "500g", origin: "Veg Pickle",
      price: "$17.99", unit: "500g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/pandu-mirchi-pickle.jpg",
      description: "Spicy red chilli pickle for customers who love serious heat. Strong, flavorful, and best with hot rice, dosa, idli, and curd rice.",
      ingredientsText: "Red ripe chillies, tamarind, mustard, fenugreek, salt, turmeric, oil, garlic optional",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Extra Spicy", "Limited Batch"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Very Hot",
      bestFor: "Hot rice with ghee - idli - dosa - pappu rice - curd rice",
      variants: [
        { id: "pickle-pandu-mirchi-500g", label: "500g", price: "$17.99", sku: "pickle-pandu-mirchi-500g" }
      ]
    },
    {
      id: "picklespodi-tomato-pickle", category: "picklespodi",
      name: "Tomato Pickle", localName: "250g", origin: "Veg Pickle",
      price: "$7.99", unit: "250g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Veg",
      image: "images/products/pickles/tomato-pickle.jpg",
      description: "Rich and spicy tomato pickle with a deep, tangy flavor. Great with rice, dosa, upma, idli, chapati, and curd rice.",
      ingredientsText: "Tomatoes, red chilli powder, tamarind optional, mustard, fenugreek, salt, oil, garlic optional",
      storageNote: "Refrigerate after opening and use within 30-60 days. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-6 months. After opening: refrigerate and use within 30-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Veg Pickle", "Veg", "Tangy", "Everyday Pickle"],
      filterGroup: "Veg Pickles",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Idli - dosa - curd rice - chapati - upma - hot rice",
      variants: [
        { id: "pickle-tomato-250g", label: "250g", price: "$7.99", sku: "pickle-tomato-250g" }
      ]
    },
    {
      id: "picklespodi-boneless-chicken-pickle", category: "picklespodi",
      name: "Boneless Chicken Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$15.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/chicken-boneless-pickle.jpg",
      description: "Spicy Andhra-style boneless chicken pickle with bold masala and rich flavor. Best with rice, roti, dosa, and curd rice.",
      ingredientsText: "Boneless chicken, red chilli powder, ginger garlic, garam masala, mustard, fenugreek, salt, oil, lemon or vinegar depending on supplier recipe",
      storageNote: "Refrigerate immediately after opening and use within 15-30 days. Do not leave at room temperature after opening. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Preorder only. Follow package Best Before date. After opening: refrigerate and use within 15-30 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Pickup only",
      badges: ["Non-Veg Pickle", "Non-Veg", "Preorder Only", "Spicy", "Family Pack"],
      filterGroup: "Non-Veg Pickles",
      season: "Preorder Only", taste: "Spice: Hot",
      bestFor: "Hot rice - chapati - dosa - curd rice - travel meals",
      variants: [
        { id: "pickle-chicken-boneless-250g", label: "250g", price: "$15.99", sku: "pickle-chicken-boneless-250g" },
        { id: "pickle-chicken-boneless-500g", label: "500g", price: "$27.99", sku: "pickle-chicken-boneless-500g" }
      ]
    },
    {
      id: "picklespodi-boneless-mutton-pickle", category: "picklespodi",
      name: "Boneless Mutton Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$18.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/mutton-boneless-pickle.jpg",
      description: "Premium boneless mutton pickle with rich spice, deep flavor, and strong Andhra-style masala.",
      ingredientsText: "Boneless mutton, red chilli powder, ginger garlic, garam masala, mustard, fenugreek, salt, oil, lemon or vinegar depending on supplier recipe",
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
        { id: "pickle-mutton-boneless-500g", label: "500g", price: "$31.99", sku: "pickle-mutton-boneless-500g" }
      ]
    },
    {
      id: "picklespodi-fish-pickle-koramenu-pickle", category: "picklespodi",
      name: "Fish Pickle / Koramenu Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$17.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/fish-koramenu-pickle.jpg",
      description: "Spicy fish pickle with Andhra-style masala. Premium seafood pickle for preorder customers.",
      ingredientsText: "Fish pieces, red chilli powder, ginger garlic, mustard, fenugreek, salt, oil, lemon or vinegar depending on supplier recipe, spices",
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
        { id: "pickle-fish-koramenu-500g", label: "500g", price: "$31.99", sku: "pickle-fish-koramenu-500g" }
      ]
    },
    {
      id: "picklespodi-gongura-chicken-pickle", category: "picklespodi",
      name: "Gongura Chicken Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$15.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/gongura-chicken-pickle.jpg",
      description: "Tangy gongura chicken pickle with spicy masala and bold Telugu flavor. A high-demand non-veg variety.",
      ingredientsText: "Chicken, gongura leaves, red chilli powder, ginger garlic, mustard, fenugreek, salt, oil, spices",
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
      name: "Gongura Mutton Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$18.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/gongura-mutton-pickle.jpg",
      description: "Premium gongura mutton pickle with tangy gongura and rich mutton masala. Strong Telugu demand item.",
      ingredientsText: "Mutton, gongura leaves, red chilli powder, ginger garlic, mustard, fenugreek, salt, oil, spices",
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
      name: "Gongura Prawn Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$18.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/gongura-prawn-pickle.jpg",
      description: "Premium gongura prawn pickle with tangy gongura and spicy seafood masala.",
      ingredientsText: "Prawns, gongura leaves, red chilli powder, ginger garlic, mustard, fenugreek, salt, oil, spices",
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
      name: "Natu Kodi / Country Chicken Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$17.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/natu-kodi-pickle.jpg",
      description: "Country chicken pickle with strong traditional flavor and spicy masala. Preorder-only specialty item.",
      ingredientsText: "Country chicken, red chilli powder, ginger garlic, garam masala, mustard, fenugreek, salt, oil, spices",
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
      name: "Prawns Pickle", localName: "250g or 500g", origin: "Non-Veg Pickle",
      price: "$17.99", unit: "250g or 500g",
      available: true, displayOnly: false, preorderOnly: true, tag: "Preorder Only",
      image: "images/products/pickles/prawns-pickle.jpg",
      description: "Spicy prawns pickle with rich seafood flavor and strong Andhra-style masala. Premium preorder item.",
      ingredientsText: "Prawns, red chilli powder, ginger garlic, mustard, fenugreek, salt, oil, lemon or vinegar depending on supplier recipe",
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
      name: "Dhaniyalu Podi / Coriander Spice Powder", localName: "200g", origin: "Spice Powder",
      price: "$6.99", unit: "200g",
      available: true, displayOnly: false, hidden: true, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/dhaniyalu-podi.jpg",
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
        { id: "podi-dhaniyalu-200g", label: "200g", price: "$6.99", sku: "podi-dhaniyalu-200g" }
      ]
    },
    {
      id: "picklespodi-drumstick-leaf-podi-munagaku-podi", category: "picklespodi",
      name: "Drumstick Leaf Podi / Munagaku Podi", localName: "200g", origin: "Spice Powder",
      price: "$7.99", unit: "200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/drumstick-leaf-podi.jpg",
      description: "Andhra-style munagaku podi made with roasted drumstick leaves, dals, chillies, garlic, and spices. Nutty, earthy, and excellent with hot rice, ghee, idli, and dosa.",
      ingredientsText: "Drumstick leaves, chana dal, urad dal, red chillies, garlic optional, cumin, tamarind optional, salt",
      storageNote: "Use within 45-60 days after opening for best aroma. Keep airtight; refrigerate if humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-4 months. After opening: keep airtight and use within 45-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Andhra Style", "Leaf Powder", "Traditional"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice with ghee - idli - dosa - upma - curd rice",
      variants: [
        { id: "podi-drumstick-leaf-200g", label: "200g", price: "$7.99", sku: "podi-drumstick-leaf-200g" }
      ]
    },
    {
      id: "picklespodi-idli-podi", category: "picklespodi",
      name: "Idli Podi", localName: "200g", origin: "Spice Powder",
      price: "$6.99", unit: "200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/idli-podi.jpg",
      description: "Classic South Indian idli karam podi. Mix with ghee or oil and serve with idli, dosa, uttapam, or hot rice.",
      ingredientsText: "Chana dal, urad dal, red chillies, sesame seeds optional, curry leaves optional, garlic optional, salt",
      storageNote: "Use within 60-90 days after opening for best aroma. Keep airtight; refrigerate if your kitchen is humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 4-6 months. After opening: keep airtight and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Breakfast Favorite", "Good Shelf Life"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Idli with ghee - dosa - uttapam - upma",
      variants: [
        { id: "podi-idli-200g", label: "200g", price: "$6.99", sku: "podi-idli-200g" }
      ]
    },
    {
      id: "picklespodi-kandi-podi", category: "picklespodi",
      name: "Kandi Podi", localName: "200g", origin: "Spice Powder",
      price: "$7.99", unit: "200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/kandi-podi.jpg",
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
        { id: "podi-kandi-200g", label: "200g", price: "$7.99", sku: "podi-kandi-200g" }
      ]
    },
    {
      id: "picklespodi-karapu-podi-with-garlic", category: "picklespodi",
      name: "Karapu Podi with Garlic", localName: "200g", origin: "Spice Powder",
      price: "$6.99", unit: "200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/karapu-podi-garlic.jpg",
      description: "Spicy garlic karam podi with bold flavor. Perfect with hot rice and ghee, idli, dosa, or as a spicy side for everyday meals.",
      ingredientsText: "Garlic cloves, red chilli powder, mustard, fenugreek, turmeric, salt, oil, tamarind optional",
      storageNote: "Refrigerate after opening and use within 60-90 days for best taste and safety. Always use a clean, dry spoon. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 6-12 months. After opening: refrigerate and use within 60-90 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Garlic", "Spicy", "Good Shelf Life"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium-Hot",
      bestFor: "Dal rice - curd rice - chapati - dosa - idli",
      variants: [
        { id: "podi-karapu-garlic-200g", label: "200g", price: "$6.99", sku: "podi-karapu-garlic-200g" }
      ]
    },
    {
      id: "picklespodi-karivepaku-podi-curry-leaf-powder", category: "picklespodi",
      name: "Karivepaku Podi / Curry Leaf Powder", localName: "100g or 200g", origin: "Spice Powder",
      price: "$4.99", unit: "100g or 200g",
      available: true, displayOnly: false, preorderOnly: false, tag: "Podi",
      image: "images/products/podi/karivepaku-podi.jpg",
      description: "Aromatic curry leaf podi with traditional South Indian spices. Mix with hot rice and ghee or enjoy with idli, dosa, and upma.",
      ingredientsText: "Curry leaves, red chillies, urad dal, chana dal, cumin, garlic optional, tamarind optional, salt",
      storageNote: "Use within 45-60 days after opening for best aroma. Keep airtight; refrigerate if humid. Store unopened packs cool, dry, and away from sunlight.",
      shelfLifeDisplay: "Unopened: 3-4 months. After opening: keep airtight and use within 45-60 days.",
      foodSafetyNote: "Shelf life depends on supplier recipe, acidity, oil coverage, packaging, and storage. Use the package Best Before date as final.",
      shippingNote: "Shipping eligible",
      badges: ["Spice Powder", "Podi", "Curry Leaf", "Good Shelf Life"],
      filterGroup: "Podi",
      season: "Available Now", taste: "Spice: Medium",
      bestFor: "Hot rice with ghee - idli - dosa - upma - curd rice",
      variants: [
        { id: "podi-karivepaku-100g", label: "100g", price: "$4.99", sku: "podi-karivepaku-100g" },
        { id: "podi-karivepaku-200g", label: "200g", price: "$6.99", sku: "podi-karivepaku-200g" }
      ]
    }
  ],

  orderForm: {
    duplicateCheckField: "phone",
    confirmationMessage: "🥭 Thank you! Your order has been placed. Please watch for my updates on the WhatsApp group for pickup details. If you’re not part of the group yet, please join using the link below. Payment collected at pickup"
  }
};

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

window.SHRISH_RECOMMENDATION_TAGS = SHRISH_RECOMMENDATION_TAGS;
window.SHRISH_DATA = SHRISH_DATA;

