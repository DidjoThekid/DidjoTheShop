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

/* ---------- Helpers partagés ---------- */
const TAGS=['p','br','div','span','b','strong','i','em','u','s','strike','h1','h2','h3','ul','ol','li','a','blockquote','hr','font'];
const clean=h=>String(h||'').slice(0,30000).replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi,(m,sl,t,a)=>{t=t.toLowerCase();if(!TAGS.includes(t))return '';if(sl)return '</'+t+'>';let o='';if(t==='a'){const x=/href\s*=\s*"(https?:\/\/[^"\s]*|mailto:[^"\s]*)"/i.exec(a);if(x)o=' href="'+x[1]+'"'}if(t==='font'){const c=/color\s*=\s*"(#[0-9a-f]{3,8})"/i.exec(a);if(c)o+=' color="'+c[1]+'"';const z=/size\s*=\s*"([1-7])"/i.exec(a);if(z)o+=' size="'+z[1]+'"'}const al=/(?:text-align:\s*|align\s*=\s*"?)(left|center|right|justify)/i.exec(a);if(al)o+=' style="text-align:'+al[1].toLowerCase()+'"';return '<'+t+o+(t==='br'||t==='hr'?'/':'')+'>'});
const text=h=>String(h||'').replace(/<[^>]*>/g,'').trim();
const addr=s=>(String(s||'').match(/[^\s<>&;"',]+@[^\s<>&;"',]+/)||[''])[0];
const collabOf=c=>{
  if(c===undefined)return{skip:1};
  if(!c)return{v:null};
  const v={brand:String(c.brand||'').trim().slice(0,80),logo:String(c.logo||'').trim().slice(0,500),email:String(c.email||'').trim().slice(0,120)};
  if(!v.brand)return{err:'Nom de la marque requis pour une collaboration'};
  if(!/^https:\/\//.test(v.logo))return{err:'Logo de la marque requis pour une collaboration'};
  if(v.email&&!/^\S+@\S+\.\S+$/.test(v.email))return{err:'Adresse mail de la marque invalide'};
  return{v};
};
const pubP=p=>{if(!p||!p.collab)return p;const{email,...c}=p.collab;return{...p,collab:c}};

/* ---------- Zoho Mail (API officielle, OAuth) ---------- */
const ZDC=E.ZOHO_DC||'eu';
const ZT={t:'',exp:0,acc:E.ZOHO_ACCOUNT_ID||''};
const ztoken=async()=>{
  if(ZT.t&&ZT.exp>Date.now()+6e4)return ZT.t;
  if(!E.ZOHO_CLIENT_ID||!E.ZOHO_CLIENT_SECRET||!E.ZOHO_REFRESH_TOKEN)throw new Error('Zoho non configuré : ajoute ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET et ZOHO_REFRESH_TOKEN dans les variables Vercel');
  const r=await fetch(`https://accounts.zoho.${ZDC}/oauth/v2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({refresh_token:E.ZOHO_REFRESH_TOKEN,client_id:E.ZOHO_CLIENT_ID,client_secret:E.ZOHO_CLIENT_SECRET,grant_type:'refresh_token'})});
  const j=await r.json().catch(()=>({}));
  if(!j.access_token)throw new Error('Zoho a refusé la connexion ('+(j.error||r.status)+') : vérifie les variables et ZOHO_DC (centre de données)');
  ZT.t=j.access_token;ZT.exp=Date.now()+(j.expires_in||3600)*1000;return ZT.t;
};
const zoho=async(method,p,body,retry=1)=>{
  const t=await ztoken();
  const r=await fetch(`https://mail.zoho.${ZDC}/api/`+p,{method,headers:{Authorization:'Zoho-oauthtoken '+t,'Content-Type':'application/json',Accept:'application/json'},body:body?JSON.stringify(body):undefined});
  if(r.status===401&&retry){ZT.t='';return zoho(method,p,body,0)}
  const j=await r.json().catch(()=>({}));
  if(!r.ok){console.error('Zoho',r.status,JSON.stringify(j));throw new Error('Zoho a répondu une erreur : '+(j.data?.moreInfo||j.data?.errorCode||j.status?.description||r.status))}
  return j;
};
const zacc=async()=>{
  if(!ZT.acc){const j=await zoho('GET','accounts');ZT.acc=String(j.data?.[0]?.accountId||'');if(!ZT.acc)throw new Error('Aucun compte Zoho Mail trouvé')}
  return ZT.acc;
};

const MAIL_START={s:'Maintenance en cours sur DidjoTheSHOP',t:`Bonjour,\nNous vous informons qu'une maintenance est actuellement en cours sur DidjoTheSHOP.\nCette intervention a pour objectif d'améliorer nos services et de garantir une meilleure expérience d'utilisation. Durant cette période, certaines fonctionnalités du site peuvent être temporairement indisponibles.\nNous mettons tout en œuvre pour rétablir l'ensemble des services dans les meilleurs délais.\nNous vous remercions pour votre patience, votre compréhension et votre confiance.\nL'équipe DidjoTheSHOP`};
const MAIL_END={s:'Maintenance terminée – DidjoTheSHOP est de nouveau disponible',t:`Bonjour,\nNous avons le plaisir de vous informer que la maintenance de DidjoTheSHOP est désormais terminée.\nTous nos services sont de nouveau disponibles et vous pouvez dès à présent utiliser le site normalement.\nCette maintenance nous a permis d'améliorer notre plateforme afin de vous offrir une expérience plus fiable, plus sécurisée et plus performante.\nNous vous remercions sincèrement pour votre patience, votre compréhension et votre confiance durant cette intervention.\nSi vous rencontrez la moindre difficulté ou si vous avez une question, notre équipe reste à votre disposition.\nNous vous souhaitons une excellente expérience sur DidjoTheSHOP.\nCordialement,\nL'équipe DidjoTheSHOP\n📧 contact@teamdtk.fr`};
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

const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc=buf=>{let bits=0,val=0,out='';for(const x of buf){val=(val<<8)|x;bits+=8;while(bits>=5){out+=B32[(val>>>(bits-5))&31];bits-=5}}if(bits>0)out+=B32[(val<<(5-bits))&31];return out};
const b32dec=s=>{let bits=0,val=0;const out=[];for(const c of String(s).replace(/=+$/,'').toUpperCase()){const i=B32.indexOf(c);if(i<0)continue;val=(val<<5)|i;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8}}return Buffer.from(out)};
const hotp=(secret,step)=>{const m=Buffer.alloc(8);m.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac('sha1',b32dec(secret)).update(m).digest();const o=h[19]&15;const n=((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(n%1000000).padStart(6,'0')};
const totpCheck=(secret,code,last=0)=>{if(!/^\d{6}$/.test(code))return 0;const now=Math.floor(Date.now()/3e4);for(let d=-1;d<=1;d++){const st=now+d;if(st>last&&hotp(secret,st)===code)return st}return 0};

/* Actions d'employés qui doivent être validées par l'admin principal */
const EMP_OK=['admin/data','admin/upload','admin/requests','admin/mail/','admin/product','admin/mail-html','admin/order','admin/shipping'];
const precheck=(p,b)=>{
  if(p==='admin/product'&&!b.del){if(!String(b.name||'').trim()||!(Number(b.price)>0))return 'Nom et prix requis';const c=collabOf(b.collab);if(c.err)return c.err}
  if(p==='admin/mail-html'&&(!String(b.subject||'').trim()||!text(clean(b.html))))return 'Objet et message requis';
  if(p==='admin/mail/send'&&(!addr(b.to)||!String(b.subject||'').trim()||!text(clean(b.html))))return 'Destinataire, objet et message requis';
  if(p==='admin/mail/delete'&&!(/^\d+$/.test(String(b.folder))&&/^\d+$/.test(String(b.id))))return 'Message invalide';
  return '';
};
const labelOf=(p,b,nm)=>({
  'admin/product':b.del?`Suppression de l'article « ${nm||b.id} »`:b.id?`Modification de l'article « ${String(b.name||nm||'').slice(0,60)} »`:`Ajout de l'article « ${String(b.name||'').slice(0,60)} »`,
  'admin/mail-html':`Envoi d'un mail à ${b.other||(b.to==='all'||!b.to?'tous les clients':b.to)} : ${String(b.subject||'').slice(0,80)}`,
  'admin/mail/send':`Mail (boîte Zoho) à ${addr(b.to)} : ${String(b.subject||'').slice(0,80)}`,
  'admin/mail/delete':'Suppression d\'un mail de la boîte Zoho',
  'admin/order':`Commande ${b.id} → ${b.status}${b.tracking?' (suivi '+String(b.tracking).slice(0,40)+')':''}`,
  'admin/shipping':`Frais de livraison → ${b.shipping} €`
}[p]||p);

export default async function h(req,res){try{return await main(req,res)}catch(e){console.error(e);return res.status(500).json({error:'Erreur serveur : '+e.message})}}
async function main(req,res){
  const path=new URL(req.url,'http://x').pathname.replace(/^\/api\//,'').replace(/\/$/,'');
  const qs=new URL(req.url,'http://x').searchParams;
  const b=req.body||{},send=(c,o)=>res.status(c).json(o);const origin='https://'+(req.headers['x-forwarded-host']||req.headers.host);
  const login=u=>res.setHeader('Set-Cookie',`s=${u};HttpOnly;Secure;SameSite=Lax;Path=/;Max-Age=2592000`);
  const users=await rd('users',[]);
  let user=null;const ck=(req.headers.cookie||'').match(/s=([^;]+)/)?.[1];
  if(ck){const[p,g]=ck.split('.');if(g&&g===sign(p)){try{const t=JSON.parse(Buffer.from(p,'base64url'));if(t.exp>Date.now())user=users.find(u=>u.id===t.id&&!u.banned)||null}catch{}}}
  const admin=!!user&&user.email===(E.ADMIN_EMAIL||'').toLowerCase();
  const emp=!!user&&!admin&&!!user.employee,staff=admin||emp;
  const start=u=>{const p=Buffer.from(JSON.stringify({id:u.id,exp:Date.now()+2592e6})).toString('base64url');login(p+'.'+sign(p))};
  const pub=u=>({name:u.name,email:u.email,admin:u.email===(E.ADMIN_EMAIL||'').toLowerCase(),totp:!!u.totp,address:u.address||'',employee:!!u.employee,unsubscribed:!!u.unsubscribed,seller:u.seller?{status:u.seller.status,shop:u.seller.shop}:null});
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
  const payout=async o=>{
    const pct=Number(E.COMMISSION_PCT||10),by={};
    for(const i of o.items)if(i.sellerId&&!i.sub)by[i.sellerId]=(by[i.sellerId]||0)+i.price*i.qty;
    const s=await stripe.checkout.sessions.retrieve(o.sessionId),pi=await stripe.paymentIntents.retrieve(s.payment_intent);let all=true;
    for(const[sid,amt]of Object.entries(by)){const u=users.find(x=>x.id===sid),net=Math.floor(amt*(100-pct)/100);if(!u||!u.seller||!u.seller.stripeId||net<=0)continue;
      try{await stripe.transfers.create({amount:net,currency:'eur',destination:u.seller.stripeId,transfer_group:o.id,source_transaction:pi.latest_charge,metadata:{orderId:o.id,sellerId:sid}},{idempotencyKey:'tr-'+o.id+'-'+sid})}catch(e){all=false;console.error('Transfert',e.message)}}
    if(all)o.transferred=true;
  };

  /* Actions sensibles : l'admin les exécute, un employé les soumet à validation */
  const GATED={
    'admin/product':async b=>{
      let ps=await rd('products',[]);
      if(b.del)ps=ps.filter(p=>p.id!==b.id);
      else{const old=ps.find(x=>x.id===b.id)||{};
        const imgs=Array.isArray(b.images)?b.images.map(String).filter(Boolean).slice(0,10):(old.images||[]);
        const c=collabOf(b.collab);if(c.err)return[400,{error:c.err}];
        const p={...old,id:b.id||uid(),name:String(b.name||'').slice(0,80),desc:String(b.desc||'').slice(0,2000),price:Math.round(Number(b.price)*100)||0,image:imgs[0]||String(b.image||old.image||''),images:imgs,sub:!!b.sub,virtual:b.virtual===undefined?!!old.virtual:!!b.virtual};
        if(!c.skip){if(c.v)p.collab=c.v;else delete p.collab}
        if(!p.name||p.price<=0)return[400,{error:'Nom et prix requis'}];
        const i=ps.findIndex(x=>x.id===p.id);i<0?ps.push(p):ps[i]=p;b.id=p.id}
      await wr('products',ps);return[200,{id:b.id}];
    },
    'admin/mail-html':async b=>{
      const subject=String(b.subject||'').trim().slice(0,150),body=clean(b.html);
      if(!subject||!text(body))return[400,{error:'Objet et message requis'}];
      const one=String(b.other||'').trim().toLowerCase()||(b.to==='all'?'':String(b.to||'').trim().toLowerCase());
      const eligible=users.filter(u=>!u.banned&&!u.unsubscribed);
      const to=one?[one]:eligible.map(u=>u.email).slice(0,100);
      if(!to.length||to.some(e=>!/^\S+@\S+\.\S+$/.test(e)))return[400,{error:'Destinataire invalide'}];
      const html='<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#142033">'+body+'</div>';
      const r=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(to.map(e=>({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to:[e],subject,html})))});
      if(!r.ok)return[502,{error:"Resend a refusé l'envoi : vérifie la clé API et le domaine"}];
      return[200,{sent:to.length}];
    },
    'admin/order':async b=>{
      const orders=await rd('orders',[]),o=orders.find(x=>x.id===b.id);if(!o)return[404,{error:'Commande introuvable'}];
      const changed=o.status!==b.status||o.tracking!==b.tracking;o.status=b.status;o.tracking=String(b.tracking||'').slice(0,80);o.archived=o.status==='Livré';await wr('orders',orders);
      if(changed&&['Expédié','En cours de livraison','Livré'].includes(o.status))await mail(o.email,`Commande ${o.id} : ${o.status}`,`<p>Ta commande <b>${o.id}</b> est maintenant : <b>${esc(o.status)}</b>.</p>${o.tracking?`<p>Code de suivi : <b>${esc(o.tracking)}</b></p>`:''}`);
      return[200,{}];
    },
    'admin/shipping':async b=>{await wr('settings',{shipping:Math.max(0,Math.round(Number(b.shipping)*100)||0)});return[200,{}]},
    'admin/mail/send':async b=>{
      const to=addr(b.to),subject=String(b.subject||'').trim().slice(0,200),html=clean(b.html);
      if(!to||!subject||!text(html))return[400,{error:'Destinataire, objet et message requis'}];
      const a=await zacc();
      const body={fromAddress:E.ZOHO_FROM||'contact@teamdtk.fr',toAddress:to,subject,content:'<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">'+html+'</div>',mailFormat:'html'};
      const rid=b.replyTo&&/^\d+$/.test(String(b.replyTo.id))?String(b.replyTo.id):'';
      if(rid){try{await zoho('POST',`accounts/${a}/messages/${rid}`,{...body,action:'reply'});return[200,{sent:true}]}catch(e){console.error('Zoho reply -> envoi simple',e.message)}}
      await zoho('POST',`accounts/${a}/messages`,body);
      return[200,{sent:true}];
    },
    'admin/mail/delete':async b=>{
      const f=String(b.folder),id=String(b.id);
      if(!/^\d+$/.test(f)||!/^\d+$/.test(id))return[400,{error:'Message invalide'}];
      const a=await zacc();await zoho('DELETE',`accounts/${a}/folders/${f}/messages/${id}`);
      return[200,{}];
    }
  };

  const MT=await rd('maintenance',{on:false});
  if(path==='maintenance')return send(200,{on:!!MT.on});
  if(MT.on&&!admin&&!['me','logout','verify'].includes(path)){
    const admLogin=path==='login'&&String(b.email||'').trim().toLowerCase()===(E.ADMIN_EMAIL||'').toLowerCase();
    if(!admLogin)return send(503,{error:'Maintenance en cours : réessaie dans quelques instants',maintenance:true});
  }

  if(path.startsWith('admin/')){
    if(!staff)return send(403,{error:'Accès refusé'});
    if(emp&&!EMP_OK.some(x=>path===x||(x.endsWith('/')&&path.startsWith(x))))return send(403,{error:"Action réservée à l'administrateur principal"});
    const G=GATED[path];
    if(G){
      if(admin){const[c,o]=await G(b);return send(c,o)}
      const er=precheck(path,b);if(er)return send(400,{error:er});
      const pl=b.html!==undefined?{...b,html:clean(b.html)}:b;
      if(JSON.stringify(pl).length>80000)return send(400,{error:'Demande trop volumineuse'});
      let nm='';if(path==='admin/product'&&b.id)nm=((await rd('products',[])).find(x=>x.id===b.id)||{}).name||'';
      const rs=await rd('requests',[]);
      const r={id:'RQ'+uid().toUpperCase(),by:user.id,byName:user.name,byEmail:user.email,path,label:labelOf(path,pl,nm),payload:pl,status:'pending',date:Date.now()};
      rs.push(r);await wr('requests',rs.slice(-300));
      await mail(E.ADMIN_EMAIL,'Validation requise : '+r.label,`<p><b>${esc(user.name)}</b> (${esc(user.email)}) demande :</p><p><b>${esc(r.label)}</b></p><p><a href="${origin}/admin#validations">Accepter ou refuser dans le panel admin</a></p>`);
      return send(200,{pending:true,id:r.id});
    }
  }

  if(path==='products')return send(200,{products:(await rd('products',[])).map(pubP),shipping:(await rd('settings',{shipping:0})).shipping});
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
  if(path==='employees')return send(200,users.filter(u=>u.employee&&!u.banned).map(u=>({name:u.name,email:u.email})));
  if(path==='product'){const id=qs.get('id');const p=(await rd('products',[])).find(x=>x.id===id);if(!p)return send(404,{error:'Article introuvable'});const s=p.sellerId&&users.find(u=>u.id===p.sellerId);return send(200,{...pubP(p),seller:s&&s.seller?s.seller.shop:''})}
  if(path==='set-password'){
    const t=String(b.token||''),u=users.find(x=>x.invite&&x.invite.h===sign('i'+t));
    if(!t||!u||u.invite.exp<Date.now())return send(400,{error:"Lien invalide ou expiré : demande un nouveau mail à l'administrateur"});
    if(String(b.password||'').length<8)return send(400,{error:'8 caractères minimum'});
    u.hash=hash(String(b.password));delete u.invite;u.verified=true;await wr('users',users);return send(200,{});
  }
  if(!user)return send(401,{error:'Connecte-toi pour continuer'});

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
    if(b.unsubscribed!==undefined) user.unsubscribed=!!b.unsubscribed;
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
    const items=(b.items||[]).map(i=>{const p=prods.find(x=>x.id===i.id);return p&&{id:p.id,name:p.name,price:p.price,sub:!!p.sub,virtual:!!p.virtual,sellerId:p.sellerId||'',qty:Math.min(99,Math.max(1,i.qty|0))}}).filter(Boolean);
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
    if(o.paid){if(!o.transferred&&o.sessionId){await payout(o).catch(e=>console.error('Payout',e.message));await wr('orders',orders)}return send(200,{paid:true})}
    if(path==='pay')return send(200,{url:await checkout(o,orders)});
    const s=o.sessionId?await stripe.checkout.sessions.retrieve(o.sessionId):null;
    if(s&&s.payment_status==='paid'&&s.client_reference_id===o.id){o.paid=true;o.paidAmount=s.amount_total;await payout(o).catch(e=>console.error('Payout',e.message));await wr('orders',orders);await mail(user.email,`Paiement reçu pour la commande ${o.id}`,`<p>Merci ! Le paiement pour la commande <b>${o.id}</b> est bien reçu.</p>`);return send(200,{paid:true})}
    return send(200,{paid:false});
  }

  /* ---------- Panel admin / employés ---------- */
  if(path==='admin/data')return send(200,{role:admin?'admin':'employee',zoho:!!(E.ZOHO_CLIENT_ID&&E.ZOHO_REFRESH_TOKEN),products:await rd('products',[]),orders:(await rd('orders',[])).reverse().map(o=>({...o,name:users.find(u=>u.id===o.userId)?.name||''})),users:users.map(u=>({id:u.id,name:u.name,email:u.email,banned:u.banned,employee:!!u.employee,unsubscribed:!!u.unsubscribed,seller:u.seller?{status:u.seller.status,shop:u.seller.shop,type:u.seller.type,siret:admin?u.seller.siret:'',desc:admin?u.seller.desc:''}:null})),shipping:(await rd('settings',{shipping:0})).shipping});

  if(path==='admin/requests'){
    const rs=(await rd('requests',[])).slice().reverse();
    return send(200,admin?rs.slice(0,150):rs.filter(r=>r.by===user.id).slice(0,50).map(({payload,...r})=>r));
  }
  if(path==='admin/request-decide'){
    if(!admin)return send(403,{error:"Action réservée à l'administrateur principal"});
    const rs=await rd('requests',[]),r=rs.find(x=>x.id===b.id);
    if(!r||r.status!=='pending')return send(404,{error:'Demande introuvable ou déjà traitée'});
    const who=users.find(u=>u.id===r.by);
    if(b.approve){
      try{const[c,o]=await GATED[r.path](r.payload);if(c>=400)throw new Error(o.error||'Erreur')}
      catch(e){return send(500,{error:"L'action n'a pas pu être exécutée : "+e.message+' (la demande reste en attente)'})}
      r.status='approved';
    }else{r.status='rejected';r.reason=String(b.reason||'').slice(0,300)}
    r.done=Date.now();await wr('requests',rs);
    if(who)await mail(who.email,r.status==='approved'?'Demande acceptée':'Demande refusée',`<p>${r.status==='approved'?'Ta demande a été <b>acceptée</b> et exécutée':'Ta demande a été <b>refusée</b>'} :</p><p><b>${esc(r.label)}</b></p>${r.reason?`<p>Motif : ${esc(r.reason)}</p>`:''}`);
    return send(200,{});
  }

  /* Boîte mail Zoho (lecture) */
  if(path==='admin/mail/folders'){
    const a=await zacc(),j=await zoho('GET',`accounts/${a}/folders`);
    return send(200,(j.data||[]).map(f=>({id:String(f.folderId),name:f.folderName,type:f.folderType||'',unread:Number(f.unreadCount)||0})));
  }
  if(path==='admin/mail/list'){
    const f=String(qs.get('folder')||''),s=Math.max(1,parseInt(qs.get('start'))||1);
    if(!/^\d+$/.test(f))return send(400,{error:'Dossier invalide'});
    const a=await zacc(),j=await zoho('GET',`accounts/${a}/messages/view?folderId=${f}&start=${s}&limit=40&sortBy=date&sortorder=false`);
    return send(200,{messages:(j.data||[]).map(m=>({id:String(m.messageId),folder:String(m.folderId||f),from:addr(m.fromAddress)||String(m.fromAddress||''),name:String(m.sender||''),to:String(m.toAddress||''),subject:String(m.subject||'(sans objet)'),summary:String(m.summary||''),time:Number(m.receivedTime)||0,unread:String(m.status)==='0',att:String(m.hasAttachment)==='1'}))});
  }
  if(path==='admin/mail/read'){
    const f=String(qs.get('folder')||''),id=String(qs.get('id')||'');
    if(!/^\d+$/.test(f)||!/^\d+$/.test(id))return send(400,{error:'Message invalide'});
    const a=await zacc(),j=await zoho('GET',`accounts/${a}/folders/${f}/messages/${id}/content`);
    zoho('PUT',`accounts/${a}/updatemessage`,{mode:'markAsRead',messageId:[id]}).catch(e=>console.error('Zoho markAsRead',e.message));
    return send(200,{html:String(j.data?.content||'')});
  }

  if(path==='admin/maintenance'){
    const on=!!b.on;
    if(!!MT.on===on)return send(200,{on,sent:0,total:0,unchanged:true});
    await wr('maintenance',{on,at:Date.now()});
    const m=on?MAIL_START:MAIL_END;
    const to=[...new Set(users.filter(u=>!u.banned && !u.unsubscribed && u.email).map(u=>u.email))];
    const sent=await mailAll(to,m.s,m.t);
    return send(200,{on,sent,total:to.length});
  }
  if(path==='admin/user-create'){
    const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim().slice(0,60);
    if(!name||!/^\S+@\S+\.\S+$/.test(email))return send(400,{error:'Nom et email valide requis'});
    if(users.some(u=>u.email===email))return send(409,{error:'Un compte existe déjà avec cet email'});
    const tok=crypto.randomBytes(32).toString('base64url');
    users.push({id:uid(),name,email,hash:hash(crypto.randomBytes(24).toString('hex')),banned:false,created:Date.now(),employee:true,verified:true,invite:{h:sign('i'+tok),exp:Date.now()+1728e5}});
    await wr('users',users);
    const sent=await mail(email,'Bienvenue dans la Team DTK : choisis ton mot de passe',`<p>Bonjour ${esc(name)}, un compte employé DidjoTheSHOP vient d'être créé pour toi.</p><p><a href="${origin}/set-password.html?t=${tok}">Choisir mon mot de passe</a> (lien valable 48 h)</p>`);
    return send(200,{name,email,sent});
  }
  if(path==='admin/user-update'){
    const u=users.find(x=>x.id===b.id);
    if(!u)return send(404,{error:'Utilisateur introuvable'});
    if(b.employee!==undefined) u.employee=!!b.employee;
    await wr('users',users);
    return send(200,{});
  }
  if(path==='admin/user-delete'){
    const uIndex = users.findIndex(x=>x.id===b.id);
    if(uIndex < 0) return send(404,{error:'Utilisateur introuvable'});
    const u = users[uIndex];
    if(u.email === (E.ADMIN_EMAIL||'').toLowerCase()) return send(403,{error:'Impossible de supprimer le compte administrateur principal'});
    users.splice(uIndex, 1);
    await wr('users',users);
    return send(200,{});
  }
  if(path==='admin/seller'){
    const u=users.find(x=>x.id===b.id);if(!u||!u.seller)return send(404,{error:'Demande introuvable'});
    if(b.approve){
      if(!stripe)return send(500,{error:'STRIPE_SECRET_KEY manquant'});
      if(!u.seller.stripeId){const a=await stripe.accounts.create({type:'express',country:'FR',email:u.email,capabilities:{transfers:{requested:true}},business_type:u.seller.type,business_profile:{name:u.seller.shop},metadata:{userId:u.id}});u.seller.stripeId=a.id}
      u.seller.status='approved';await wr('users',users);
      await mail(u.email,'Ta demande vendeur est acceptée',`<p>Bienvenue ! Termine la vérification d'identité et d'entreprise (par Stripe) dans ton espace vendeur pour recevoir tes gains : <a href="${origin}/seller.html">${origin}/seller.html</a></p>`);
    }else{u.seller.status='rejected';u.seller.reason=String(b.reason||'').slice(0,300);await wr('users',users);await mail(u.email,'Ta demande vendeur',`<p>Ta demande n'a pas été acceptée.</p><p>${esc(u.seller.reason)}</p>`)}
    return send(200,{});
  }
  if(path==='admin/upload'){const r=await put('img/'+uid()+'-'+String(b.name||'img').replace(/[^\w.-]/g,'_'),Buffer.from(b.data,'base64'),{access:'public',contentType:b.type||'image/jpeg'});return send(200,{url:r.url})}
  if(path==='admin/ban'){const u=users.find(x=>x.id===b.id);if(u&&u.email!==user.email){u.banned=!!b.banned;await wr('users',users)}return send(200,{})}
  if(path==='admin/order-delete'){const orders=await rd('orders',[]),o=orders.find(x=>x.id===b.id);if(!o||!o.archived)return send(400,{error:'Seules les commandes livrées (archivées) peuvent être supprimées'});await wr('orders',orders.filter(x=>x.id!==b.id));return send(200,{})}
  if(path.startsWith('admin/'))return send(404,{error:'Introuvable'});

  /* ---------- Espace vendeur ---------- */
  const S=user.seller,pct=Number(E.COMMISSION_PCT||10);
  const ready=async()=>{if(!S||!S.stripeId)return false;try{const a=await stripe.accounts.retrieve(S.stripeId);S.ready=a.capabilities?.transfers==='active'&&!!a.details_submitted;S.payouts=!!a.payouts_enabled;await wr('users',users)}catch(e){console.error(e.message)}return !!S.ready};
  if(path==='seller/apply'){
    if(S&&S.status!=='rejected')return send(400,{error:'Une demande existe déjà'});
    const shop=String(b.shop||'').trim().slice(0,80),siret=String(b.siret||'').replace(/\s/g,'');
    if(!shop||!/^\d{9}(\d{5})?$/.test(siret)||!['individual','company'].includes(b.type))return send(400,{error:'Nom de boutique, type et SIRET (9 ou 14 chiffres) requis'});
    user.seller={status:'pending',shop,type:b.type,siret,desc:String(b.desc||'').slice(0,500),date:Date.now()};await wr('users',users);
    await mail(E.ADMIN_EMAIL,'Nouvelle demande vendeur',`<p>${esc(shop)} (${esc(user.email)}) demande à devenir vendeur. Réponds depuis l'admin, onglet Vendeurs.</p>`);
    return send(200,{});
  }
  if(path==='seller/me'){if(S&&S.status==='approved')await ready();return send(200,{seller:S?{status:S.status,shop:S.shop,reason:S.reason||'',ready:!!S.ready}:null,pct})}
  if(path.startsWith('seller/')&&!(S&&S.status==='approved'))return send(403,{error:"Espace réservé aux vendeurs acceptés"});
  if(path==='seller/onboard'){const l=await stripe.accountLinks.create({account:S.stripeId,refresh_url:origin+'/seller.html',return_url:origin+'/seller.html',type:'account_onboarding'});return send(200,{url:l.url})}
  if(path==='seller/dashboard'){const l=await stripe.accounts.createLoginLink(S.stripeId);return send(200,{url:l.url})}
  if(path==='seller/upload'){const r=await put('img/'+uid()+'-'+String(b.name||'img').replace(/[^\w.-]/g,'_'),Buffer.from(b.data,'base64'),{access:'public',contentType:b.type||'image/jpeg'});return send(200,{url:r.url})}
  if(path==='seller/products')return send(200,(await rd('products',[])).filter(p=>p.sellerId===user.id));
  if(path==='seller/product'){
    if(!await ready())return send(403,{error:"Termine d'abord la vérification Stripe pour pouvoir vendre"});
    let ps=await rd('products',[]);const old=ps.find(x=>x.id===b.id);
    if(b.id&&(!old||old.sellerId!==user.id))return send(403,{error:'Article introuvable'});
    if(b.del)ps=ps.filter(p=>p.id!==b.id);
    else{const imgs=(Array.isArray(b.images)?b.images:[]).map(String).filter(Boolean).slice(0,10);
      const p={...(old||{}),id:old?old.id:uid(),sellerId:user.id,name:String(b.name||'').slice(0,80),desc:String(b.desc||'').slice(0,2000),price:Math.round(Number(b.price)*100)||0,image:imgs[0]||'',images:imgs,sub:false,virtual:!!b.virtual};
      if(!p.name||p.price<=0)return send(400,{error:'Nom et prix requis'});
      old?ps[ps.indexOf(old)]=p:ps.push(p)}
    await wr('products',ps);return send(200,{});
  }
  if(path==='seller/orders')return send(200,(await rd('orders',[])).filter(o=>o.paid&&o.items.some(i=>i.sellerId===user.id)).reverse().map(o=>{const it=o.items.filter(i=>i.sellerId===user.id);return{id:o.id,date:o.date,address:o.address,items:it.map(i=>i.name+' ×'+i.qty),net:Math.floor(it.reduce((a,i)=>a+i.price*i.qty,0)*(100-pct)/100),tracking:(o.sellerShip||{})[user.id]||'',paidOut:!!o.transferred}}));
  if(path==='seller/order'){
    const orders=await rd('orders',[]),o=orders.find(x=>x.id===b.id&&x.paid&&x.items.some(i=>i.sellerId===user.id));if(!o)return send(404,{error:'Commande introuvable'});
    const t=String(b.tracking||'').slice(0,80);o.sellerShip={...(o.sellerShip||{}),[user.id]:t};await wr('orders',orders);
    if(t)await mail(o.email,`Commande ${o.id} : expédiée par ${S.shop}`,`<p>Ton colis de <b>${esc(S.shop)}</b> est expédié. Code de suivi : <b>${esc(t)}</b></p>`);
    return send(200,{});
  }
  send(404,{error:'Introuvable'});
}
