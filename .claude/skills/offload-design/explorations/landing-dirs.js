/* Two directions for the scroll landing. Each: bg(), body(), update(s), optional measure. */
(function(){
const {placeMark,ORDER,T,V,bg,hero,endSec,thr,DUMPS,g,cl,mix,ease,eIn}=window.LD;
const endW=(s,a=.15,b=.4)=>s.s.end?ease(cl((s.s.end.r-a)/b)):0;
const win=(pos,j)=>j===0&&pos<.5?1:j===3&&pos>3.5?1:cl(1-Math.max(0,Math.abs(pos-(j+.5))-.4)/.1);

const SP=[[.02,.03],[.5,.12],[.08,.27],[.44,.38]];
const B={
 bg:()=>bg.clouds()+'<canvas class="ld-film2"></canvas>'+bg.mark()+bg.film(),
 body:()=>hero()+`<section class="ld-sec ld-story" data-s="story"><div class="ld-stk">
<div class="ld-steps">${ORDER.map((id,i)=>`<div class="ld-step">${T(id,i+1)}</div>`).join('')}</div>
<div class="ld-stage"><div class="ld-scn s0">${DUMPS.map(d=>`<span class="ld-bub">${d[0]}</span>`).join('')}<div class="ld-rows">${thr(0)}${thr(1)}</div></div>
<div class="ld-scn s1">${V.any()}<div class="ld-cmp"><s>Dump anything</s><span>${g('camera')}</span><span>${g('mic')}</span></div></div>
<div class="ld-scn s2">${V.threads()}</div><div class="ld-scn s3">${V.cal()}</div></div></div></section>`+endSec(),
 measure(s){const r=s.root,sc=r.querySelector('.s0'),rw=sc.querySelector('.ld-rows');s.sw=sc.offsetWidth;s.sh=sc.offsetHeight;
  s.rowEls=[...rw.children];s.tg=s.rowEls.map(e=>({x:rw.offsetLeft+e.offsetLeft+e.offsetWidth/2,y:rw.offsetTop+e.offsetTop+e.offsetHeight/2}));
  s.bubs=[...sc.querySelectorAll('.ld-bub')].map(el=>({el,w:el.offsetWidth,h:el.offsetHeight}));
  s.steps=[...r.querySelectorAll('.ld-step')];s.scns=[...r.querySelectorAll('.ld-scn')];
  s.c1=[...r.querySelectorAll('.s1 .ld-card')];s.c2i=[...r.querySelectorAll('.s2 .ld-tci')];s.c2a=[...r.querySelectorAll('.s2 .ld-av')];
  s.c3=[r.querySelector('.s3 .ld-me'),r.querySelector('.s3 .ld-reply'),r.querySelector('.s3 .ld-agr.new')];
  const f2=r.querySelector('.ld-film2'),cv=r.querySelector('canvas.pz');if(f2&&cv){f2.width=cv.width;f2.height=cv.height;s.f2=f2;s.f2x=f2.getContext('2d')}},
 afterDraw(s,cv){if(s.f2x&&+s.f2.style.opacity>0)s.f2x.drawImage(cv,0,0,s.f2.width,s.f2.height)},
 update(s){const st=s.s.story;if(!st||!s.steps)return;const pos=st.q*4;
  s.steps.forEach((el,j)=>{const o=win(pos,j);el.style.opacity=o;el.style.transform=`translateY(${((1-o)*(pos<j+.5?18:-18)).toFixed(1)}px)`;el.style.pointerEvents=o>.5?'':'none'});
  s.scns.forEach((el,j)=>{const o=win(pos,j);el.style.opacity=o;el.style.transform=`scale(${(.96+.04*o).toFixed(3)})`});
  const u=j=>cl((pos-j)/.8);
  const u0=u(0),cnt=[2,1],bump=[0,0];
  s.bubs.forEach((b,i)=>{const t=cl((u0-i*.16)/.34),e=ease(t),to=DUMPS[i][1],Tg=s.tg[to];
   const sx=Math.min(SP[i][0]*s.sw,s.sw-b.w),sy=SP[i][1]*s.sh,tx=Tg.x-b.w/2,ty=Tg.y-b.h/2;
   b.el.style.transform=`translate(${mix(sx,tx,e).toFixed(1)}px,${mix(sy,ty,eIn(t)).toFixed(1)}px) scale(${mix(1,.5,e).toFixed(3)})`;
   b.el.style.opacity=t<.82?1:1-(t-.82)/.18;if(t>=.98)cnt[to]++;if(t>.82)bump[to]=Math.max(bump[to],Math.sin(cl((t-.82)/.18)*Math.PI))});
  s.rowEls.forEach((r,i)=>{r.querySelector('em').textContent=cnt[i];r.style.transform=`scale(${1+bump[i]*.035})`});
  const u1=u(1);s.c1.forEach((c,i)=>{const o=ease(cl((u1-i*.14)/.26));c.style.opacity=o;c.style.transform=`translateY(${(1-o)*30}px)`});
  const u2=u(2);s.c2i.forEach((c,i)=>{const o=ease(cl((u2-.1-i*.14)/.22));c.style.opacity=o;c.style.transform=`translateX(${(1-o)*24}px)`});
  s.c2a.forEach((a,i)=>{const o=ease(cl((u2-i*.12)/.16));a.style.transform=`scale(${o})`});
  const u3=u(3),[me,rep,nw]=s.c3;me.style.opacity=ease(cl(u3/.15));rep.style.opacity=ease(cl((u3-.25)/.2));const ne=ease(cl((u3-.5)/.2));nw.style.opacity=ne;nw.style.transform=`translateY(${(1-ne)*-14}px)`;
  const mp=ease(s.k)*(1-endW(s));
  if(s.m)placeMark(s,s.vw/2,s.vh/2-mp*s.vh*.17,1-.42*mp,.75-.3*mp);else placeMark(s,s.vw/2+mp*s.vw*.24,s.vh/2+mp*s.vh*.03,1-.42*mp,.75-.3*mp);
  if(s.f2)s.f2.style.opacity=(.42*mp).toFixed(3);
  s.cl.style.filter=`hue-rotate(${(pos*35).toFixed(1)}deg)`;
  return{t:40+s.time+s.y*.012,hue:pos*.16,amt:.27}}
};

/* C: one glass panel held in place over the film. It never scrolls; it fades in as the hero
   leaves, its four steps swap inside it, and it fades out before the waitlist. */
const Cd={
 bg:()=>bg.clouds()+bg.mark()+bg.film(),
 body:()=>hero()+`<section class="ld-sec ld-story ld-cst" data-s="story" style="height:calc(var(--vh)*6)"><div class="ld-cpin"><div class="ld-glass ld-cpanel"><div class="ld-csteps">${ORDER.map((id,i)=>`<div class="ld-two ld-cstep"><div class="ld-cs-a">${T(id,i+1)}</div><div class="ld-cs-b">${V[id==='what'?'filing':id]()}</div></div>`).join('')}</div></div></div></section>`
 +endSec().replace('class="ld-sec ld-end"','class="ld-sec ld-end" style="padding-top:calc(var(--vh)*.6)"'),
 measure(s){const r=s.root;s.cp=r.querySelector('.ld-cpanel');s.cs=[...r.querySelectorAll('.ld-cstep')].map(el=>({el,a:el.querySelector('.ld-cs-a'),b:el.querySelector('.ld-cs-b'),parts:[...el.querySelectorAll('.ld-cs-b .ld-bub,.ld-cs-b .ld-thr,.ld-cs-b .ld-card,.ld-cs-b .ld-tci,.ld-cs-b .ld-me,.ld-cs-b .ld-reply,.ld-cs-b .ld-ag')]}))},
 update(s){const zin=ease(cl(s.k/1.05)),zout=endW(s,.08,.42);
  const sc=mix(1+Math.pow(zin,2.4)*17,.36,zout),oy=mix(.426,0,zout)*s.S,Oy=s.vh/2+oy;
  placeMark(s,s.vw/2,Oy-oy*sc-zout*s.vh*.2,sc,mix(.75,1,zin*(1-zout)));
  s.cl.style.opacity=(.72*(1-.6*zin*(1-zout))).toFixed(3);
  const st=s.s.story;
  if(st&&s.cs){const a0=s.vh*.95,pos=cl((s.y-a0)/Math.max(1,st.h-s.vh+s.HD-a0))*4;
   const inn=ease(cl((s.k-.55)/.4)),out=ease(cl((pos-3.82)/.18)),po=inn*(1-out);
   s.cp.style.opacity=po.toFixed(3);s.cp.style.transform=`scale(${(.95+.05*po).toFixed(4)})`;s.cp.style.pointerEvents=po>.5?'':'none';
   s.cs.forEach((c,j)=>{const o=win(pos,j),dir=pos<j+.5?1:-1,bl=((1-o)*10).toFixed(1);
    c.el.style.opacity=o;c.el.style.pointerEvents=o>.5?'':'none';
    c.a.style.transform=`translateY(${((1-o)*dir*22).toFixed(1)}px)`;c.a.style.filter=o<1?`blur(${bl}px)`:'';
    const u=j===0?Math.max(inn,cl(pos/.6)):cl((pos-j+.1)/.6);
    c.parts.forEach((p,i)=>{const e=ease(cl(u*1.6-i*.12));p.style.opacity=e;p.style.transform=`translateY(${((1-e)*18).toFixed(1)}px) scale(${(.97+.03*e).toFixed(3)})`})})}
  return{amt:mix(.25,.62,zin*(1-zout)),hue:s.p*1.1,zm:1+zin*(1-zout)*.8,t:40+s.time+s.y*.006}}
};
window.LD_DIRS={b:B,c:Cd};
})();
