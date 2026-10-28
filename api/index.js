import {put,head} from '@vercel/blob';
import crypto from 'node:crypto';
const E=process.env,P=`db-${E.DB_SECRET}/`;
const rd=async(n,d)=>{try{const b=await head(P+n+'.json');return await(await fetch(b.url+'?t='+Date.now(),{cache:'no-store'})).json()}catch{return d}};
const wr=(n,v)=>put(P+n+'.json',JSON.stringify(v),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
const sign=s=>crypto.createHmac('sha256',E.SESSION_SECRET).update(s).digest('base64url');
const hash=(pw,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(pw,salt,32).toString('hex');
const ok=(pw,h)=>{const a=Buffer.from(hash(pw,h.split(':')[0])),b=Buffer.from(h);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mail=(to,subject,html)=>fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to,subject,html})}).catch(()=>{});
const uid=()=>crypto.randomBytes(6).toString('hex');
export default async function h(req,res){
  const path=new URL(req.url,'http://x').pathname.replace(/^\/api\//,'').replace(/\/$/,'');
  const b=req.body||{},send=(c,o)=>res.status(c).json(o);
  const login=u=>res.setHeader('Set-Cookie',`s=${u};HttpOnly;Secure;SameSite=Lax;Path=/;Max-Age=2592000`);
  const users=await rd('users',[]);
  let user=null;const ck=(req.headers.cookie||'').match(/s=([^;]+)/)?.[1];
  if(ck){const[p,g]=ck.split('.');if(g&&g===sign(p)){try{const t=JSON.parse(Buffer.from(p,'base64url'));if(t.exp>Date.now())user=users.find(u=>u.id===t.id&&!u.banned)||null}catch{}}}
  const admin=!!user&&user.email===(E.ADMIN_EMAIL||'').toLowerCase();
  const start=u=>{const p=Buffer.from(JSON.stringify({id:u.id,exp:Date.now()+2592e6})).toString('base64url');login(p+'.'+sign(p))};
  const pub=u=>({name:u.name,email:u.email,admin:u.email===(E.ADMIN_EMAIL||'').toLowerCase()});
  if(path.startsWith('admin/')&&!admin)return send(403,{error:'Accès refusé'});
  if(path==='products')return send(200,{products:await rd('products',[]),shipping:(await rd('settings',{shipping:0})).shipping});
  if(path==='me')return send(200,user?pub(user):null);
  if(path==='logout'){login('');return send(200,{})}
  if(path==='register'){
    const email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim().slice(0,60);
    if(!name||!/^\S+@\S+\.\S+$/.test(email)||String(b.password||'').length<8)return send(400,{error:'Nom, email valide et mot de passe de 8 caractères minimum requis'});
    if(users.some(u=>u.email===email))return send(409,{error:'Un compte existe déjà avec cet email'});
    const u={id:uid(),name,email,hash:hash(b.password),banned:false,created:Date.now()};users.push(u);await wr('users',users);start(u);return send(200,pub(u));
  }
  if(path==='login'){
    const u=users.find(x=>x.email===String(b.email||'').trim().toLowerCase());
    if(!u||!ok(String(b.password||''),u.hash))return send(401,{error:'Email ou mot de passe incorrect'});
    if(u.banned)return send(403,{error:'Ce compte est suspendu'});
    start(u);return send(200,pub(u));
  }
  if(!user)return send(401,{error:'Connecte-toi pour continuer'});
  if(path==='orders')return send(200,(await rd('orders',[])).filter(o=>o.userId===user.id).reverse());
  if(path==='order'){
    const prods=await rd('products',[]),{shipping}=await rd('settings',{shipping:0});
    const items=(b.items||[]).map(i=>{const p=prods.find(x=>x.id===i.id);return p&&{id:p.id,name:p.name,price:p.price,sub:!!p.sub,qty:Math.min(99,Math.max(1,i.qty|0))}}).filter(Boolean);
    if(!items.length||String(b.address||'').trim().length<10)return send(400,{error:'Panier vide ou adresse incomplète'});
    const o={id:'DJ'+uid().toUpperCase(),userId:user.id,email:user.email,items,shipping,total:items.reduce((a,i)=>a+i.price*i.qty,0)+shipping,address:String(b.address).slice(0,400),status:'En préparation',tracking:'',paid:false,date:Date.now()};
    const orders=await rd('orders',[]);orders.push(o);await wr('orders',orders);
    await mail(user.email,`Commande ${o.id} enregistrée`,`<p>Bonjour ${esc(user.name)}, ta commande <b>${o.id}</b> est enregistrée (${(o.total/100).toFixed(2)} €).</p>`);
    return send(200,o);
  }
  if(path==='admin/mail'){
    const subject=String(b.subject||'').trim().slice(0,150),text=String(b.message||'').trim().slice(0,5000);
    if(!subject||!text)return send(400,{error:'Objet et message requis'});
    const one=String(b.other||'').trim().toLowerCase()||(b.to==='all'?'':String(b.to||'').trim().toLowerCase());
    const to=one?[one]:users.filter(u=>!u.banned).map(u=>u.email).slice(0,100);
    if(!to.length||to.some(e=>!/^\S+@\S+\.\S+$/.test(e)))return send(400,{error:'Destinataire invalide'});
    const html='<p>'+esc(text).replace(/\n/g,'<br>')+'</p>';
    const r=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(to.map(e=>({from:E.MAIL_FROM,reply_to:E.MAIL_REPLY_TO,to:[e],subject,html})))});
    if(!r.ok)return send(502,{error:'Resend a refusé l\'envoi : vérifie la clé API et le domaine'});
    return send(200,{sent:to.length});
  }
  if(path==='admin/data')return send(200,{products:await rd('products',[]),orders:(await rd('orders',[])).reverse(),users:users.map(u=>({id:u.id,name:u.name,email:u.email,banned:u.banned})),shipping:(await rd('settings',{shipping:0})).shipping});
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
    const changed=o.status!==b.status||o.tracking!==b.tracking;o.status=b.status;o.tracking=String(b.tracking||'').slice(0,80);await wr('orders',orders);
    if(changed&&['Expédié','En cours de livraison','Livré'].includes(o.status))await mail(o.email,`Commande ${o.id} : ${o.status}`,`<p>Ta commande <b>${o.id}</b> est maintenant : <b>${esc(o.status)}</b>.</p>${o.tracking?`<p>Code de suivi : <b>${esc(o.tracking)}</b></p>`:''}`);
    return send(200,{});
  }
  send(404,{error:'Introuvable'});
}
