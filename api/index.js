import {put,head} from '@vercel/blob';
import crypto from 'node:crypto';
const E=process.env,P=`db-${E.DB_SECRET}/`;
const rd=async(n,d)=>{try{const b=await head(P+n+'.json');return await(await fetch(b.url+'?t='+Date.now(),{cache:'no-store'})).json()}catch{return d}};
const wr=(n,v)=>put(P+n+'.json',JSON.stringify(v),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
const sign=s=>crypto.createHmac('sha256',E.SESSION_SECRET).update(s).digest('base64url');
const hash=(pw,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(pw,salt,32).toString('hex');
const ok=(pw,h)=>{const a=Buffer.from(hash(pw,h.split(':')[0])),b=Buffer.from(h);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mail=(to,subject,html)=>fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to,subject,html})}).then(async r=>{if(!r.ok)console.error('Resend',r.status,await r.text());return r.ok}).catch(e=>{console.error('Resend',e);return false});
const uid=()=>crypto.randomBytes(6).toString('hex');
const sm=(m,p,body)=>fetch('https://api.sumup.com/v0.1'+p,{method:m,headers:{Authorization:'Bearer '+E.SUMUP_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok){console.error('SumUp',r.status,JSON.stringify(j));throw new Error('SumUp '+r.status+' '+JSON.stringify(j))}return j});
export default async function h(req,res){try{return await main(req,res)}catch(e){console.error(e);return res.status(500).json({error:'Erreur serveur : '+e.message})}}
async function main(req,res){
  const path=new URL(req.url,'http://x').pathname.replace(/^\/api\//,'').replace(/\/$/,'');
  const b=req.body||{},send=(c,o)=>res.status(c).json(o);const origin='https://'+(req.headers['x-forwarded-host']||req.headers.host);
  const login=u=>res.setHeader('Set-Cookie',`s=${u};HttpOnly;Secure;SameSite=Lax;Path=/;Max-Age=2592000`);
  const users=await rd('users',[]);
  let user=null;const ck=(req.headers.cookie||'').match(/s=([^;]+)/)?.[1];
  if(ck){const[p,g]=ck.split('.');if(g&&g===sign(p)){try{const t=JSON.parse(Buffer.from(p,'base64url'));if(t.exp>Date.now())user=users.find(u=>u.id===t.id&&!u.banned)||null}catch{}}}
  const admin=!!user&&user.email===(E.ADMIN_EMAIL||'').toLowerCase();
  const start=u=>{const p=Buffer.from(JSON.stringify({id:u.id,exp:Date.now()+2592e6})).toString('base64url');login(p+'.'+sign(p))};
  const pub=u=>({name:u.name,email:u.email,admin:u.email===(E.ADMIN_EMAIL||'').toLowerCase()});
  const issue=async u=>{
    if(u.code&&u.code.sent>Date.now()-3e4)return send(429,{error:'Attends 30 secondes avant de redemander un code'});
    const c=String(crypto.randomInt(0,1e6)).padStart(6,'0');
    u.code={h:sign('c'+u.id+c),exp:Date.now()+6e5,tries:0,sent:Date.now()};await wr('users',users);
    const sent=await mail(u.email,'Ton code de connexion DidjoTheSHOP',`<p>Ton code : <b style="font-size:20px;letter-spacing:3px">${c}</b></p><p>Il est valable 10 minutes. Si ce n'est pas toi, ignore ce mail.</p>`);
    return sent?send(200,{step:'code',email:u.email}):send(502,{error:"Impossible d'envoyer le code, réessaie plus tard"});
  };
  if(path.startsWith('admin/')&&!admin)return send(403,{error:'Accès refusé'});
  if(path==='products')return send(200,{products:await rd('products',[]),shipping:(await rd('settings',{shipping:0})).shipping});
  if(path==='me')return send(200,user?pub(user):null);
  if(path==='logout'){login('');return send(200,{})}
  if(path==='register'){
    const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim().slice(0,60);
    if(email===(E.ADMIN_EMAIL||'').toLowerCase())return send(403,{error:'Cette adresse est réservée'});
    if(!name||!/^\S+@\S+\.\S+$/.test(email)||String(b.password||'').length<8)return send(400,{error:'Nom, email valide et mot de passe de 8 caractères minimum requis'});
    if(users.some(u=>u.email===email))return send(409,{error:'Un compte existe déjà avec cet email'});
    const u={id:uid(),name,email,hash:hash(b.password),banned:false,created:Date.now()};users.push(u);return issue(u);
  }
  if(path==='login'){
    const em=String(b.email||'').trim().toLowerCase(),isAdm=em===(E.ADMIN_EMAIL||'').toLowerCase();
    if(isAdm&&!E.ADMIN_PASSWORD)return send(500,{error:'ADMIN_PASSWORD manquant dans les variables Vercel'});
    let u=users.find(x=>x.email===em);
    if(isAdm&&!u){u={id:uid(),name:'Admin',email:em,hash:'',banned:false,created:Date.now()};users.push(u)}
    if(!u)return send(401,{error:'Email ou mot de passe incorrect'});
    if(u.lock>Date.now())return send(429,{error:'Trop de tentatives : réessaie dans quelques minutes'});
    const pw=Buffer.from(String(b.password||'')),ap=Buffer.from(E.ADMIN_PASSWORD||'');
    const good=isAdm?pw.length===ap.length&&crypto.timingSafeEqual(pw,ap):ok(String(b.password||''),u.hash);
    if(!good){u.fails=(u.fails||0)+1;if(u.fails>=5){u.lock=Date.now()+9e5;u.fails=0}await wr('users',users);return send(401,{error:'Email ou mot de passe incorrect'})}
    if(u.banned)return send(403,{error:'Ce compte est suspendu'});
    u.fails=0;return issue(u);
  }
  if(path==='verify'){
    const u=users.find(x=>x.email===String(b.email||'').trim().toLowerCase());
    if(!u||u.banned||!u.code||u.code.exp<Date.now())return send(400,{error:'Code expiré : reconnecte-toi pour en recevoir un nouveau'});
    const g=sign('c'+u.id+String(b.code||'').trim());
    if(!crypto.timingSafeEqual(Buffer.from(g),Buffer.from(u.code.h))){u.code.tries++;if(u.code.tries>=5)delete u.code;await wr('users',users);return send(400,{error:'Code incorrect'})}
    delete u.code;u.verified=true;await wr('users',users);start(u);return send(200,pub(u));
  }
  if(!user)return send(401,{error:'Connecte-toi pour continuer'});
  if(path==='orders')return send(200,(await rd('orders',[])).filter(o=>o.userId===user.id&&!o.archived).reverse());
  if(path==='order'){
    const prods=await rd('products',[]),{shipping}=await rd('settings',{shipping:0});
    const items=(b.items||[]).map(i=>{const p=prods.find(x=>x.id===i.id);return p&&{id:p.id,name:p.name,price:p.price,sub:!!p.sub,qty:Math.min(99,Math.max(1,i.qty|0))}}).filter(Boolean);
    if(!items.length||String(b.address||'').trim().length<10)return send(400,{error:'Panier vide ou adresse incomplète'});
    const o={id:'DJ'+uid().toUpperCase(),userId:user.id,email:user.email,items,shipping,total:items.reduce((a,i)=>a+i.price*i.qty,0)+shipping,address:String(b.address).slice(0,400),status:'En préparation',tracking:'',paid:false,date:Date.now()};
    const orders=await rd('orders',[]);orders.push(o);await wr('orders',orders);
    await mail(user.email,`Commande ${o.id} enregistrée`,`<p>Bonjour ${esc(user.name)}, ta commande <b>${o.id}</b> est enregistrée (${(o.total/100).toFixed(2)} €).</p>`);
    return send(200,o);
  }
  if(path==='cards'){
    try{const l=await sm('GET','/customers/'+encodeURIComponent(user.id)+'/payment-instruments');console.log('instruments',JSON.stringify(l));return send(200,(Array.isArray(l)?l:[]).filter(c=>c.active!==false).map(c=>({last4:c.card?.last_4_digits,brand:c.card?.type})))}catch(e){console.error('cards',e.message);return send(200,[])}
  }
  if(path==='card/setup'){
    if(!user.cust){
      try{await sm('POST','/customers',{customer_id:user.id,personal_details:{email:user.email,first_name:user.name}})}catch(e){if(!/409|exist|duplicate|conflict/i.test(e.message))throw e}
      user.cust=true;await wr('users',users);
    }
    const c=await sm('POST','/checkouts',{checkout_reference:'card-'+uid(),amount:1,currency:'EUR',merchant_code:E.SUMUP_MERCHANT_CODE,description:'Verification de la carte DidjoTheSHOP',redirect_url:origin+'/#compte',customer_id:user.id,purpose:'SETUP_RECURRING_PAYMENT'});
    return send(200,{checkoutId:c.id});
  }
  if(path==='pay'||path==='pay/confirm'){
    const orders=await rd('orders',[]),o=orders.find(x=>x.id===b.orderId&&x.userId===user.id);
    if(!o)return send(404,{error:'Commande introuvable'});
    if(o.paid)return send(200,{paid:true});
    if(path==='pay'){
      const c=await sm('POST','/checkouts',{checkout_reference:o.id+'-'+uid(),amount:o.total/100,currency:'EUR',merchant_code:E.SUMUP_MERCHANT_CODE,description:'Commande '+o.id,redirect_url:origin+'/#compte'});
      o.checkoutId=c.id;await wr('orders',orders);return send(200,{checkoutId:c.id});
    }
    const c=o.checkoutId?await sm('GET','/checkouts/'+o.checkoutId):{};
    if(c.status==='PAID'&&Math.round(c.amount*100)===o.total){o.paid=true;await wr('orders',orders);await mail(user.email,`Paiement reçu pour la commande ${o.id}`,`<p>Merci ! Le paiement de <b>${(o.total/100).toFixed(2)} €</b> pour la commande <b>${o.id}</b> est bien reçu.</p>`);return send(200,{paid:true})}
    return send(200,{paid:false});
  }
  if(path==='admin/mail-html'){
    const T=['p','br','div','span','b','strong','i','em','u','s','strike','h1','h2','h3','ul','ol','li','a','blockquote','hr','font'];
    const clean=h=>String(h||'').slice(0,30000).replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi,(m,sl,t,a)=>{t=t.toLowerCase();if(!T.includes(t))return '';if(sl)return '</'+t+'>';let o='';if(t==='a'){const x=/href\s*=\s*"(https?:\/\/[^"\s]*|mailto:[^"\s]*)"/i.exec(a);if(x)o=' href="'+x[1]+'"'}if(t==='font'){const c=/color\s*=\s*"(#[0-9a-f]{3,8})"/i.exec(a);if(c)o+=' color="'+c[1]+'"';const z=/size\s*=\s*"([1-7])"/i.exec(a);if(z)o+=' size="'+z[1]+'"'}const al=/(?:text-align:\s*|align\s*=\s*"?)(left|center|right|justify)/i.exec(a);if(al)o+=' style="text-align:'+al[1].toLowerCase()+'"';return '<'+t+o+(t==='br'||t==='hr'?'/':'')+'>'});
    const subject=String(b.subject||'').trim().slice(0,150),body=clean(b.html);
    if(!subject||!body.replace(/<[^>]*>/g,'').trim())return send(400,{error:'Objet et message requis'});
    const one=String(b.other||'').trim().toLowerCase()||(b.to==='all'?'':String(b.to||'').trim().toLowerCase());
    const to=one?[one]:users.filter(u=>!u.banned).map(u=>u.email).slice(0,100);
    if(!to.length||to.some(e=>!/^\S+@\S+\.\S+$/.test(e)))return send(400,{error:'Destinataire invalide'});
    const html='<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#142033">'+body+'</div>';
    const r=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(to.map(e=>({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to:[e],subject,html})))});
    if(!r.ok)return send(502,{error:"Resend a refusé l'envoi : vérifie la clé API et le domaine"});
    return send(200,{sent:to.length});
  }
  if(path==='admin/data')return send(200,{products:await rd('products',[]),orders:(await rd('orders',[])).reverse().map(o=>({...o,name:users.find(u=>u.id===o.userId)?.name||''})),users:users.map(u=>({id:u.id,name:u.name,email:u.email,banned:u.banned})),shipping:(await rd('settings',{shipping:0})).shipping});
  if(path==='admin/product'){
    let ps=await rd('products',[]);
    if(b.del)ps=ps.filter(p=>p.id!==b.id);
    else{const p={id:b.id||uid(),name:String(b.name||'').slice(0,80),desc:String(b.desc||'').slice(0,400),price:Math.round(Number(b.price)*100)||0,image:String(b.image||''),sub:!!b.sub};
      if(!p.name||p.price<=0)return send(400,{error:'Nom et prix requis'});
      const i=ps.findIndex(x=>x.id===p.id);i<0?ps.push(p):ps[i]=p}
    await wr('products',ps);return send(200,{});
  }
  if(path==='admin/shipping'){await wr('settings',{shipping:Math.max(0,Math.round(Number(b.shipping)*100)||0)});return send(200,{})}
  if(path==='admin/upload'){const r=await put('img/'+uid()+'-'+String(b.name||'img').replace(/[^\w.-]/g,'_'),Buffer.from(b.data,'base64'),{access:'public',contentType:b.type||'image/jpeg'});return send(200,{url:r.url})}
  if(path==='admin/ban'){const u=users.find(x=>x.id===b.id);if(u&&u.email!==user.email){u.banned=!!b.banned;await wr('users',users)}return send(200,{})}
  if(path==='admin/order'){
    const orders=await rd('orders',[]),o=orders.find(x=>x.id===b.id);if(!o)return send(404,{error:'Commande introuvable'});
    const changed=o.status!==b.status||o.tracking!==b.tracking;o.status=b.status;o.tracking=String(b.tracking||'').slice(0,80);o.archived=o.status==='Livré';await wr('orders',orders);
    if(changed&&['Expédié','En cours de livraison','Livré'].includes(o.status))await mail(o.email,`Commande ${o.id} : ${o.status}`,`<p>Ta commande <b>${o.id}</b> est maintenant : <b>${esc(o.status)}</b>.</p>${o.tracking?`<p>Code de suivi : <b>${esc(o.tracking)}</b></p>`:''}`);
    return send(200,{});
  }
  if(path==='admin/order-delete'){const orders=await rd('orders',[]),o=orders.find(x=>x.id===b.id);if(!o||!o.archived)return send(400,{error:'Seules les commandes livrées (archivées) peuvent être supprimées'});await wr('orders',orders.filter(x=>x.id!==b.id));return send(200,{})}
  send(404,{error:'Introuvable'});
}
