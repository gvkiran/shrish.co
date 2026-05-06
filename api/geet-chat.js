const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEFAULT_MODEL = 'gpt-5-mini';
const MAX_HISTORY_MESSAGES = 8;
const MAX_QUESTION_LENGTH = 500;

let cachedCatalog = null;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  if (req.body) {
    return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;

  const dataPath = path.join(process.cwd(), 'data.js');
  const code = fs.readFileSync(dataPath, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'data.js', timeout: 1000 });

  const data = sandbox.window.SHRISH_DATA || {};
  const products = Array.isArray(data.products) ? data.products : [];
  cachedCatalog = {
    locations: data.locations || [],
    categories: data.categories || [],
    products: products
      .filter((product) => !product.hidden && !product.displayOnly)
      .map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        filterGroup: product.filterGroup,
        price: product.price,
        unit: product.unit,
        available: Boolean(product.available && !product.displayOnly),
        preorderOnly: Boolean(product.preorderOnly),
        tag: product.tag || '',
        taste: product.taste || '',
        bestFor: product.bestFor || '',
        description: product.description || '',
        ingredientsText: product.ingredientsText || '',
        recommendationTags: (product.recommendationTags || []).slice(0, 14)
      }))
  };

  return cachedCatalog;
}

function getProductCategory(product) {
  if (product.category === 'putharekulu' || product.category === 'jellysnacks') return 'sweets';
  return product.category || 'all';
}

function getProductHref(product) {
  return `shop.html?category=${encodeURIComponent(getProductCategory(product))}&product=${encodeURIComponent(product.id)}`;
}

function chipLabel(name) {
  return String(name || '').replace(/\s*\(.+?\)\s*/g, '').slice(0, 28) || 'View product';
}

function buildCatalogPrompt(catalog) {
  const productLines = catalog.products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    status: product.available ? 'available' : product.preorderOnly ? 'preorder' : 'not_available',
    price: product.price,
    unit: product.unit,
    tag: product.tag,
    taste: product.taste,
    bestFor: product.bestFor,
    tags: product.recommendationTags,
    description: product.description,
    ingredients: product.ingredientsText
  }));

  return JSON.stringify({
    pickupLocations: catalog.locations.map((location) => location.label),
    ordering: 'Customers add products to cart on the shop page. Pickup is available at listed pickup locations. Payment is handled at pickup unless the site says otherwise.',
    products: productLines
  });
}

function buildInstructions() {
  return [
    'You are Geet, the shopping assistant for SHRISH LLC.',
    'Only answer questions about SHRISH products, product recommendations, taste, ingredients, ordering, pickup, availability, and related food pairing help.',
    'Use only the product catalog JSON provided in the user message. Do not invent products, prices, availability, ingredients, pickup locations, or policies.',
    'When recommending products, prefer products marked available. You may mention preorder items only when relevant and clearly say they are preorder.',
    'Do not give medical advice. For allergies, ingredients, custom orders, or exact same-day stock, suggest connecting with Shrish.',
    'If the question is unrelated to SHRISH, politely say you can only help with SHRISH products and ordering.',
    'Return only valid JSON with this shape: {"text":"short friendly answer","productIds":["id1","id2"],"quickReplies":["Sweet","Spicy"]}.',
    'productIds must contain only IDs from the provided catalog, maximum 3. quickReplies should be short, maximum 3.'
  ].join('\n');
}

function getOutputText(responsePayload) {
  if (typeof responsePayload.output_text === 'string') return responsePayload.output_text;

  const chunks = [];
  for (const item of responsePayload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseModelJson(text) {
  const trimmed = String(text || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw error;
    return JSON.parse(match[0]);
  }
}

function buildSafeResponse(modelPayload, catalog) {
  const productById = new Map(catalog.products.map((product) => [product.id, product]));
  const productIds = Array.isArray(modelPayload.productIds) ? modelPayload.productIds : [];
  const productChips = productIds
    .map((id) => productById.get(String(id)))
    .filter(Boolean)
    .slice(0, 3)
    .map((product) => ({
      label: chipLabel(product.name),
      href: getProductHref(product)
    }));

  const quickReplies = (Array.isArray(modelPayload.quickReplies) ? modelPayload.quickReplies : [])
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((label) => ({
      label: label.slice(0, 24),
      action: label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || 'available'
    }));

  return {
    text: String(modelPayload.text || '').trim().slice(0, 900),
    chips: [...productChips, ...quickReplies].slice(0, 5),
    source: 'ai'
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, { error: 'Geet AI is not configured', fallback: true });
    return;
  }

  try {
    const body = await readRequestBody(req);
    const question = String(body.question || '').trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) {
      sendJson(res, 400, { error: 'Question is required' });
      return;
    }

    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-MAX_HISTORY_MESSAGES)
      .map((message) => ({
        sender: message.sender === 'user' ? 'user' : 'geet',
        text: String(message.text || '').slice(0, 300)
      }));

    const catalog = loadCatalog();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: buildInstructions(),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  `Customer question: ${question}`,
                  `Recent conversation: ${JSON.stringify(history)}`,
                  `Current page: ${String(body.page || '').slice(0, 200)}`,
                  `SHRISH catalog JSON: ${buildCatalogPrompt(catalog)}`
                ].join('\n\n')
              }
            ]
          }
        ],
        max_output_tokens: 700
      })
    });

    if (!response.ok) {
      await response.text();
      sendJson(res, 502, { error: 'Geet AI request failed', fallback: true });
      return;
    }

    const payload = await response.json();
    const text = getOutputText(payload);
    const modelPayload = parseModelJson(text);
    const safeResponse = buildSafeResponse(modelPayload, catalog);
    if (!safeResponse.text) {
      sendJson(res, 502, { error: 'Geet AI returned an empty answer', fallback: true });
      return;
    }

    sendJson(res, 200, safeResponse);
  } catch (error) {
    sendJson(res, 500, { error: 'Geet AI failed', fallback: true });
  }
};
