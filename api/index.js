import {put,head} from '@vercel/blob';
import crypto from 'node:crypto';
import Stripe from 'stripe';
const E=process.env,P=`db-${E.DB_SECRET}/`;
const stripe=E.STRIPE_SECRET_KEY?new Stripe(E.STRIPE_SECRET_KEY):null;
const rd=async(n,d)=>{try{const b=await head(P+n+'.json');return await(await fetch(b.url+'?t='+Date.now(),{cache:'no-store'})).json()}catch{return d}};
const wr=(n,v)=>put(P+n+'.json',JSON.stringify(v),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
const sign=s=>crypto.createHmac('sha256',E.SESSION_SECRET).update(s).digest('base64url');
const hash=(pw,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(pw,salt,32).toString('hex');
const ok=(pw,h)=>{const a=Buffer.from(hash(pw,h.split(':')[0])),b=Buffer.from(h);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mail=(to,subject,html)=>fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to,subject,html})}).then(async r=>{if(!r.ok)console.error('Resend',r.status,await r.text());return r.ok}).catch(e=>{console.error('Resend',e);return false});
const uid=()=>crypto.randomBytes(6).toString('hex');

/* ===== Mails de maintenance ===== */
const MAIL_START={s:'Maintenance en cours sur DidjoTheSHOP',t:`Bonjour,
Nous vous informons qu'une maintenance est actuellement en cours sur DidjoTheSHOP.
Cette intervention a pour objectif d'améliorer nos services et de garantir une meilleure expérience d'utilisation. Durant cette période, certaines fonctionnalités du site peuvent être temporairement indisponibles.
Nous mettons tout en œuvre pour rétablir l'ensemble des services dans les meilleurs délais.
Nous vous remercions pour votre patience, votre compréhension et votre confiance.
L'équipe DidjoTheSHOP`};
const MAIL_END={s:'Maintenance terminée – DidjoTheSHOP est de nouveau disponible',t:`Bonjour,
Nous avons le plaisir de vous informer que la maintenance de DidjoTheSHOP est désormais terminée.
Tous nos services sont de nouveau disponibles et vous pouvez dès à présent utiliser le site normalement.
Cette maintenance nous a permis d'améliorer notre plateforme afin de vous offrir une expérience plus fiable, plus sécurisée et plus performante.
Nous vous remercions sincèrement pour votre patience, votre compréhension et votre confiance durant cette intervention.
Si vous rencontrez la moindre difficulté ou si vous avez une question, notre équipe reste à votre disposition.
Nous vous souhaitons une excellente expérience sur DidjoTheSHOP.
Cordialement,
L'équipe DidjoTheSHOP
📧 contact@teamdtk.fr`};
const mailAll=async(to,subject,text)=>{
  const html='<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#142033">'+text.split('\n').filter(l=>l.trim()).map(l=>`<p style="margin:0 0 12px">${esc(l)}</p>`).join('')+'</div>';
  let sent=0;
  for(let i=0;i<to.length;i+=100){
    const r=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(to.slice(i,i+100).map(e=>({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to:[e],subject,html})))});
    if(r.ok)sent+=Math.min(100,to.length-i);else console.error('Resend batch',r.status,await r.text());
    if(i+100<to.length)await new Promise(x=>setTimeout(x,600));
  }
  return sent;
};

