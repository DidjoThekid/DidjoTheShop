import Stripe from 'stripe';
import {markPaid} from './_lib.js';
export const config={api:{bodyParser:false}};
const raw=req=>new Promise((ok,ko)=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>ok(Buffer.concat(c)));req.on('error',ko)});
export default async function h(req,res){
  const E=process.env;
  if(req.method!=='POST')return res.status(405).json({error:'POST uniquement'});
  if(!E.STRIPE_SECRET_KEY||!E.STRIPE_WEBHOOK_SECRET)return res.status(500).json({error:'STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET manquant dans les variables Vercel'});
  const stripe=new Stripe(E.STRIPE_SECRET_KEY);
  let ev;
  try{ev=stripe.webhooks.constructEvent(await raw(req),req.headers['stripe-signature'],E.STRIPE_WEBHOOK_SECRET)}
  catch(e){return res.status(400).json({error:'Signature invalide'})}
  try{
    if(ev.type==='checkout.session.completed'||ev.type==='checkout.session.async_payment_succeeded'){
      const s=ev.data.object;
      if(s.payment_status==='paid'&&s.client_reference_id)await markPaid(s.client_reference_id,s.amount_total);
    }
  }catch(e){console.error('Webhook',e);return res.status(500).json({error:'Erreur de traitement'})}
  return res.status(200).json({received:true});
}
