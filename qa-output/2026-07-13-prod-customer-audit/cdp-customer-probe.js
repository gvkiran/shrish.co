const fs = require('fs');
const out = process.argv[2];
const port = Number(process.argv[3] || 9335);
const base = `http://127.0.0.1:${port}`;
const events = [];
async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function getPageWsUrl(){
  for(let i=0;i<50;i++){
    try { const pages = await (await fetch(`${base}/json/list`)).json(); const page = pages.find(p => p.type === 'page'); if(page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl; } catch(e) {}
    await sleep(200);
  }
  throw new Error('Chrome page CDP not ready');
}
const snapshotExpr = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter(visible).slice(0,12).map(h => h.innerText.trim());
  const buttons = Array.from(document.querySelectorAll('button,a')).filter(visible).slice(0,60).map(b => b.innerText.trim()).filter(Boolean);
  const geetRegex = new RegExp('Geet|Ask Geet','i');
  const geet = Array.from(document.querySelectorAll('*')).filter(el => visible(el) && geetRegex.test(el.innerText || '')).slice(0,4).map(el => { const r=el.getBoundingClientRect(); return {tag:el.tagName, text:(el.innerText||'').trim().slice(0,80), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}; });
  return {url:location.href,title:document.title,innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth > innerWidth + 2, bodyLen:document.body.innerText.length, productCards:document.querySelectorAll('.pc-card').length, headings, buttons, geet};
})()`;
async function main(){
  const ws = new WebSocket(await getPageWsUrl()); let id = 0; const pending = new Map();
  ws.onmessage = (msg) => { const data = JSON.parse(msg.data); if(data.id && pending.has(data.id)){ const {resolve,reject}=pending.get(data.id); pending.delete(data.id); data.error?reject(new Error(JSON.stringify(data.error))):resolve(data.result); return; } if(['Runtime.exceptionThrown','Log.entryAdded','Console.messageAdded'].includes(data.method)) events.push(data); };
  await new Promise((resolve,reject)=>{ ws.onopen=resolve; ws.onerror=reject; });
  const cdp = (method, params={}) => new Promise((resolve,reject)=>{ const mid=++id; pending.set(mid,{resolve,reject}); ws.send(JSON.stringify({id:mid,method,params})); });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  async function navigate(url, mobile=false){ if(mobile) await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true}); else await cdp('Emulation.clearDeviceMetricsOverride'); await cdp('Page.navigate',{url}); await sleep(7000); }
  async function evalValue(expression){ const res = await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
  const results = [];
  await navigate('https://www.shrish.co/', false); results.push({step:'home desktop', data: await evalValue(snapshotExpr)});
  await navigate('https://www.shrish.co/shop.html', false); results.push({step:'shop desktop', data: await evalValue(snapshotExpr)});
  const pickleAdd = await evalValue(`(async()=>{ if(window.quickAdd){ window.quickAdd('picklespodi-carrot-pickle'); return sessionStorage.getItem('shrish_cart'); } return 'quickAdd missing'; })()`);
  await sleep(1500);
  await navigate('https://www.shrish.co/order.html', false); results.push({step:'order pickle-only desktop', cart: pickleAdd, data: await evalValue(`(() => { const s = ${snapshotExpr}; const text = document.body.innerText; s.paymentFlags = {payAtPickup:text.includes('Pay at pickup'), payOnline:text.includes('Pay Online') || text.includes('Pay now') || text.includes('online payment'), stripe:text.includes('Stripe')}; return s; })()`)});
  await navigate('https://www.shrish.co/shop.html', false);
  const mixedAdd = await evalValue(`(()=>{ sessionStorage.removeItem('shrish_cart'); if(window.quickAdd){ window.quickAdd('banganapalli'); window.quickAdd('picklespodi-carrot-pickle'); } return sessionStorage.getItem('shrish_cart'); })()`);
  await sleep(1500);
  await navigate('https://www.shrish.co/order.html', false); results.push({step:'order mixed mango+pickle desktop', cart: mixedAdd, data: await evalValue(`(() => { const s = ${snapshotExpr}; const text = document.body.innerText; s.paymentFlags = {payAtPickup:text.includes('Pay at pickup'), payOnline:text.includes('Pay Online') || text.includes('Pay now') || text.includes('online payment'), stripe:text.includes('Stripe')}; return s; })()`)});
  await navigate('https://www.shrish.co/shop.html', true); results.push({step:'shop mobile', data: await evalValue(snapshotExpr)});
  fs.writeFileSync(out, JSON.stringify({results, events}, null, 2));
  await cdp('Browser.close').catch(()=>{});
}
main().catch(e => { fs.writeFileSync(out, JSON.stringify({error:String(e), stack:e.stack, events}, null, 2)); process.exit(1); });
