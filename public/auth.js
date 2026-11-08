const $=s=>document.querySelector(s);
const api=async(p,b)=>{const r=await fetch('/api/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Erreur');return j};
const next=(()=>{const n=new URLSearchParams(location.search).get('next');return n&&/^\/[^\/\\]/.test(n)?n:'/#compte'})();
const err=t=>{$('#m').className='err';$('#m').textContent=t};
let PE='',CRED=null,WANT=false;

/* Affiche l'étape du code (mail ou application d'authentification) */
const showCode=r=>{
  PE=r.email;$('#f').hidden=true;$('#cf').hidden=false;$('#c').value='';$('#m').textContent='';
  if(r.method==='totp'){
    $('#cl').textContent="Code de ton application d'authentification";
    $('#info').textContent="Ouvre ton application d'authentification et entre le code à 6 chiffres affiché pour DidjoTheSHOP.";
    if($('#alt'))$('#alt').hidden=false;
  }else{
    $('#cl').textContent='Code reçu par mail';
    $('#info').textContent="Un code à 6 chiffres vient d'être envoyé à "+PE+". Il est valable 10 minutes.";
    if($('#alt'))$('#alt').hidden=true;
  }
  $('#c').focus();
};

$('#f').onsubmit=async e=>{e.preventDefault();try{
  CRED=Object.fromEntries(new FormData(e.target));
  WANT=!!($('#a2')&&$('#a2').checked);
  showCode(await api(document.body.dataset.mode,CRED));
}catch(x){err(x.message)}};

/* Connexion : recevoir le code par mail à la place de l'application */
if($('#altb'))$('#altb').onclick=async()=>{try{showCode(await api('login',{...CRED,mail:true}))}catch(x){err(x.message)}};

/* Étape finale de l'inscription : configurer l'application d'authentification */
const startTotp=async()=>{
  try{
    const r=await api('totp/setup',{});
    $('#cf').hidden=true;$('#tf').hidden=false;$('#m').textContent='';
    $('#info').textContent="Dernière étape : configure ton application d'authentification.";
    $('#sec').textContent=r.secret.match(/.{1,4}/g).join(' ');$('#ou').href=r.uri;
    if(window.QRCode)new QRCode($('#qr'),{text:r.uri,width:180,height:180});
    $('#tc').focus();
  }catch(x){err("Impossible de préparer l'application d'authentification : tu pourras l'activer depuis ton compte.");setTimeout(()=>location.href=next,3000)}
};

$('#cf').onsubmit=async e=>{e.preventDefault();try{
  const u=await api('verify',{email:PE,code:$('#c').value});
  if(WANT&&!u.totp){await startTotp();return}
  location.href=next;
}catch(x){err(x.message)}};

if($('#tf')){
  $('#tf').onsubmit=async e=>{e.preventDefault();try{await api('totp/enable',{code:$('#tc').value});location.href=next}catch(x){err(x.message)}};
  $('#skip').onclick=()=>location.href=next;
}
