import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyWebhook(raw, signature, secret, now=Date.now()) {
  if(!secret || !signature) throw Error('Webhook not configured');
  const parts=signature.split(',').map(x=>x.split('='));
  const timestamp=parts.find(([k])=>k==='t')?.[1];
  if(!timestamp || Math.abs(now/1000-Number(timestamp))>300) throw Error('Invalid webhook timestamp');
  const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest();
  const valid=parts.filter(([k])=>k==='v1').some(([,value])=>{const actual=Buffer.from(value||'','hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);});
  if(!valid) throw Error('Invalid webhook signature');
  return JSON.parse(raw.toString());
}
export function retailCents(product, config) {
  const shipping=config.supplierShippingBySku[product.sku]??config.defaultSupplierShipping;
  if(product.supplierPrice==null||shipping==null) return null;
  if(!Number.isFinite(product.supplierPrice)||!Number.isFinite(shipping)||shipping<0||product.supplierPrice<0||config.multiplier!==2.5) throw Error('Invalid retail pricing configuration');
  return Math.round((product.supplierPrice+shipping)*config.multiplier*100);
}
export async function stripeRequest(path, body, key, idempotency, fetcher=fetch) {
  const response=await fetcher('https://api.stripe.com/v1/'+path,{
    method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotency}:{})},
    body:body?new URLSearchParams(body):undefined,signal:AbortSignal.timeout(25000)
  });
  const data=await response.json();
  if(!response.ok) {const error=Error(data.error?.message||'Stripe request failed');error.status=response.status;throw error;}
  return data;
}
export async function createSession(order, {key, origin, tax=false, fetcher=fetch}) {
  const post=(path,body,suffix)=>stripeRequest(path,body,key,order.id+suffix,fetcher);
  const body={mode:'payment',success_url:`${origin}/?order=${order.id}&payment=returned#shop`,cancel_url:`${origin}/?order=${order.id}&payment=cancelled#shop`,'metadata[order_id]':order.id,'client_reference_id':order.id,'shipping_address_collection[allowed_countries][0]':'US','phone_number_collection[enabled]':'true','automatic_tax[enabled]':String(tax)};
  JSON.parse(order.items).forEach((item,i)=>{body[`line_items[${i}][price_data][currency]`]='usd';body[`line_items[${i}][price_data][unit_amount]`]=String(item.unitAmount);body[`line_items[${i}][price_data][product_data][name]`]=item.name;body[`line_items[${i}][quantity]`]=String(item.quantity);});
  body['shipping_options[0][shipping_rate_data][type]']='fixed_amount';
  body['shipping_options[0][shipping_rate_data][fixed_amount][amount]']=String(order.shipping);
  body['shipping_options[0][shipping_rate_data][fixed_amount][currency]']='usd';
  body['shipping_options[0][shipping_rate_data][display_name]']='Delivery';
  if(order.reward){const coupon=await post('coupons', {percent_off:'25',duration:'once',name:'Chance 2 Five — 25% off'},'-coupon');body['discounts[0][coupon]']=coupon.id;}
  return post('checkout/sessions',body,'-checkout');
}
