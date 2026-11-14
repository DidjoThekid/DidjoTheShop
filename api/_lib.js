import {put,head} from '@vercel/blob';
const E=process.env,P=`db-${E.DB_SECRET}/`;
export const rd=async(n,d)=>{try{const b=await head(P+n+'.json');return await(await fetch(b.url+'?t='+Date.now(),{cache:'no-store'})).json()}catch{return d}};
export const wr=(n,v)=>put(P+n+'.json',JSON.stringify(v),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
export const mail=(to,subject,html,extra={})=>fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to,subject,html,...extra})}).then(async r=>{if(!r.ok)console.error('Resend',r.status,await r.text());return r.ok}).catch(e=>{console.error('Resend',e);return false});
const eur=c=>(c/100).toFixed(2).replace('.',',')+' €';

/* ===== Facture PDF (sans dépendance) ===== */
const L=s=>String(s??'').replace(/€/g,'\x80').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/œ/g,'\x9c').replace(/[^\x00-\xff]/g,'?').replace(/[\\()]/g,m=>'\\'+m);
export function invoicePdf(o,u){
  const ops=[];
  const t=(x,y,s,b,sz=10)=>ops.push(`BT /${b?'F2':'F1'} ${sz} Tf ${x} ${y} Td (${L(s)}) Tj ET`);
  t(50,800,E.SHOP_NAME||'DidjoTheSHOP',1,18);
  let yy=782;
  for(const l of String(E.SHOP_ADDRESS||'').split('|').filter(Boolean)){t(50,yy,l.trim());yy-=13}
  if(E.SHOP_SIRET){t(50,yy,'SIRET : '+E.SHOP_SIRET);yy-=13}
  t(350,800,'FACTURE '+(o.invoiceNo||''),1,14);
  t(350,782,'Date : '+new Date(o.paidAt||o.date).toLocaleDateString('fr-FR'));
  t(350,769,'Commande : '+o.id);
  let y=Math.min(yy,740)-24;
  t(50,y,'Facturé à',1,11);y-=14;
  t(50,y,(u&&u.name)||'');y-=13;
  t(50,y,o.email||'');y-=13;
  for(const l of String(o.address||'').split('\n').filter(Boolean)){t(50,y,l);y-=13}
  y-=16;
  ops.push(`0.93 g 50 ${y-4} 495 18 re f 0 g`);
  t(56,y,'Désignation',1);t(340,y,'Qté',1);t(390,y,'Prix unit.',1);t(480,y,'Total',1);y-=20;
  for(const i of o.items){
    if(y<120){t(56,y,'...');break}
    t(56,y,String(i.name).slice(0,60)+(i.sub?' (par mois)':''));
    t(344,y,String(i.qty));t(390,y,eur(i.price));t(480,y,eur(i.price*i.qty));y-=15;
  }
  if(o.shipping>0){t(56,y,'Livraison');t(344,y,'1');t(390,y,eur(o.shipping));t(480,y,eur(o.shipping));y-=15}
  y-=8;ops.push(`50 ${y+8} m 545 ${y+8} l S`);
  t(390,y-8,'Total TTC',1,12);t(480,y-8,eur(o.paidAmount||o.total),1,12);y-=34;
  t(50,y,'Payée par carte via Stripe le '+new Date(o.paidAt||o.date).toLocaleDateString('fr-FR')+'.');y-=14;
  if(E.INVOICE_MENTION){t(50,y,E.INVOICE_MENTION);y-=14}
  if(o.items.some(i=>i.virtual))t(50,y,'Articles virtuels : non remboursables (renonciation au droit de rétractation acceptée à la commande).');
  const content=ops.join('\n');
  const objs=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  let out='%PDF-1.4\n';const off=[];
  objs.forEach((s,i)=>{off.push(out.length);out+=`${i+1} 0 obj\n${s}\nendobj\n`});
  const xr=out.length;
  out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
  return Buffer.from(out,'latin1');
}

/* ===== Commande payée : numéro de facture, stock, mail + facture ===== */
export async function markPaid(orderId,amount){
  const orders=await rd('orders',[]),o=orders.find(x=>x.id===orderId);
  if(!o||o.paid)return o||null;
  const inv=await rd('invoices',{seq:0});inv.seq++;await wr('invoices',inv);
  o.paid=true;o.paidAmount=amount||o.total;o.paidAt=Date.now();
  o.invoiceNo='F-'+new Date().getFullYear()+'-'+String(inv.seq).padStart(4,'0');
  await wr('orders',orders);
  const prods=await rd('products',[]);let ch=false;
  for(const i of o.items){const p=prods.find(x=>x.id===i.id);if(p&&typeof p.stock==='number'){p.stock=Math.max(0,p.stock-i.qty);ch=true}}
  if(ch)await wr('products',prods);
  const users=await rd('users',[]),u=users.find(x=>x.id===o.userId);
  await mail(o.email,`Paiement reçu – commande ${o.id}`,`<p>Merci ! Le paiement de ta commande <b>${o.id}</b> (${eur(o.paidAmount)}) est bien reçu.</p><p>Ta facture <b>${o.invoiceNo}</b> est en pièce jointe.</p>`,{attachments:[{filename:`facture-${o.invoiceNo}.pdf`,content:invoicePdf(o,u).toString('base64')}]});
  return o;
}
