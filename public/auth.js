const $=s=>document.querySelector(s);
const api=async(p,b)=>{const r=await fetch('/api/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Erreur');return j};
const next=(()=>{const n=new URLSearchParams(location.search).get('next');return n&&/^\/[^\/\\]/.test(n)?n:'/#compte'})();
const err=t=>{$('#m').className='err';$('#m').textContent=t};
let PE='';
$('#f').onsubmit=async e=>{e.preventDefault();try{const r=await api(document.body.dataset.mode,Object.fromEntries(new FormData(e.target)));PE=r.email;$('#f').hidden=true;$('#cf').hidden=false;$('#info').textContent="Un code à 6 chiffres vient d'être envoyé à "+PE+". Il est valable 10 minutes.";$('#m').textContent='';$('#c').focus()}catch(x){err(x.message)}};
$('#cf').onsubmit=async e=>{e.preventDefault();try{await api('verify',{email:PE,code:$('#c').value});location.href=next}catch(x){err(x.message)}};
