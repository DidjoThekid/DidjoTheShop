(()=>{
const css=`
#intro{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0b0f1a;color:#fff;font-family:Manrope,system-ui,sans-serif;overflow:hidden;perspective:900px;text-align:center;transition:opacity .7s ease,transform .7s ease}
#intro.out{opacity:0;transform:scale(1.08);pointer-events:none}
#intro .bg{position:absolute;inset:-20%;background:radial-gradient(circle at 20% 30%,#4f46e5 0,transparent 40%),radial-gradient(circle at 80% 70%,#06b6d4 0,transparent 40%),radial-gradient(circle at 50% 100%,#ec4899 0,transparent 45%);filter:blur(60px);opacity:.55;animation:introBg 10s ease-in-out infinite alternate}
@keyframes introBg{to{transform:rotate(25deg) scale(1.2)}}
#intro .cube{position:relative;width:90px;height:90px;margin-bottom:14px;transform-style:preserve-3d;animation:introSpin 6s linear infinite}
#intro .cube i{position:absolute;inset:0;border:2px solid rgba(255,255,255,.75);background:rgba(255,255,255,.08)}
#intro .cube i:nth-child(1){transform:translateZ(45px)}
#intro .cube i:nth-child(2){transform:rotateY(180deg) translateZ(45px)}
#intro .cube i:nth-child(3){transform:rotateY(90deg) translateZ(45px)}
#intro .cube i:nth-child(4){transform:rotateY(-90deg) translateZ(45px)}
#intro .cube i:nth-child(5){transform:rotateX(90deg) translateZ(45px)}
#intro .cube i:nth-child(6){transform:rotateX(-90deg) translateZ(45px)}
@keyframes introSpin{from{transform:rotateX(-20deg) rotateY(0)}to{transform:rotateX(-20deg) rotateY(360deg)}}
#intro .t{position:relative;font-size:clamp(34px,9vw,84px);font-weight:800;letter-spacing:-1px;line-height:1.1}
#intro .t span{display:inline-block;opacity:0;animation:introLetter .8s cubic-bezier(.2,.9,.3,1.2) forwards;animation-delay:calc(var(--i)*70ms + 400ms)}
@keyframes introLetter{from{opacity:0;transform:rotateX(-90deg) translateY(30px)}to{opacity:1;transform:none}}
#intro .sub{position:relative;opacity:0;font-size:clamp(14px,3.5vw,20px);color:#cbd5e1;animation:introFade .8s ease 1.7s forwards}
#intro .btns{position:relative;display:flex;gap:12px;flex-wrap:wrap;justify-content:center;opacity:0;animation:introFade .8s ease 2.2s forwards}
@keyframes introFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
#intro button{font:inherit;font-weight:600;padding:12px 22px;border-radius:999px;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.1);color:#fff;cursor:pointer;transition:transform .2s,background .2s}
#intro button:hover{transform:scale(1.06);background:rgba(255,255,255,.22)}
#intro .go{background:#fff;color:#0b0f1a;border-color:#fff}
.grid .card{animation:cardIn .6s cubic-bezier(.2,.8,.2,1) both;transition:transform .25s ease,box-shadow .25s ease}
.grid .card:nth-child(2){animation-delay:.08s}.grid .card:nth-child(3){animation-delay:.16s}.grid .card:nth-child(4){animation-delay:.24s}.grid .card:nth-child(5){animation-delay:.32s}.grid .card:nth-child(6){animation-delay:.4s}
.grid .card:hover{transform:translateY(-6px);box-shadow:0 18px 40px rgba(0,0,0,.18)}
@keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(.97)}}
@media (prefers-reduced-motion:reduce){.grid .card{animation:none}}
`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

let seen=false;try{seen=sessionStorage.introSeen}catch{}
if(location.hash||seen||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
try{sessionStorage.introSeen=1}catch{}

const I=document.createElement('div');I.id='intro';
I.innerHTML='<div class="bg"></div><div class="cube"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="t"></div><div class="sub">Bienvenue dans la boutique</div><div class="btns"><button class="go">Entrer</button><button class="snd">Entrer avec le son 🔊</button></div>';
document.body.appendChild(I);
I.querySelector('.t').innerHTML=[...'DidjoTheSHOP'].map((c,i)=>'<span style="--i:'+i+'">'+c+'</span>').join('');

const chime=()=>{try{const a=new(window.AudioContext||window.webkitAudioContext)(),t=a.currentTime;[523.25,659.25,783.99,1046.5].forEach((f,i)=>{const o=a.createOscillator(),g=a.createGain(),s=t+i*.12;o.type='sine';o.frequency.value=f;o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(.15,s+.03);g.gain.exponentialRampToValueAtTime(.001,s+1.2);o.start(s);o.stop(s+1.3)})}catch{}};
let done=false;
const close=s=>{if(done)return;done=true;if(s)chime();I.classList.add('out');setTimeout(()=>I.remove(),800)};
I.querySelector('.go').onclick=()=>close(false);
I.querySelector('.snd').onclick=()=>close(true);
setTimeout(()=>close(false),9000);
})();
