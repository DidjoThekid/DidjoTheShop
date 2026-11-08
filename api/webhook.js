import {put,head} from '@vercel/blob';
import Stripe from 'stripe';
export const config={api:{bodyParser:false}};
const E=process.env,P=`db-${E.DB_SECRET}/`;
const rd=async(n,d)=>{try{const b=await head(P+n+'.json');return await(await fetch(b.url+'?t='+Date.now(),{cache:'no-store'})).json()}catch{return d}};
const wr=(n,v)=>put(P+n+'.json',JSON.stringify(v),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
export default async function h(req,res){
  if(req.method!=='POST')return res.status(405).end();
  const chunks=[];for await(const c of req)chunks.push(c);
  const stripe=new Stripe(E.STRIPE_SECRET_KEY);
  let ev;try{ev=stripe.webhooks.constructEvent(Buffer.concat(chunks),req.headers['stripe-signature'],E.STRIPE_WEBHOOK_SECRET)}catch(e){console.error('Webhook',e.message);return res.status(400).send('Signature invalide')}
  if(ev.type==='checkout.session.completed'||ev.type==='checkout.session.async_payment_succeeded'){
    const s=ev.data.object;
    if(s.payment_status==='paid'&&s.client_reference_id){
      const orders=await rd('orders',[]),o=orders.find(x=>x.id===s.client_reference_id);
      if(o&&!o.paid){o.paid=true;o.paidAmount=s.amount_total;await wr('orders',orders);
        await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to:o.email,subject:`Paiement reçu pour la commande ${o.id}`,html:`<p>Merci ! Le paiement pour la commande <b>${o.id}</b> est bien reçu.</p>`})}).catch(()=>{});
      }
    }
  }
  res.status(200).json({received:true});
}
