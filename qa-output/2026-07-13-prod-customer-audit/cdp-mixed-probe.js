const fs = require('fs');
const out = process.argv[2];
const port = Number(process.argv[3] || 9336);
const base = `http://127.0.0.1:${port}`;
async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function wsUrl(){ for(let i=0;i<50;i++){ try{ const pages=await (await fetch(`${base}/json/list`)).json(); const page=pages.find(p=>p.type==='page'); if(page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl; }catch(e){} await sleep(200);} throw new Error('no page'); }
async function main(){
 const ws = new WebSocket(await wsUrl()); let id=0; const pending=new Map();
 ws.onmessage = msg => { const d=JSON.parse(msg.data); if(d.id && pending.has(d.id)){ const p=pending.get(d.id); pending.delete(d.id); d.error?p.reject(new Error(JSON.stringify(d.error))):p.resolve(d.result); } };
 await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej;});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const mid=++id; pending.set(mid,{resolve,reject}); ws.send(JSON.stringify({id:mid,method,params}));});
 await cdp('Page.enable'); await cdp('Runtime.enable');
 const evalv=async expression => { const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
 await cdp('Page.navigate',{url:'https://www.shrish.co/shop.html'}); await sleep(3500);
 const cart = [
  {id:'banganapalli', productId:'banganapalli', category:'mangoes', name:'Banganapalli (Safeda)', price:'$56', unit:'per box (~4kgs) (7 to 12)', image:'images/products/mangoes/img_banganapalli_2026_display.jpg', qty:1},
  {id:'picklespodi-carrot-pickle__pickle-carrot-250g', productId:'picklespodi-carrot-pickle', variantId:'pickle-carrot-250g', category:'picklespodi', name:'Carrot Pickle (250g)', price:'$10.99', unit:'250g', image:'images/brand/logo-small.png', qty:1}
 ];
 await evalv(`sessionStorage.setItem('shrish_cart', ${JSON.stringify(JSON.stringify(cart))}); true`);
 await cdp('Page.navigate',{url:'https://www.shrish.co/order.html'}); await sleep(7500);
 const result = await evalv(`(() => { const text=document.body.innerText; return {url:location.href, cart:sessionStorage.getItem('shrish_cart'), text:text.slice(0,3500), payAtPickup:text.includes('Pay at pickup'), stripe:text.includes('Stripe'), payOnline:text.includes('Pay Online')||text.includes('Secure Payment'), shipping:text.includes('Shipping')}; })()`);
 fs.writeFileSync(out, JSON.stringify(result,null,2)); await cdp('Browser.close').catch(()=>{});
}
main().catch(e=>{fs.writeFileSync(out, JSON.stringify({error:String(e), stack:e.stack}, null, 2)); process.exit(1);});
