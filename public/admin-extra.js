(function(){
const api=async(p,b)=>{const r=await fetch('/api/'+p,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Erreur');return j};
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const css='background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;margin-bottom:16px';
const box=document.createElement('div');
box.style.cssText='max-width:900px;margin:16px auto;padding:0 16px';
box.innerHTML=`<div style="${css}"><h2 style="margin-top:0">Mode maintenance</h2><p id="mt-s">Chargement…</p><button id="mt-b" disabled>…</button><p id="mt-m"></p></div><div style="${css}"><h2 style="margin-top:0">Type des articles</h2><p style="color:#6b7280">Virtuel = pas de frais de livraison et non remboursable.</p><div id="ty">Chargement…</div></div>`;
document.body.insertBefore(box,document.body.firstChild);
const $=s=>box.querySelector(s);
let on=false;
function draw(){$('#mt-s').textContent=on?'🔴 Maintenance ACTIVÉE : le site est fermé aux visiteurs':'🟢 Site en ligne';$('#mt-b').textContent=on?'Terminer la maintenance':'Démarrer la maintenance';$('#mt-b').disabled=false}
api('maintenance').then(s=>{on=!!s.on;draw()}).catch(e=>$('#mt-s').textContent=e.message);
$('#mt-b').onclick=async()=>{
  if(!confirm((on?'Terminer':'Démarrer')+' la maintenance ? Un mail sera envoyé à TOUS les clients.'))return;
  $('#mt-b').disabled=true;$('#mt-m').textContent='Envoi des mails en cours…';
  try{const r=await api('admin/maintenance',{on:!on});on=r.on;draw();$('#mt-m').textContent=r.unchanged?'Déjà dans cet état.':'OK : '+r.sent+' mail(s) envoyé(s) sur '+r.total+'.'}
  catch(e){$('#mt-m').textContent=e.message;$('#mt-b').disabled=false}
};
async function types(){
  try{const d=await api('admin/data');
    $('#ty').innerHTML=d.products.map(p=>`<div style="display:flex;gap:12px;align-items:center;padding:6px 0"><b style="flex:1">${esc(p.name)}</b><select data-id="${p.id}"><option value="0"${p.virtual?'':' selected'}>Réel (livraison)</option><option value="1"${p.virtual?' selected':''}>Virtuel</option></select></div>`).join('')||'Aucun article.';
    $('#ty').querySelectorAll('select').forEach(sel=>sel.onchange=async()=>{
      const p=d.products.find(x=>x.id===sel.dataset.id);
      try{await api('admin/product',{id:p.id,name:p.name,desc:p.desc,price:p.price/100,image:p.image,sub:p.sub,virtual:sel.value==='1'});p.virtual=sel.value==='1'}
      catch(e){alert(e.message)}
    });
  }catch(e){$('#ty').textContent=e.message}
}
types();
})();
