/* DidjoTheSHOP : effets 3D, motion design et sons (aucune dépendance) */
(()=>{
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches,$=s=>document.querySelector(s);
/* logo dans les en-têtes qui n'en ont pas */
const L=window.DTK_LOGO;
if(L)document.querySelectorAll('header b').forEach(b=>{if(!b.querySelector('img')){const i=new Image();i.src=L;i.alt='';b.prepend(i)}});
/* sons (coupés par défaut, bouton en bas à droite) */
let on=false,ac;try{on=localStorage.snd==='1'}catch{}
const tone=(f,t,d,v=.06)=>{const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+d+.02)};
const snd=k=>{if(!on)return;try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();const t=ac.currentTime;
if(k==='add'){tone(660,t,.12);tone(990,t+.09,.2)}else if(k==='ok'){[523,659,784].forEach((f,i)=>tone(f,t+i*.08,.3))}else tone(440,t,.06,.04)}catch{}};
const sb=document.createElement('button');sb.id='sndbtn';sb.className='alt';sb.setAttribute('aria-label','Activer ou couper le son');
const paint=()=>sb.textContent=on?'🔊':'🔇';paint();
sb.onclick=()=>{on=!on;try{localStorage.snd=on?'1':'0'}catch{}paint();snd('add')};document.body.append(sb);
window.fx={snd};
/* ajout au panier : l'image s'envole vers le panier */
const fly=b=>{if(RM)return;const img=b.closest('.card')?.querySelector('img'),t=$('header a[href="#panier"]');if(!img||!t)return;
const a=img.getBoundingClientRect(),c=t.getBoundingClientRect(),f=img.cloneNode();f.className='fly';
f.style.cssText=`left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;document.body.append(f);
f.animate([{transform:'none',opacity:1},{transform:`translate(${c.left-a.left}px,${c.top-a.top}px) scale(.08) rotate(25deg)`,opacity:.3}],{duration:700,easing:'cubic-bezier(.5,0,.8,.4)'}).onfinish=()=>{f.remove();t.classList.remove('bump');void t.offsetWidth;t.classList.add('bump')}};
/* clics : onde + son */
addEventListener('click',e=>{const b=e.target.closest('button,.btn');if(!b||b.id==='sndbtn')return;
if(!RM){const r=b.getBoundingClientRect(),s=document.createElement('span');s.className='rip';s.style.cssText=`left:${e.clientX-r.left}px;top:${e.clientY-r.top}px`;b.append(s);setTimeout(()=>s.remove(),600)}
if((b.getAttribute('onclick')||'').startsWith('add(')){snd('add');fly(b)}else snd('click')},true);
/* apparition progressive au scroll */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}}),{threshold:.1});
const prep=()=>document.querySelectorAll('#v .card,#v .hero,#v h2,main>.card,main .doc').forEach(el=>{if(el.dataset.fx)return;el.dataset.fx=1;
el.style.transitionDelay=Math.min([...el.parentNode.children].indexOf(el),8)*60+'ms';el.classList.add('rv');io.observe(el)});
new MutationObserver(prep).observe(document.body,{childList:true,subtree:true});prep();
/* inclinaison 3D des cartes et du logo */
addEventListener('pointermove',e=>{if(RM||e.pointerType==='touch'||!e.target.closest)return;
const c=e.target.closest('.grid .card'),h=e.target.closest('.hero');
if(c){const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
c.style.setProperty('--rx',((.5-y)*10).toFixed(2)+'deg');c.style.setProperty('--ry',((x-.5)*12).toFixed(2)+'deg');c.style.setProperty('--mx',x*100+'%');c.style.setProperty('--my',y*100+'%')}
if(h){const r=h.getBoundingClientRect();h.style.setProperty('--hx',(((e.clientX-r.left)/r.width-.5)*30).toFixed(1)+'deg');h.style.setProperty('--hy',((.5-(e.clientY-r.top)/r.height)*24).toFixed(1)+'deg')}});
addEventListener('pointerout',e=>{const c=e.target.closest&&e.target.closest('.grid .card');if(c&&!c.contains(e.relatedTarget)){c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')}});
/* barre de progression */
const bar=document.createElement('i');bar.id='bar';document.body.prepend(bar);
addEventListener('scroll',()=>{const h=document.documentElement;bar.style.transform=`scaleX(${h.scrollTop/((h.scrollHeight-h.clientHeight)||1)})`},{passive:true});
})();
