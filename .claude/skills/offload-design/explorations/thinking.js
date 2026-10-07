(function(){
const MK=(dot,ves)=>`<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">${ves?`<path class="v" d="M5.5 11.5V15.5a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3V11.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`:''}${dot||''}</svg>`;
const A={
 hover:`<span class="an a-hover">${MK('<circle class="d" cx="12" cy="5.25" r="2.6" fill="currentColor"/>',1)}</span>`,
 drop:`<span class="an a-drop">${MK('<circle class="d" cx="12" cy="5.25" r="2.6" fill="currentColor"/>',1)}</span>`,
 gather:`<span class="an a-gather">${MK('<circle class="d d1" cx="6" cy="4" r="1.9" fill="currentColor"/><circle class="d d2" cx="12" cy="4" r="1.9" fill="currentColor"/><circle class="d d3" cx="18" cy="4" r="1.9" fill="currentColor"/>',1)}</span>`,
 film:`<span class="an a-film"></span>`,
 stack:`<span class="an a-stack"><i></i><i></i><i></i><i></i></span>`,
 weave:`<span class="an a-weave"><svg viewBox="0 0 60 22" aria-hidden="true"><g>${[['--pv',0,11],['--pa',10,11],['--pb',20,11]].map(([c,o,y])=>`<path d="M${-30+o} ${y} q7.5 -6 15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0" stroke="var(${c})"/>`).join('')}</g></svg></span>`,
 file:`<span class="an a-file"><b class="f1"></b><b class="f2"></b><b class="f3"></b><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="CLIP"><path d="M7 11.5V15.5a1.6 1.6 0 0 0 1.6 1.6h6.8a1.6 1.6 0 0 0 1.6-1.6V11.5z"/></clipPath></defs><g class="vs"><g clip-path="url(#CLIP)"><rect class="lv" x="6" y="10.5" width="12" height="7" fill="url(#GRAD)"/></g><path d="M5.5 11.5V15.5a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3V11.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></g><linearGradient id="GRAD" x1="0" x2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset=".5" stop-color="#2f7bff"/><stop offset="1" stop-color="#f0a020"/></linearGradient></svg></span>`,
 lasso:`<span class="an a-lasso"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle class="d" cx="12" cy="11" r="2.6" fill="currentColor"/><circle class="rope" cx="12" cy="11" r="7.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" transform="rotate(-90 12 11)"/></svg></span>`,
 orbit:`<span class="an a-orbit"><span class="core"><span class="an a-film"></span></span><span class="ox"><span class="oy"><b></b></span></span><span class="ox"><span class="oy"><b></b></span></span><span class="ox"><span class="oy"><b></b></span></span><span class="ox"><span class="oy"><b></b></span></span></span>`
};
A.prism=A.film;Object.assign(A,window.THINK_A||{});
const D=window.THINK_D||[
 ['Simple','l1','The mark, in ink, doing one thing. Quiet enough to sit under any reply.',[
  ['hover','Hover','3s','The dot floats over the vessel and the vessel gives a little under it. Almost still.'],
  ['drop','Drop','3.2s','The dot settles, drops into the vessel, and a new one arrives. The mark filing something, once a loop.'],
  ['gather','Gather','4.2s','The three dots the row has today fall into the vessel one by one. The step from what is there now.']]],
 ['Bolder','l2','Colour comes in, from the prism and the thread labels.',[
  ['film','Thin film','6s','The mark, filled with the prism\u2019s thin film, turning. The composer band\u2019s texture at 22px.'],
  ['stack','Stack','6s','Four strips in thread label colours step down through four slots, one leaving and one arriving each beat. Sorting, as a conveyor.'],
  ['weave','Weave','5s','Violet, amber and blue threads flowing through each other. Threads, literally.']]],
 ['Bold','l3','Little stories about filing, still at the row\u2019s height.',[
  ['file','Filing','7.5s','A note, a photo and a voice note arc into the vessel, which fills with each one and tips out to start again. The landing page\u2019s story in a glyph.'],
  ['lasso','Lasso','4.8s','A loop draws round a dot, cinches, and pulls it away into a thread. The thread glyph doing its job.']]],
 ['Insane','l4','The row itself joins in.',[
  ['prism','Prism type','8s','The thin film mark, and the phrase splits into violet, amber and blue as it changes, as the hero\u2019s cycling word does, breathing apart and back between changes.','prism'],
  ['orbit','Orbit','10s','Four things circle the thin film mark, passing in front of it and behind, smaller and fainter at the back.']]]
];
const PH=['Looking through your threads','Checking your calendar','Reading Lisbon trip','Working out which days Ana is free'];
const ST={plat:localStorage.getItem('thinking-plat')||'ios',state:localStorage.getItem('thinking-state')||'play',stop:localStorage.getItem('thinking-stop')||'round',rm:localStorage.getItem('thinking-rm')==='1'};
const g=n=>`<i class="g" style="--ic:url(../assets/icons/${n}.svg)"></i>`;
let n=0;
const uniq=s=>{n++;return s.replace(/CLIP/g,'clip'+n).replace(/GRAD/g,'grad'+n)};
function card(a){const [id,name,per,desc,mode]=a;const an=uniq(A[id]);
 const stopBtn=ST.stop==='round'?`<button class="st round" aria-label="Stop"><i></i></button>`:ST.stop==='pill'?`<button class="st pill"><i></i>Stop</button>`:'';
 return `<div class="card"><div class="ch"><b>${name}</b><u>${per} loop</u></div><div class="cd">${desc}</div><div class="big">${an}</div>
<div class="cv"><div class="tr"><div class="you">Ana can only do the 14th to the 17th. Move the flights?</div>
<div class="wk${mode?' '+mode:''}" role="status" aria-label="offload is thinking">${uniq(A[id])}<span class="ph" aria-live="polite"></span>${stopBtn}</div></div>
<div class="cmp"><s>Add to this</s><span class="ic">${g('camera')}</span><span class="ic">${g('mic')}</span><span class="send" aria-label="Send">${g('arrow-up').replace('class="g"','class="g ar"')}<i class="sq"></i></span></div></div></div>`}
function render(){
 document.body.dataset.plat=ST.plat;document.body.classList.toggle('rm',ST.rm);
 [['plat','p',ST.plat],['state','s',ST.state],['stop','t',ST.stop],['rm','r',ST.rm?'1':'0']].forEach(([id,k,v])=>document.querySelectorAll('#'+id+' button').forEach(b=>b.classList.toggle('on',b.dataset[k]===v)));
 document.getElementById('dirs').innerHTML=D.map(t=>`<div class="xs"><h2>${t[0]}</h2><span class="lvl ${t[1]}">${t[0]}</span></div><p class="xp">${t[2]}</p><div class="grid">${t[3].map(card).join('')}</div>`).join('');
 apply(true);
}
let t0=performance.now(),last={say:-1,can:null};
function phraseHTML(s,prism){return prism?`<span class="tx">${s}</span><span class="gh v" aria-hidden="true">${s}</span><span class="gh a" aria-hidden="true">${s}</span><span class="gh b" aria-hidden="true">${s}</span>`:s}
function setPhrase(i){document.querySelectorAll('.wk').forEach(w=>{const ph=w.querySelector('.ph'),prism=w.classList.contains('prism');
 const old=ph.querySelector(':scope>span');
 if(i<0){ph.innerHTML='';w.setAttribute('aria-label','offload is thinking');return}
 const s=document.createElement('span');s.className='in';s.innerHTML=phraseHTML(PH[i],prism);ph.appendChild(s);w.removeAttribute('aria-label');
 if(old){old.classList.add('out');setTimeout(()=>old.remove(),360)}
 requestAnimationFrame(()=>requestAnimationFrame(()=>s.classList.remove('in')))})}
function setCan(on){document.querySelectorAll('.wk').forEach(w=>w.classList.toggle('can',on&&ST.stop!=='comp'));document.querySelectorAll('.cv').forEach(c=>c.classList.toggle('cstop',on&&ST.stop==='comp'))}
function apply(force){
 let say=-1,can=false;
 if(ST.state==='say'){say=0}else if(ST.state==='stop'){say=0;can=true}
 else if(ST.state==='play'){const t=((performance.now()-t0)/1000)%20;say=t<2.5?-1:t<6?0:t<11?1:t<15.5?2:3;can=t>=10}
 if(force){last={say:-2,can:null}}
 if(say!==last.say){setPhrase(say);last.say=say}
 if(can!==last.can||force){setCan(can);last.can=can}
}
setInterval(()=>{if(ST.state==='play')apply()},200);
const bind=(id,k,key,cast=x=>x)=>document.querySelectorAll('#'+id+' button').forEach(b=>b.onclick=()=>{ST[key]=cast(b.dataset[k]);localStorage.setItem('thinking-'+key,b.dataset[k]);if(key==='state')t0=performance.now();render()});
bind('plat','p','plat');bind('state','s','state');bind('stop','t','stop');bind('rm','r','rm',v=>v==='1');
render();
})();
