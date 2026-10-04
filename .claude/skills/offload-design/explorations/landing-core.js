/* The scroll landing: shared engine, shader, copy and drawings. Directions live in landing-dirs.js. */
(function(){
const cl=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),mix=(a,b,t)=>a+(b-a)*t,ease=t=>t*t*(3-2*t),eIn=t=>t*t;
const SV=(inner)=>`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='17 11 62 68'%3E${inner}%3C/svg%3E")`;
const DOT="%3Ccircle cx='48' cy='21' r='10' fill='black'/%3E",VES="%3Cpath d='M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46' fill='none' stroke='black' stroke-width='10' stroke-linecap='round'/%3E";
const MASK=SV(DOT+VES),VMASK=SV(VES),DMASK=SV(DOT);
if(!document.getElementById('ld-masks')){const st=document.createElement('style');st.id='ld-masks';st.textContent=`.ld{--m-full:${MASK};--m-ves:${VMASK};--m-dot:${DMASK}}`;document.head.appendChild(st)}
const g=n=>`<i class="g" style="--ic:url(../assets/icons/${n}.svg)"></i>`;
const tile=(n,h)=>`<span class="ld-tile" style="--h:${h}">${g(n)}</span>`;
const AVC=['oklch(.55 .13 250)','oklch(.6 .13 40)','oklch(.52 .1 150)'];
const av=(t,i)=>`<span class="ld-av" style="background:${AVC[i]}">${t}</span>`;
const LOGO=`<span class="ld-logo"><svg width="22" height="22" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="21" r="10" fill="currentColor"/><path d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/></svg>offload</span>`;
const WORDS=["remembers","organizes","sorts","files","keeps","tracks"];

const C={
 what:{k:'What it is',h:'Send it. offload files it.',p:'offload is a place to put down what is on your mind: notes, links, photos and voice notes. It reads each one and files it into a thread, one for each thing you are keeping track of.'},
 any:{k:'Getting things in',h:'Send it as is',p:'Type it, say it, snap it, or forward it.'},
 threads:{k:'Threads',h:'Everything lands in threads',p:'Related things gather in one thread. Share it, and plan it with the people in it.'},
 cal:{k:'Google Calendar',h:'Works with your Google Calendar',p:'Connect your Google Calendar and offload can show what is on it and add or change events when you ask.',x:'<p class="ld-fine">You select which calendars offload may use, and you can disconnect in Settings at any time. <a href="#privacy">How offload handles your calendar</a></p>'},
 end:{h:'offload keeps track for you',p:'offload is invite only for now. Join the waitlist and we will email you when your account is ready to use.'}
};
const ORDER=['what','any','threads','cal'];
const rg=(t,on)=>on?`<span class="rg">${t}<span class="gh v" aria-hidden="true">${t}</span><span class="gh a" aria-hidden="true">${t}</span><span class="gh b" aria-hidden="true">${t}</span></span>`:t;
const T=(id,n,o={})=>{const c=C[id];return `<div class="ld-tx"><div class="ld-k"><u>0${n}</u><span>${c.k}</span></div><h2 class="ld-h2">${rg(c.h,o.rgb)}</h2><p class="ld-p">${c.p}</p>${c.x||''}</div>`};
const form=()=>`<form class="ld-form" novalidate><input class="ld-in" type="email" placeholder="you@example.com" aria-label="Email address" autocomplete="email"><button class="ld-btn" type="submit">Join the waitlist</button></form><p class="ld-err" role="alert"></p>`;
const hero=()=>`<section class="ld-hero" data-s="hero"><h1 class="ld-title"><span>offload</span><span><span class="cyc"><span class="w">${WORDS[0]}</span><span class="gh v" aria-hidden="true">${WORDS[0]}</span><span class="gh a" aria-hidden="true">${WORDS[0]}</span><span class="gh b" aria-hidden="true">${WORDS[0]}</span></span></span><span>for you</span></h1><p class="ld-sub">Dump whatever is cluttering your mind, and offload sorts it for you.</p>${form()}<button class="ld-cue" type="button"><span class="cm"><i></i><b></b></span><span>See how it works</span></button></section>`;
const endSec=(o={})=>`<section class="ld-sec ld-end" data-s="end"><div class="rv"><h2 class="ld-h2">${rg(C.end.h,o.rgb)}</h2><p class="ld-p">${C.end.p}</p>${form()}</div></section>`;
const footer=()=>`<footer class="ld-ft"><a href="#">hello@offload.club</a><span aria-hidden="true">·</span><a href="#terms">Terms</a><span aria-hidden="true">·</span><a href="#privacy">Privacy</a></footer>`;
const DUMPS=[['Ana can only travel the 14th to the 17th',0],['matte black, 30cm',1],['€214 for the flights',0],['4 more shelf brackets',1]];
const THR=[['lasso','Lisbon trip',250,2],['bookmark','Bookshelf build',60,1]];
const thr=(i,n)=>{const t=THR[i];return `<div class="ld-thr" data-t="${i}">${tile(t[0],t[2])}<b>${t[1]}</b><em>${n??t[3]}</em></div>`};
const V={
 filing:()=>`<div class="ld-fv"><div class="bubs">${DUMPS.map(d=>`<span class="ld-bub">${d[0]}</span>`).join('')}</div><span class="arw"></span>${thr(0,4)}${thr(1,3)}</div>`,
anyCards:()=>`<div class="ld-card"><span>${g('type')}Typed</span><div class="ld-me" style="align-self:flex-start">4 more shelf brackets</div></div>
<div class="ld-card"><span>${g('mic')}Said</span><div class="ld-bars">${[6,14,22,12,26,18,9,20,28,14,8,16,22,10].map(h=>`<i style="height:${h}px"></i>`).join('')}</div><b>“Remind me to call the landlord”</b></div>
<div class="ld-card"><span>${g('camera')}Snapped</span><div class="ph">${g('image')}</div></div>
<div class="ld-card"><span>${g('mail')}Forwarded</span><b>Your booking at Alfama Flats</b><div style="color:var(--text-secondary)">Confirmed for 14 to 17 October, two guests.</div></div>`,
 any:()=>`<div class="ld-any">${V.anyCards()}</div>`,
 threads:()=>`<div class="ld-tc"><div class="ld-tch">${tile('lasso',250)}<span>Lisbon trip</span><span class="ld-avs">${av('JM',0)}${av('AD',1)}${av('TR',2)}</span></div>
<div class="ld-tci">${g('calendar')}<span>Alfama flat, 14 to 17 Oct</span></div><div class="ld-tci">${g('plane')}<span>€214 for the flights</span></div><div class="ld-tci">${g('type')}<span>Ana can only travel the 14th to the 17th</span></div><div class="ld-tci">${g('link')}<span>Tram 28 timetable</span></div></div>`,
 cal:()=>`<div class="ld-cv"><div class="ld-me">Put the flights on my calendar</div><p class="ld-reply">Added <b>Flights to Lisbon</b> to your calendar for Tuesday 14 October at 07:40.</p>
<div class="ld-ag"><div class="ld-agh">${g('calendar')}<span>Tuesday 14 October</span><em>Google Calendar</em></div><div class="ld-agr new"><span class="tm">07:40</span><b>Flights to Lisbon</b>${g('check')}</div><div class="ld-agr"><span class="tm">15:00</span><b>Check in, Alfama flat</b></div><div class="ld-agr"><span class="tm">20:30</span><b>Dinner with Ana</b></div></div></div>`
};
const bg={
 clouds:()=>`<div class="ld-cl"><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i></div><div class="ld-glow"></div>`,
 mark:(split)=>`<div class="ld-mk" style="--shape:var(${split?'--m-ves':'--m-full'})"><i class="ld-wa w1"></i><i class="ld-wa w2"></i><i class="ld-wa w3"></i><i class="ld-wa w4"></i>${split?`<div class="ld-fill"><i></i></div><div class="ld-dot"></div>`:''}</div>`,
 film:(split)=>`<div class="ld-film" style="--shape:var(${split?'--m-ves':'--m-full'})"><canvas class="pz"></canvas></div>`
};

/* The site's shader, with two uniforms added: hue, which turns the band, and zm, which magnifies the field. */
const FS=["precision highp float;","uniform vec2 res;uniform float t;uniform float amt;uniform vec3 paper;uniform float hue;uniform float zm;",
"vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453);}",
"float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(dot(h2(i),f),dot(h2(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(h2(i+vec2(0,1)),f-vec2(0,1)),dot(h2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}",
"float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.03;a*=.5;}return s;}",
"void main(){vec2 uv=gl_FragCoord.xy/res.xy;vec2 q=((uv-.5)*vec2(res.x/res.y,1.))/zm+.5;float T=t*0.03;",
"vec2 w1=vec2(fbm(q*1.1+vec2(0.,T)),fbm(q*1.1+vec2(4.2,-T)));vec2 w2=vec2(fbm(q*1.7+w1*1.5+vec2(T*1.1,1.7)),fbm(q*1.7+w1*1.5+vec2(-1.1,T)));",
"float film=fbm(q*1.4+w2*1.8)*1.3+0.5;float band=film*2.6+T*1.4+hue;vec3 col=0.5+0.5*cos(6.28318*(band+vec3(0.0,0.30,0.60)));",
"col=mix(vec3(dot(col,vec3(0.299,0.587,0.114))),col,0.66);float shade=smoothstep(0.05,1.0,fbm(q*0.8+w2*0.7)+0.5);col=mix(paper,col,amt*(0.45+0.55*shade));gl_FragColor=vec4(col,1.0);}"].join("\n");
function Prism(cv,paper,res){
 const gl=cv.getContext('webgl',{antialias:false,alpha:false,preserveDrawingBuffer:true});if(!gl)return null;
 const sh=(ty,src)=>{const s=gl.createShader(ty);gl.shaderSource(s,src);gl.compileShader(s);return s};
 const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,"attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
 gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const pl=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(pl);gl.vertexAttribPointer(pl,2,gl.FLOAT,false,0,0);
 const U=n=>gl.getUniformLocation(pr,n);const u={res:U('res'),t:U('t'),amt:U('amt'),paper:U('paper'),hue:U('hue'),zm:U('zm')};
 gl.uniform3fv(u.paper,paper);
 return{size(){const w=Math.max(1,Math.round(cv.offsetWidth*res)),h=Math.max(1,Math.round(cv.offsetHeight*res));if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;gl.viewport(0,0,w,h);gl.uniform2f(u.res,w,h)}},
  draw(t,amt,hue,zm){gl.uniform1f(u.t,t);gl.uniform1f(u.amt,amt);gl.uniform1f(u.hue,hue);gl.uniform1f(u.zm,zm);gl.drawArrays(gl.TRIANGLES,0,3)}};
}
function paperOf(el){const raw=getComputedStyle(el).getPropertyValue('--surface-page').trim();const m=/^#([0-9a-f]{6})$/i.exec(raw);return m?m[1].match(/../g).map(x=>parseInt(x,16)/255):[.984,.98,.969]}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Cycling word, shared by every mounted landing so they stay in step. */
if(!reduced)setInterval(()=>{const all=document.querySelectorAll('.cyc');all.forEach(c=>c.classList.add('o'));setTimeout(()=>{all.forEach(c=>{const i=(+(c.dataset.i||0)+1)%WORDS.length;c.dataset.i=i;c.querySelectorAll('.w,.gh').forEach(s=>s.textContent=WORDS[i])});requestAnimationFrame(()=>requestAnimationFrame(()=>all.forEach(c=>c.classList.remove('o'))))},1120)},5000);

/* Place the mark: centre (x,y) in px within the background, scale sc against base size S, and
   carry the film's mask with it so the shader stays sharp at any scale. */
function placeMark(s,x,y,sc,o){
 const S=s.S;s.mk.style.transform=`translate(${x-S/2}px,${y-S/2}px) scale(${sc})`;s.mk.style.opacity=o;
 if(s.film){const W=S*62/68*sc,H=S*sc,sz=`${W}px ${H}px`,ps=`${x-W/2}px ${y-H/2}px`;const f=s.film.style;f.webkitMaskSize=f.maskSize=sz;f.webkitMaskPosition=f.maskPosition=ps;f.opacity=o}
}

function mount(host,dir){
 const D=window.LD_DIRS[dir];
 const root=document.createElement('div');root.className='ld d'+dir.toUpperCase();
 root.innerHTML=`<div class="ld-bg">${D.bg()}</div><div class="ld-ov"><div class="ld-prog"><b></b></div></div><header class="ld-hd">${LOGO}<a class="ld-signin" href="#signin">Sign in</a></header><main class="ld-main">${D.body()}</main>${footer()}`;
 host.innerHTML='';host.appendChild(root);
 const s={root,y:0,vel:0,time:0,secs:[],s:{},mk:root.querySelector('.ld-mk'),film:root.querySelector('.ld-film'),cl:root.querySelector('.ld-cl'),hd:root.querySelector('.ld-hd'),dirty:true};
 const cv=root.querySelector('canvas.pz');
 const measure=()=>{
  s.vw=root.clientWidth;s.vh=root.clientHeight;s.m=s.vw<820;root.classList.toggle('m',s.m);
  s.S=Math.min(s.vh*.74,s.vw*.82);
  root.style.setProperty('--vh',s.vh+'px');root.style.setProperty('--vw',s.vw+'px');root.style.setProperty('--S',s.S+'px');
  root.style.setProperty('--hs',cl(Math.min(s.vw*.072,s.vh*.115),38,104)+'px');
  s.HD=s.hd.offsetHeight;
  s.secs=[...root.querySelectorAll('[data-s]')].map(el=>({id:el.dataset.s,el,top:el.offsetTop,h:el.offsetHeight,rv:el.querySelectorAll('.rv')}));
  s.max=Math.max(1,root.scrollHeight-s.vh);
  if(s.pr)s.pr.size();D.measure&&D.measure(s);s.dirty=true;
 };
 requestAnimationFrame(()=>{s.pr=cv&&Prism(cv,paperOf(root),D.res||.6);measure()});
 new ResizeObserver(()=>measure()).observe(root);
 root.addEventListener('scroll',()=>{s.dirty=true},{passive:true});
 root.querySelectorAll('.ld-form').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const v=f.querySelector('input').value.trim(),er=f.nextElementSibling;
  if(!v){er.textContent='Add your email so we know where to write.';return}if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){er.textContent='That does not look like an email address.';return}
  er.textContent='';const p=document.createElement('p');p.className='ld-done';p.setAttribute('role','status');p.innerHTML='You are on the list. We will email <b></b> when your account is ready to use.';p.querySelector('b').textContent=v;f.replaceWith(p)}));
 root.querySelector('.ld-cue').onclick=()=>{const n=s.secs[1];if(n)root.scrollTo({top:n.top-s.HD+(D.cueOffset||0),behavior:'smooth'})};
 D.init&&D.init(s);
 let vis=false,run=false,lastDraw=0;const t0=performance.now();
 new IntersectionObserver(es=>{vis=es[0].isIntersecting;if(vis&&!run){run=true;requestAnimationFrame(loop)}}).observe(host);
 function loop(now){
  if(!vis){run=false;return}
  if(s.vw){
   s.time=reduced?0:(now-t0)/1000;
   const y=root.scrollTop,dy=y-s.y;s.vel=s.vel*.82+dy*.18;if(Math.abs(s.vel)<.02)s.vel=0;
   const moved=s.dirty||dy!==0||s.vel!==0;s.y=y;s.dirty=false;
   if(moved){
    s.k=cl(y/s.vh);s.p=cl(y/s.max);root.style.setProperty('--k',s.k.toFixed(3));root.style.setProperty('--pg',s.p.toFixed(4));root.classList.toggle('sc',y>8);
    for(const c of s.secs){const r=cl((y+s.vh-c.top)/(c.h+s.vh)),q=cl((y+s.HD-c.top)/Math.max(1,c.h-s.vh+s.HD));c.r=r;c.q=q;s.s[c.id]=c;
     if(c.rv.length){const o=ease(cl((y+s.vh-c.top)/(s.vh*.55)));c.rv.forEach((el,i)=>el.style.setProperty('--o',cl(o*1.25-i*.25).toFixed(3)))}}
   }
   if(moved||D.always){s.out=D.update(s)||{}}
   if(s.pr&&(moved||now-lastDraw>(reduced?1e9:100))){const o=s.out||{};s.pr.draw(o.t??40+s.time,o.amt??.25,o.hue??0,o.zm??1);lastDraw=now;D.afterDraw&&D.afterDraw(s,cv)}
  }
  requestAnimationFrame(loop);
 }
 return s;
}
window.LD={mount,placeMark,C,ORDER,T,V,bg,hero,endSec,thr,DUMPS,THR,tile,g,cl,mix,ease,eIn,rg};
})();
