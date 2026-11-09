import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { Store } from './store.mjs';
import { retailCents, verifyWebhook, createSession, stripeRequest } from './payments.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const env=process.env, port=Number(env.PORT||(process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:3000)), origin=(env.PUBLIC_ORIGIN||`http://localhost:${port}`).replace(/\/$/,'');
const allowed=new Set([new URL(origin).origin,...(env.STOREFRONT_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)]);
mkdirSync(resolve(root,'.data'),{recursive:true,mode:0o700});
const store=new Store(env.DATABASE_PATH||resolve(root,'.data/store.sqlite'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png'};
function settings(){const context={window:{}};runInNewContext(readFileSync(resolve(root,'dist/pricing-config.js'),'utf8'),context);return context.window.CHANCE2_PRICING;}
function products(){return JSON.parse(readFileSync(resolve(root,'dist/catalog.json'),'utf8')).products;}
function cardView(id){const card=store.card(id);if(!card)return null;const active=store.openOrder(id);return {...card,rewardAvailable:card.punches===5,rewardReserved:Boolean(active?.reward),pendingOrder:active?.id||null};}
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1e6)throw Error('Request too large');chunks.push(chunk);}return Buffer.concat(chunks);}
async function reconcile(order){if(!order?.session||order.state==='paid')return order;const s=await stripeRequest('checkout/sessions/'+encodeURIComponent(order.session),null,env.STRIPE_SECRET_KEY);if(s.payment_status==='paid')store.event({id:'reconcile-paid-'+s.id,type:'checkout.session.completed'},s);else if(s.status==='expired')store.event({id:'reconcile-expired-'+s.id,type:'checkout.session.expired'},s);return store.order(order.id);}
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  const requestOrigin=req.headers.origin;
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(requestOrigin&&allowed.has(requestOrigin)){res.setHeader('Access-Control-Allow-Origin',requestOrigin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Card-Code');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
  if(req.method==='OPTIONS'){res.writeHead(requestOrigin&&allowed.has(requestOrigin)?204:403);return res.end();}
  try {
    if(url.pathname==='/api/stripe/webhook'&&req.method==='POST'){
      let event;try{event=verifyWebhook(await body(req),req.headers['stripe-signature'],env.STRIPE_WEBHOOK_SECRET);}catch{return json(400,{error:'Invalid webhook signature'});}
      if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type) && store.order(event.data.object.metadata?.order_id||''))store.event(event,event.data.object);
      return json(200,{received:true});
    }
    if(url.pathname.startsWith('/api/')){
      if(requestOrigin&&!allowed.has(requestOrigin))return json(403,{error:'Origin not allowed'});
      if(req.method==='POST'&&!requestOrigin && req.headers['sec-fetch-site']==='cross-site')return json(403,{error:'Origin not allowed'});
      if(url.pathname==='/api/config')return json(200,{checkoutConfigured:Boolean(env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET&&env.CUSTOMER_SHIPPING_CENTS!==undefined),shippingCents:env.CUSTOMER_SHIPPING_CENTS===undefined?null:Number(env.CUSTOMER_SHIPPING_CENTS)});
      if(url.pathname==='/api/cards'&&req.method==='POST')return json(201,cardView(store.createCard().id));
      const cardId=req.headers['x-card-code'];
      if(typeof cardId!=='string'||!store.card(cardId))return json(401,{error:'Open or restore your punch card first.'});
      if(url.pathname==='/api/card'&&req.method==='GET')return json(200,cardView(cardId));
      if(url.pathname.startsWith('/api/orders/')&&req.method==='GET'){
        let order=store.order(url.pathname.split('/').pop());if(!order||order.card!==cardId)return json(404,{error:'Order not found'});
        if(env.STRIPE_SECRET_KEY)order=await reconcile(order);
        return json(200,{id:order.id,state:order.state,card:cardView(cardId)});
      }
      if(url.pathname==='/api/checkout/cancel'&&req.method==='POST'){
        const order=await reconcile(store.openOrder(cardId));
        if(order?.state==='processing')return json(409,{error:'Your payment is processing. Wait for confirmation before changing this checkout.'});
        if(order?.state==='creating')return json(409,{error:'Checkout is still being opened. Please retry checkout before cancelling.'});
        if(order?.session&&order.state==='open'){
          await stripeRequest(`checkout/sessions/${encodeURIComponent(order.session)}/expire`,{},env.STRIPE_SECRET_KEY,order.id+'-expire');
          store.event({id:'cancel-'+order.id,type:'checkout.session.expired'},{id:order.session,metadata:{order_id:order.id}});
        }
        return json(200,cardView(cardId));
      }
      if(url.pathname==='/api/checkout'&&req.method==='POST'){
        if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)return json(503,{error:'Online checkout is being connected. Please check back soon.'});
        const shipping=Number(env.CUSTOMER_SHIPPING_CENTS);
        if(env.CUSTOMER_SHIPPING_CENTS===undefined||!Number.isSafeInteger(shipping)||shipping<0)return json(503,{error:'Delivery pricing is not configured yet.'});
        let active=store.openOrder(cardId);if(active?.session)active=await reconcile(active);
        if(active&&['open','processing'].includes(active.state))return json(200,{url:active.url,orderId:active.id,state:active.state});
        let order=active?.state==='creating'?active:null;
        if(!order){
          const input=JSON.parse((await body(req)).toString());if(!Array.isArray(input.items)||!input.items.length)return json(400,{error:'Your bag is empty.'});
          const catalog=new Map(products().map(p=>[p.url,p])), config=settings(), quantities=new Map();
          for(const item of input.items){if(!Number.isSafeInteger(item.quantity)||item.quantity<1)return json(400,{error:'Invalid quantity'});quantities.set(item.url,(quantities.get(item.url)||0)+item.quantity);}
          const items=[];
          for(const [url,quantity]of quantities){const p=catalog.get(url);if(!p)return json(400,{error:'Product no longer available'});const unitAmount=retailCents(p,config);if(unitAmount===null)return json(409,{error:`${p.name}: supplier shipping needs a quote before checkout.`});if(!Number.isSafeInteger(quantity)||!Number.isSafeInteger(unitAmount*quantity))return json(400,{error:'Invalid quantity'});items.push({url,sku:p.sku,name:p.name,unitAmount,quantity});}
          const subtotal=items.reduce((s,p)=>s+p.quantity*p.unitAmount,0);
          if(!Number.isSafeInteger(subtotal))return json(400,{error:'Invalid order amount'});
          order=store.reserve(cardId,items,subtotal,shipping);
        }
        try{const session=await createSession(order,{key:env.STRIPE_SECRET_KEY,origin,tax:env.STRIPE_AUTOMATIC_TAX==='true'});store.attach(order.id,session);return json(200,{url:session.url,orderId:order.id,state:'open'});}
        catch(e){if(e.status&&e.status<500)store.failCreation(order.id);console.error('Stripe checkout failed',e.status||'network');return json(502,{error:'Checkout could not be opened. Please try again.'});}
      }
      return json(404,{error:'Not found'});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Method not allowed'});
    const filename=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    const path=resolve(root,'dist',filename);
    if(!path.startsWith(resolve(root,'dist')+'/')||filename.split('/').some(x=>x.startsWith('.')))return json(404,{error:'Not found'});
    let contents;try{contents=readFileSync(path);}catch{return json(404,{error:'Not found'});}
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:contents);
  }catch(e){console.error('Request failed:',e.message);json(500,{error:'Something went wrong. Please try again.'});}
});
server.listen(port,()=>console.log(`Chance 2 Furniture: http://localhost:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
