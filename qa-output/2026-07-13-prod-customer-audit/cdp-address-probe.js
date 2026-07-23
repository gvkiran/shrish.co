const fs = require('fs');
const out = process.argv[2]; const port = Number(process.argv[3] || 9337); const base=`http://127.0.0.1:${port}`;
async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function wsUrl(){for(let i=0;i<50;i++){try{const pages=await (await fetch(`${base}/json/list`)).json();const p=pages.find(x=>x.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch(e){} await sleep(200);}throw new Error('no page');}
async function main(){
 const events=[]; const ws=new WebSocket(await wsUrl()); let id=0; const pending=new Map();
 ws.onmessage=msg=>{const d=JSON.parse(msg.data); if(d.id&&pending.has(d.id)){const p=pending.get(d.id); pending.delete(d.id); d.error?p.reject(new Error(JSON.stringify(d.error))):p.resolve(d.result); return;} if(['Runtime.exceptionThrown','Log.entryAdded'].includes(d.method)) events.push(d);};
 await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej;}); const cdp=(m,p={})=>new Promise((resolve,reject)=>{const mid=++id; pending.set(mid,{resolve,reject}); ws.send(JSON.stringify({id:mid,method:m,params:p}));});
 await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
 const evalv=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;};
 await cdp('Page.navigate',{url:'https://www.shrish.co/shop.html'}); await sleep(3500);
 const cart=[{id:'picklespodi-carrot-pickle__pickle-carrot-250g',productId:'picklespodi-carrot-pickle',variantId:'pickle-carrot-250g',category:'picklespodi',name:'Carrot Pickle (250g)',price:'$10.99',unit:'250g',image:'images/brand/logo-small.png',qty:1}];
 await evalv(`sessionStorage.setItem('shrish_cart', ${JSON.stringify(JSON.stringify(cart))}); true`);
 await cdp('Page.navigate',{url:'https://www.shrish.co/order.html'}); await sleep(8000);
 const res=await evalv(`(async()=>{
   const shipping=document.querySelector('input[value="shipping"]'); if(shipping){ shipping.click(); shipping.dispatchEvent(new Event('change',{bubbles:true})); }
   await new Promise(r=>setTimeout(r,2500));
   const input=document.getElementById('shippingAddress1'); if(input){ input.value='1600 Pennsylvania Ave'; input.dispatchEvent(new Event('input',{bubbles:true})); }
   await new Promise(r=>setTimeout(r,4500));
   return {googleLoaded:!!window.google?.maps?.importLibrary, keyPresent:!!window.SHRISH_APP_CONFIG?.googleMapsApiKey, assist:document.getElementById('shippingAddressAssist')?.innerText || '', suggestions:[...document.querySelectorAll('.shipping-address-suggestion')].map(e=>e.innerText.trim()).slice(0,5), visibleShipping:!!document.querySelector('.shipping-fields.show'), eventsText:document.body.innerText.match(/Shipping address|Start typing|manual|suggestion|Google/ig)?.slice(0,20)||[]};
 })()`);
 fs.writeFileSync(out, JSON.stringify({res,events},null,2)); await cdp('Browser.close').catch(()=>{});
}
main().catch(e=>{fs.writeFileSync(out, JSON.stringify({error:String(e), stack:e.stack},null,2)); process.exit(1);});