/* ===== Application d'authentification (TOTP) ===== */
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc=buf=>{let bits=0,val=0,out='';for(const x of buf){val=(val<<8)|x;bits+=8;while(bits>=5){out+=B32[(val>>>(bits-5))&31];bits-=5}}if(bits>0)out+=B32[(val<<(5-bits))&31];return out};
const b32dec=s=>{let bits=0,val=0;const out=[];for(const c of String(s).replace(/=+$/,'').toUpperCase()){const i=B32.indexOf(c);if(i<0)continue;val=(val<<5)|i;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8}}return Buffer.from(out)};
const hotp=(secret,step)=>{const m=Buffer.alloc(8);m.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac('sha1',b32dec(secret)).update(m).digest();const o=h[19]&15;const n=((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(n%1000000).padStart(6,'0')};
const totpCheck=(secret,code,last=0)=>{if(!/^\d{6}$/.test(code))return 0;const now=Math.floor(Date.now()/3e4);for(let d=-1;d<=1;d++){const st=now+d;if(st>last&&hotp(secret,st)===code)return st}return 0};

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
  const pub=u=>({name:u.name,email:u.email,admin:u.email===(E.ADMIN_EMAIL||'').toLowerCase(),totp:!!u.totp,address:u.address||'',employee:!!u.employee});
  const issue=async u=>{
    if(u.code&&u.code.sent>Date.now()-3e4)return send(429,{error:'Attends 30 secondes avant de redemander un code'});
    const c=String(crypto.randomInt(0,1e6)).padStart(6,'0');
    u.code={h:sign('c'+u.id+c),exp:Date.now()+6e5,tries:0,sent:Date.now()};await wr('users',users);
    const sent=await mail(u.email,'Ton code de connexion DidjoTheSHOP',`<p>Ton code : <b style="font-size:20px;letter-spacing:3px">${c}</b></p><p>Il est valable 10 minutes. Si ce n'est pas toi, ignore ce mail.</p>`);
    return sent?send(200,{step:'code',email:u.email,method:'mail'}):send(502,{error:"Impossible d'envoyer le code, réessaie plus tard"});
  };
  const stripeCustomer=async u=>{if(!u.stripeId){const c=await stripe.customers.create({email:u.email,name:u.name,metadata:{userId:u.id}});u.stripeId=c.id;await wr('users',users)}return u.stripeId};
  const checkout=async(o,orders)=>{
    const mode=o.items.some(i=>i.sub)?'subscription':'payment';
    const line_items=o.items.map(i=>({quantity:i.qty,price_data:{currency:'eur',unit_amount:i.price,product_data:{name:i.virtual?i.name+' (virtuel, non remboursable)':i.name},...(i.sub?{recurring:{interval:'month'}}:{})}}));
    if(o.shipping>0)line_items.push({quantity:1,price_data:{currency:'eur',unit_amount:o.shipping,product_data:{name:'Livraison'}}});
    const params={ui_mode:'hosted_page',mode,customer:await stripeCustomer(user),client_reference_id:o.id,metadata:{orderId:o.id},line_items,success_url:origin+'/?session_id={CHECKOUT_SESSION_ID}#compte',cancel_url:origin+'/#compte',billing_address_collection:'required',phone_number_collection:{enabled:false},automatic_tax:{enabled:false},allow_promotion_codes:true,name_collection:{individual:{enabled:true,optional:true},business:{enabled:true,optional:true}},saved_payment_method_options:{payment_method_save:'enabled'},integration_identifier:'hosted_web_0001',origin_context:'web'};
    if(mode==='payment')params.submit_type='auto';else params.payment_method_collection='always';
    const s=await stripe.checkout.sessions.create(params);
    o.sessionId=s.id;await wr('orders',orders);return s.url;
  };

  /* ===== Mode maintenance ===== */
  const MT=await rd('maintenance',{on:false});
  if(path==='maintenance')return send(200,{on:!!MT.on});
  if(MT.on&&!admin&&!['me','logout','verify'].includes(path)){
    const admLogin=path==='login'&&String(b.email||'').trim().toLowerCase()===(E.ADMIN_EMAIL||'').toLowerCase();
    if(!admLogin)return send(503,{error:'Maintenance en cours : réessaie dans quelques instants',maintenance:true});
  }

  if(path.startsWith('admin/')&&!admin)return send(403,{error:'Accès refusé'});
  if(path==='products')return send(200,{products:await rd('products',[]),shipping:(await rd('settings',{shipping:0})).shipping});
  if(path==='me')return send(200,user?pub(user):null);
  if(path==='logout'){login('');return send(200,{})}
  if(path==='register'){
    const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim().slice(0,60);
    if(email===(E.ADMIN_EMAIL||'').toLowerCase())return send(403,{error:'Cette adresse est réservée'});
    if(!name||!/^\S+@\S+\.\S+$/.test(email)||String(b.password||'').length<8)return send(400,{error:'Nom, email valide et mot de passe de 8 caractères minimum requis'});
    if(users.some(u=>u.email===email))return send(409,{error:'Un compte existe déjà avec cet email'});
    const u={id:uid(),name,email,hash:hash(b.password),banned:false,created:Date.now()};
    users.push(u);return issue(u);
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
    u.fails=0;
    if(u.totp&&!b.mail){u.pend={exp:Date.now()+6e5,tries:0};await wr('users',users);return send(200,{step:'code',email:u.email,method:'totp'})}
    delete u.pend;return issue(u);
  }
  if(path==='verify'){
    const u=users.find(x=>x.email===String(b.email||'').trim().toLowerCase());
    const code=String(b.code||'').replace(/\s/g,'');
    if(u&&!u.banned&&u.totp&&u.pend&&u.pend.exp>Date.now()){
      const st=totpCheck(u.totp.secret,code,u.totp.last||0);
      if(!st){u.pend.tries++;if(u.pend.tries>=5)delete u.pend;await wr('users',users);return send(400,{error:'Code incorrect'})}
      u.totp.last=st;delete u.pend;u.verified=true;await wr('users',users);start(u);return send(200,pub(u));
    }
    if(!u||u.banned||!u.code||u.code.exp<Date.now())return send(400,{error:'Code expiré : reconnecte-toi pour en recevoir un nouveau'});
    const g=sign('c'+u.id+code);
    if(!crypto.timingSafeEqual(Buffer.from(g),Buffer.from(u.code.h))){u.code.tries++;if(u.code.tries>=5)delete u.code;await wr('users',users);return send(400,{error:'Code incorrect'})}
    delete u.code;delete u.pend;u.verified=true;await wr('users',users);start(u);return send(200,pub(u));
  }
  if(!user)return send(401,{error:'Connecte-toi pour continuer'});
  
  /* ===== Mes informations ===== */
  const pwCheck=async pw=>{
    if(user.lock>Date.now())return 'Trop de tentatives : réessaie dans quelques minutes';
    if(user.hash&&ok(String(pw||''),user.hash)){user.fails=0;return ''}
    user.fails=(user.fails||0)+1;if(user.fails>=5){user.lock=Date.now()+9e5;user.fails=0}
    await wr('users',users);return 'Mot de passe incorrect';
  };
  if(path==='profile'){
    const name=String(b.name||'').trim().slice(0,60);
    if(!name)return send(400,{error:'Le nom est requis'});
    user.name=name;user.address=String(b.address||'').trim().slice(0,400);
    await wr('users',users);return send(200,pub(user));
  }
  if(path==='password'){
    if(admin)return send(400,{error:'Le mot de passe admin se change dans les variables Vercel (ADMIN_PASSWORD)'});
    const er=await pwCheck(b.current);if(er)return send(401,{error:er});
    if(String(b.next||'').length<8)return send(400,{error:'Le nouveau mot de passe doit faire 8 caractères minimum'});
    user.hash=hash(String(b.next));await wr('users',users);return send(200,{});
  }
  if(path==='email/change'){
    if(admin)return send(400,{error:"L'adresse du compte administrateur ne peut pas être changée"});
    const em=String(b.email||'').trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(em))return send(400,{error:'Adresse e-mail invalide'});
    if(em===(E.ADMIN_EMAIL||'').toLowerCase()||users.some(u=>u.email===em))return send(409,{error:'Cette adresse est déjà utilisée'});
    const er=await pwCheck(b.password);if(er)return send(401,{error:er});
    if(user.emailChange&&user.emailChange.sent>Date.now()-3e4)return send(429,{error:'Attends 30 secondes avant de redemander un code'});
    const c=String(crypto.randomInt(0,1e6)).padStart(6,'0');
    user.emailChange={email:em,h:sign('e'+user.id+em+c),exp:Date.now()+6e5,tries:0,sent:Date.now()};await wr('users',users);
    const sent=await mail(em,'Confirme ta nouvelle adresse DidjoTheSHOP',`<p>Ton code : <b style="font-size:20px;letter-spacing:3px">${c}</b></p><p>Il est valable 10 minutes. Si ce n'est pas toi, ignore ce mail.</p>`);
    return sent?send(200,{}):send(502,{error:"Impossible d'envoyer le code, réessaie plus tard"});
  }
  if(path==='email/confirm'){
    const c=user.emailChange,code=String(b.code||'').replace(/\s/g,'');
    if(!c||c.exp<Date.now())return send(400,{error:'Code expiré : recommence le changement d\'adresse'});
    if(!crypto.timingSafeEqual(Buffer.from(sign('e'+user.id+c.email+code)),Buffer.from(c.h))){c.tries++;if(c.tries>=5)delete user.emailChange;await wr('users',users);return send(400,{error:'Code incorrect'})}
    if(users.some(u=>u.email===c.email&&u.id!==user.id))return send(409,{error:'Cette adresse est déjà utilisée'});
    user.email=c.email;delete user.emailChange;await wr('users',users);
    if(stripe&&user.stripeId){try{await stripe.customers.update(user.stripeId,{email:user.email})}catch(e){console.error('Stripe email',e.message)}}
    return send(200,pub(user));
  }

  if(path==='totp/setup'){
    if(user.totp)return send(400,{error:"L'application d'authentification est déjà activée"});
    const secret=b32enc(crypto.randomBytes(20));user.totpTmp=secret;await wr('users',users);
    const uri='otpauth://totp/DidjoTheSHOP:'+encodeURIComponent(user.email)+'?secret='+secret+'&issuer=DidjoTheSHOP&algorithm=SHA1&digits=6&period=30';
    return send(200,{secret,uri});
  }
  if(path==='totp/enable'){
    if(!user.totpTmp)return send(400,{error:'Recommence : clique sur « Activer » pour générer une nouvelle clé'});
    const st=totpCheck(user.totpTmp,String(b.code||'').replace(/\s/g,''));
    if(!st)return send(400,{error:'Code incorrect. Vérifie l\'heure de ton téléphone et réessaie'});
    user.totp={secret:user.totpTmp,last:st};delete user.totpTmp;await wr('users',users);return send(200,pub(user));
  }
  if(path==='totp/disable'){
    if(!user.totp)return send(400,{error:"L'application d'authentification n'est pas activée"});
    const st=totpCheck(user.totp.secret,String(b.code||'').replace(/\s/g,''),user.totp.last||0);
    if(!st)return send(400,{error:'Code incorrect'});
    delete user.totp;delete user.pend;await wr('users',users);return send(200,pub(user));
  }
  if(path==='orders')return send(200,(await rd('orders',[])).filter(o=>o.userId===user.id&&!o.archived).reverse());
  if(path==='order'){
    const prods=await rd('products',[]),{shipping}=await rd('settings',{shipping:0});
    const items=(b.items||[]).map(i=>{const p=prods.find(x=>x.id===i.id);return p&&{id:p.id,name:p.name,price:p.price,sub:!!p.sub,virtual:!!p.virtual,qty:Math.min(99,Math.max(1,i.qty|0))}}).filter(Boolean);
    const hasReal=items.some(i=>!i.virtual),hasVirt=items.some(i=>i.virtual),ship=hasReal?shipping:0;
    if(!items.length||(hasReal&&String(b.address||'').trim().length<10))return send(400,{error:'Panier vide ou adresse incomplète'});
    if(hasVirt&&b.acceptVirtual!==true)return send(400,{error:'Tu dois accepter que les articles virtuels ne sont pas remboursables'});
    const o={id:'DJ'+uid().toUpperCase(),userId:user.id,email:user.email,items,shipping:ship,total:items.reduce((a,i)=>a+i.price*i.qty,0)+ship,address:String(b.address||'').slice(0,400),status:'En préparation',tracking:'',paid:false,date:Date.now(),virtualConsent:hasVirt?Date.now():0};
    const orders=await rd('orders',[]);orders.push(o);await wr('orders',orders);
    await mail(user.email,`Commande ${o.id} enregistrée`,`<p>Bonjour ${esc(user.name)}, ta commande <b>${o.id}</b> est enregistrée (${(o.total/100).toFixed(2)} €).</p>`);
    let url=null;
    if(stripe){try{url=await checkout(o,orders)}catch(e){console.error('Stripe',e.message)}}
    return send(200,{...o,url});
  }
  if(path==='cards'){
    if(!stripe||!user.stripeId)return send(200,[]);
    try{const l=await stripe.paymentMethods.list({customer:user.stripeId,type:'card',limit:10});return send(200,l.data.map(p=>({brand:p.card.brand,last4:p.card.last4})))}catch{return send(200,[])}
  }
  if(path==='portal'){
    if(!stripe)return send(500,{error:'STRIPE_SECRET_KEY manquant dans les variables Vercel'});
    try{
      const par={customer:await stripeCustomer(user),return_url:origin+'/#compte'};
      if(b.flow==='payment_method')par.flow_data={type:'payment_method_update'};
      const s=await stripe.billingPortal.sessions.create(par);
      return send(200,{url:s.url});
    }catch(e){console.error('Portail',e.message);return send(500,{error:"Portail Stripe indisponible : dans Stripe, active le portail client (Paramètres > Facturation > Portail client) et autorise la mise à jour des moyens de paiement"})}
  }
  if(path==='pay'||path==='pay/confirm'){
    if(!stripe)return send(500,{error:'STRIPE_SECRET_KEY manquant dans les variables Vercel'});
    let orders,o;for(let i=0;i<4;i++){orders=await rd('orders',[]);o=orders.find(x=>x.id===b.orderId&&x.userId===user.id);if(o)break;await new Promise(r=>setTimeout(r,1200))}
    if(!o)return send(404,{error:'Commande introuvable'});
    if(o.paid)return send(200,{paid:true});
    if(path==='pay')return send(200,{url:await checkout(o,orders)});
    const s=o.sessionId?await stripe.checkout.sessions.retrieve(o.sessionId):null;
    if(s&&s.payment_status==='paid'&&s.client_reference_id===o.id){o.paid=true;o.paidAmount=s.amount_total;await wr('orders',orders);await mail(user.email,`Paiement reçu pour la commande ${o.id}`,`<p>Merci ! Le paiement pour la commande <b>${o.id}</b> est bien reçu.</p>`);return send(200,{paid:true})}
    return send(200,{paid:false});
  }
  
  /* ===== ADMIN ===== */
  if(path==='admin/maintenance'){
    const on=!!b.on;
    if(!!MT.on===on)return send(200,{on,sent:0,total:0,unchanged:true});
    await wr('maintenance',{on,at:Date.now()});
    const m=on?MAIL_START:MAIL_END;
    const to=[...new Set(users.filter(u=>!u.banned&&u.email).map(u=>u.email))];
    const sent=await mailAll(to,m.s,m.t);
    return send(200,{on,sent,total:to.length});
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
  if(path==='admin/data')return send(200,{products:await rd('products',[]),orders:(await rd('orders',[])).reverse().map(o=>({...o,name:users.find(u=>u.id===o.userId)?.name||''})),users:users.map(u=>({id:u.id,name:u.name,email:u.email,banned:u.banned,employee:!!u.employee})),shipping:(await rd('settings',{shipping:0})).shipping});
  
  if(path==='admin/user-create'){
    const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim().slice(0,60);
    if(!name||!/^\S+@\S+\.\S+$/.test(email)||String(b.password||'').length<8)return send(400,{error:'Nom, email valide et mot de passe de 8 caractères minimum requis'});
    if(users.some(u=>u.email===email))return send(409,{error:'Un compte existe déjà avec cet email'});
    const u={id:uid(),name,email,hash:hash(b.password),banned:false,created:Date.now(),employee:true,verified:true};
    users.push(u);await wr('users',users);
    return send(200,{name:u.name,email:u.email,password:b.password});
  }
  
  if(path==='admin/product'){
    let ps=await rd('products',[]);
    if(b.del)ps=ps.filter(p=>p.id!==b.id);
    else{const old=ps.find(x=>x.id===b.id);
      const p={id:b.id||uid(),name:String(b.name||'').slice(0,80),desc:String(b.desc||'').slice(0,400),price:Math.round(Number(b.price)*100)||0,image:String(b.image||''),sub:!!b.sub,virtual:b.virtual===undefined?!!(old&&old.virtual):!!b.virtual};
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
  /* ... tout le code précédent reste identique ... */

  if(path==='admin/order-delete'){const orders=await rd('orders',[]),o=orders.find(x=>x.id===b.id);if(!o||!o.archived)return send(400,{error:'Seules les commandes livrées (archivées) peuvent être supprimées'});await wr('orders',orders.filter(x=>x.id!==b.id));return send(200,{})}
  
  /* ===== Route Publique Employés ===== */
  if(path==='employees'){
      // Renvoie uniquement les utilisateurs marqués comme employés
      const employees = users.filter(u=>u.employee && !u.banned).map(u=>({name:u.name, email:u.email}));
      return send(200, employees);
  }

  send(404,{error:'Introuvable'});
}
