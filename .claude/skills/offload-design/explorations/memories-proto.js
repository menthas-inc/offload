/* Memories tab, clickable. List and map of one set of memories; tap either to edit. */
(function(){
const g=(n,s)=>`<i class="g" style="--ic:url(../assets/icons/${n}.svg)${s?';width:'+s+'px;height:'+s+'px':''}"></i>`;
const K={people:{l:'People',ic:'users',c:'var(--label-2)'},things:{l:'Things',ic:'tag',c:'var(--label-1)'},about:{l:'About',ic:'heart',c:'var(--label-6)'},rules:{l:'Rules',ic:'compass',c:'var(--ink-950)'},patterns:{l:'Patterns',ic:'spline',c:'var(--label-5)'}};
const KO=['people','things','about','rules','patterns'];
/* A world 800 wide and 1500 tall, because a phone is tall: the kinds stack down it.
   Each memory has its own row inside its kind, so sentences never sit on each other. */
const TALL={W:800,H:1500};
const CLT={people:[255,260,210],things:[560,560,180],patterns:[220,830,150],about:[420,1110,250],rules:[600,1380,140]};
const SUBT=[['people',265,170,100],['people',250,330,100],['things',470,470,80],['things',625,590,95],['patterns',225,830,95],['about',340,1030,105],['about',560,1010,75],['about',370,1210,105],['rules',600,1380,95]];
const SEED=[
 ['people','Their wife is Meera.','stated',3,'Said in Lisbon trip',200,140],
 ['people','Meera\u2019s birthday is 14 March.','stated',3,'Said in Lisbon trip',330,200],
 ['people','They call their mother Maman.','learned',1,'From what you said in Sunday lunch',180,300],
 ['people','Their brother is Arjun.','learned',8,'From what you said in Bookshelf build',320,360],
 ['things','They share a calendar with Meera.','answered',4,'Your answer to \u201cWhich calendar is shared with Meera?\u201d',470,470],
 ['things','Home is in Toronto.','learned',10,'From a note in Groceries',590,560],
 ['things','Their car is a 2019 Civic.','stated',17,'Said in Car',650,620],
 ['about','\u201cThe cottage\u201d is the place in Muskoka.','learned',1,'From what you said in Long weekend',570,1010],
 ['about','\u201cStandup\u201d is their 9:30 work meeting.','learned',6,'From a note in Work',380,1060],
 ['about','They work at Shopify as a designer.','stated',24,'Said in Work',300,1000],
 ['about','They have two kids, Sam and Leila.','learned',12,'From a note in School',420,1180],
 ['about','They are allergic to nuts.','stated',26,'Said in Groceries',300,1240],
 ['rules','They write dates day first.','stated',28,'Said in Lisbon trip',560,1350],
 ['rules','Work things never go in Home.','stated',28,'Said in Home',640,1410],
 ['patterns','They pay bills on the 5th.','learned',0,'From notes in Home and Bills',190,800],
 ['patterns','They shop for groceries on Sundays.','learned',5,'From notes in Groceries',260,860]
];
/* Wide screens get the kinds side by side instead. Each kind moves as a block, so what sits near what
   inside a kind is the same in both. */
const CLW={people:[300,300,210],things:[760,260,180],patterns:[1160,330,150],about:[520,700,250],rules:[1060,720,140]};
let WW=800,WH=1500,CL=CLT,SUB=SUBT,WIDE=false;
function setLayout(wide){WIDE=wide;WW=wide?1440:800;WH=wide?960:1500;CL=wide?CLW:CLT;SUB=SUBT.map(s=>{const a=CLT[s[0]],b=CL[s[0]];return[s[0],s[1]-a[0]+b[0],s[2]-a[1]+b[1],s[3]]})}
const P_=m=>{const a=CLT[m.k],b=CL[m.k];return[m.x-a[0]+b[0],m.y-a[1]+b[1]]};
const DAY=n=>n===0?'Today':n===1?'Yesterday':(()=>{const d=new Date(2026,9,6-n);return d.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]})();
let uid=0;
const S={mems:SEED.map(r=>({id:++uid,k:r[0],t:r[1],o:r[2],n:r[3],s:r[4],x:r[5],y:r[6]})),
 view:'list',sort:'kind',q:'',search:false,open:null,draft:'',dk:null,cam:{cx:WW/2,cy:WH/2,z:.38},toast:null,swiped:null,plat:'ios'};
const OPEN_AT=.55,ZMIN=.3,ZMAX=2.4;
const kv=(k,x='')=>`data-k="${k}" style="--k:${K[k].c};${x}"`;
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const meta=m=>`<span class="mt">${m.o==='learned'?`<span class="lr">${g('sparkles')}Learned</span>`:`<span>${m.o==='answered'?'Your answer':'You said'}</span>`}<span>\u00b7</span><span>${DAY(m.n)}</span></span>`;
const match=m=>!S.q||m.t.toLowerCase().includes(S.q.toLowerCase());
const byId=id=>S.mems.find(m=>m.id===id);
const web=()=>S.plat==='web';
let root,stage;

/* ---------- shell ---------- */
const LOGO=`<svg width="20" height="20" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="21" r="10" fill="currentColor"/><path d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/></svg>`;
const vt=()=>`<span class="vt" role="tablist" aria-label="View">${['list','map'].map(v=>`<button role="tab" data-act="view" data-v="${v}" aria-label="${v==='list'?'List':'Map'}" aria-selected="${S.view===v}" class="vs${S.view===v?' on':''}">${g(v,16)}</button>`).join('')}</span>`;
function shell(){
 if(web())return `<div class="wb pw"><nav class="side"><span class="brand">${LOGO}offload</span><span class="ni">${g('sun')}Today</span><span class="ni">${g('message-circle')}My threads<em>14</em></span><span class="ni on">${g('cloudy')}Memories<em id="cnt">${S.mems.length}</em></span><span class="sl">Recent</span>${['Lisbon trip','Bookshelf build','Groceries','Work'].map(n=>`<span class="ni">${g('lasso')}${n}</span>`).join('')}<span class="ft"></span><span class="ni">${g('bell')}Activity</span><span class="ni">${g('settings')}Settings</span></nav>
<div class="wm"><header class="wh2"><h1>Memories</h1><label class="srch wsr">${g('search',15)}<input id="q" placeholder="Search memories" value="${esc(S.q)}"></label>${vt()}<button class="wbtn" data-act="new">${g('plus')}New memory</button></header><div class="wcols"><div class="wmain" id="main"></div><aside class="wpane" id="pane"></aside></div></div><div id="toast"></div></div>`;
 const st=S.plat==='android'?`<div class="stb"><span>9:41</span><i>\u25be \u25b4 \u25ae</i></div>`:`<div class="stb"><span>9:41</span><i>\u25cf\u25cf\u25cf \u25ae</i></div>`;
 return `<div class="ph pp">${st}<div class="ab"><h1>Memories</h1>${vt()}<button class="ib${S.search?' on':''}" data-act="search" aria-label="Search">${g('search')}</button><button class="ib" data-act="new" aria-label="New memory">${g('plus')}</button></div>
<div id="sbar">${sbar()}</div><div class="body" id="main"></div><div class="plate"><div class="cmp"><s>Dump anything</s><span>${g('camera')}</span><span>${g('mic')}</span></div><div class="tabs"><span>${g('sun')}Today</span><span>${g('message-circle')}Threads</span><span class="on">${g('cloudy')}Memories</span></div><div class="hb"><i></i></div></div><div id="sheet"></div><div id="toast"></div></div>`;
}
const sbar=()=>S.search?`<label class="srch">${g('search',16)}<input id="q" placeholder="Search memories" value="${esc(S.q)}"><button data-act="clearq" aria-label="Clear" style="display:${S.q?'flex':'none'}">${g('x',15)}</button></label>`:'';

/* ---------- list ---------- */
function rowH(m){const sw=S.swiped===m.id,on=web()&&S.open===m.id;return `<div class="swp${sw?' open':''}" data-row="${m.id}"><button class="act" data-act="forget" data-id="${m.id}">Forget</button><div class="rw${S.sort==='new'?' ind':''}${on?' on':''}" ${kv(m.k,sw?'transform:translateX(-96px)':'')} role="button" tabindex="0">${S.sort==='new'?'<span class="dot"></span>':''}<span class="tx"><b>${esc(m.t)}</b>${meta(m)}</span></div></div>`}
function listH(){
 const ms=S.mems.filter(match);
 let h=`<div class="sg" role="tablist" aria-label="Sort">${[['kind','By kind'],['new','Newest']].map(o=>`<button role="tab" data-act="sort" data-v="${o[0]}" aria-selected="${S.sort===o[0]}" class="${S.sort===o[0]?'on':''}">${o[1]}</button>`).join('')}</div>`;
 if(!ms.length)return h+`<p class="cap" style="text-align:center;margin-top:60px">Nothing kept says \u201c${esc(S.q)}\u201d.</p>`;
 if(S.sort==='kind')KO.forEach(k=>{const a=ms.filter(m=>m.k===k);if(!a.length)return;h+=`<div class="sh" ${kv(k)}><span class="sw"></span>${K[k].l}<em>${a.length}</em></div>`+a.map(rowH).join('')});
 else{const a=[...ms].sort((p,q)=>p.n-q.n);const wk=a.filter(m=>m.n<=7),old=a.filter(m=>m.n>7);
  if(wk.length)h+=`<div class="sh">This week<em>${wk.length}</em></div>`+wk.map(rowH).join('');
  if(old.length)h+=`<div class="sh">Earlier<em>${old.length}</em></div>`+old.map(rowH).join('')}
 return h+'<div style="height:28px"></div>';
}

/* ---------- map ---------- */
let MW=390,MH=600;
function mapH(){
 const {cx,cy,z}=S.cam,X=x=>(x-cx)*z+MW/2,Y=y=>(y-cy)*z+MH/2,near=z>=OPEN_AT;
 let h=`<div class="tex"></div>`;
 KO.forEach(k=>{const c=CL[k],r=c[2]*z*1.3;h+=`<span class="cl" ${kv(k,`left:${X(c[0])-r}px;top:${Y(c[1])-r}px;width:${r*2}px;height:${r*2}px`)}></span>`});
 SUB.forEach(s=>{const r=s[3]*z;h+=`<span class="sub" ${kv(s[0],`left:${X(s[1])-r}px;top:${Y(s[2])-r}px;width:${r*2}px;height:${r*2}px`)}></span>`});
 const fs=Math.min(15.5,Math.max(10,7+z*6)),mw=Math.round(fs*17);
 S.mems.forEach(m=>{const [wx,wy]=P_(m),x=X(wx),y=Y(wy);if(x<-200||x>MW+200||y<-50||y>MH+50)return;const dim=match(m)?'':' dim';
  if(!near){h+=`<span class="md${m.o==='learned'?' lrn':''}${dim}" data-act="dot" data-id="${m.id}" ${kv(m.k,`left:${x}px;top:${y}px`)}></span>`;return}
  h+=`<span class="mp${S.open===m.id?' tap':''}${dim}" data-act="open" data-id="${m.id}" ${kv(m.k,`left:${x}px;top:${y}px;font-size:${fs.toFixed(1)}px;max-width:${mw}px;padding:${(fs*.45).toFixed(1)}px ${(fs*.75).toFixed(1)}px;border-radius:${(fs*1.1).toFixed(1)}px`)}>${m.o==='learned'?g('sparkles',Math.round(fs*.8)):''}<span>${esc(m.t)}</span></span>`});
 /* kind labels: over their cloud while it is on screen, pinned to the edge once it is not */
 /* kind labels sit over their cloud while it is on screen. Once it is not, it joins one dock along the top,
    with an arrow pointing the way, so labels never land on each other or on a memory */
 const dock=[];
 KO.forEach(k=>{const c=CL[k],n=S.mems.filter(m=>m.k===k).length,rx=X(c[0]),ry=Y(c[1]-c[2]*(near?.98:.78));
  if(rx>-10&&rx<MW+10&&ry>-10&&ry<MH+10){h+=`<button class="cln" data-act="fly" ${kv(k,`left:${rx}px;top:${ry}px`)}>${g(K[k].ic,14)}${K[k].l}<u>${n}</u></button>`;return}
  if(near){const ang=Math.atan2(Y(c[1])-MH/2,X(c[0])-MW/2)*180/Math.PI+90;dock.push(`<button class="cln dk" data-act="fly" ${kv(k)}>${K[k].l}<i class="g" style="--ic:url(../assets/icons/arrow-up.svg);width:13px;height:13px;transform:rotate(${ang.toFixed(0)}deg)"></i></button>`)}});
 if(dock.length)h+=`<div class="dock">${dock.join('')}</div>`;
 const zp=Math.max(0,Math.min(1,Math.log(S.cam.z/ZMIN)/Math.log(ZMAX/ZMIN)));
 h+=`<span class="zm"><button data-act="zin" aria-label="Zoom in">${'+'}</button><b><i style="height:${Math.max(6,zp*100).toFixed(0)}%"></i></b><button data-act="zout" aria-label="Zoom out">\u2212</button></span>`;
 if(z>fitZ()*1.4)h+=`<button class="zall" data-act="all">Everything</button>`;
 return h;
}
const fitZ=()=>Math.max(ZMIN,Math.min(MW/WW,MH/WH)*.94);
function drawMap(){const fd=root.querySelector('.fd');if(fd)fd.innerHTML=mapH()}
const clampCam=()=>{const c=S.cam;c.z=Math.min(ZMAX,Math.max(ZMIN,c.z));c.cx=Math.min(WW,Math.max(0,c.cx));c.cy=Math.min(WH,Math.max(0,c.cy))};
function zoomAt(px,py,nz){const c=S.cam,wx=c.cx+(px-MW/2)/c.z,wy=c.cy+(py-MH/2)/c.z;c.z=Math.min(ZMAX,Math.max(ZMIN,nz));c.cx=wx-(px-MW/2)/c.z;c.cy=wy-(py-MH/2)/c.z;clampCam();drawMap()}
let flyRaf;
function fly(cx,cy,z){cancelAnimationFrame(flyRaf);const a={...S.cam},t0=performance.now(),D=520;
 const step=t=>{const p=Math.min(1,(t-t0)/D),e=1-Math.pow(1-p,3);S.cam.cx=a.cx+(cx-a.cx)*e;S.cam.cy=a.cy+(cy-a.cy)*e;S.cam.z=a.z*Math.pow(z/a.z,e);drawMap();if(p<1)flyRaf=requestAnimationFrame(step)};flyRaf=requestAnimationFrame(step)}

/* ---------- editor ---------- */
function edH(){
 const isNew=S.open==='new',m=isNew?null:byId(S.open);if(!isNew&&!m)return '';
 const head=web()?`<div class="eh"><b>${isNew?'New memory':'Memory'}</b><button class="ib" data-act="close" aria-label="Close">${g('x',18)}</button></div>`
  :`<div class="eh"><button class="tl" data-act="close">Cancel</button><b>${isNew?'New memory':'Memory'}</b><button class="tl strong" data-act="save" id="savebtn">${isNew?'Add':'Save'}</button></div>`;
 const why=isNew?`<div class="why">${g('compass',16)}<span>A <b>rule</b> is followed in every thread. Anything else is something offload knows, and uses when filing and answering.</span></div>`
  :`<div class="why">${g(m.o==='learned'?'sparkles':m.o==='answered'?'message-circle-more':'text-quote',16)}<span>${m.o==='learned'?`<b>offload learned this</b> ${m.n<2?DAY(m.n).toLowerCase():'on '+DAY(m.n)}. ${m.s}.`:m.o==='answered'?`<b>${m.s}</b> on ${DAY(m.n)}. It picks that calendar the next time you say \u201cwith Meera\u201d.`:`<b>You asked offload to remember this</b> on ${DAY(m.n)}. ${m.s}.`}</span></div>`;
 const foot=web()?`<div class="ef">${isNew?'':`<button class="forget" data-act="forget" data-id="${m.id}">${g('trash-2',16)}Forget</button>`}<span style="flex:1"></span><button class="wbtn ol" data-act="close">Cancel</button><button class="wbtn" data-act="save" id="savebtn">${isNew?'Add':'Save'}</button></div>`
  :(isNew?'':`<button class="forget" data-act="forget" data-id="${m.id}">${g('trash-2',17)}Forget</button>`);
 return `${head}<div class="fld"><textarea id="ta" rows="3" maxlength="200" placeholder="Something offload should know in every thread">${esc(S.draft)}</textarea><div class="cnt"><span id="cc">${S.draft.length}</span>/200</div></div>
<div class="slab">Kind</div><div class="kgrid" role="radiogroup" aria-label="Kind">${KO.map(k=>`<button role="radio" aria-checked="${k===S.dk}" class="ko${k===S.dk?' on':''}" data-act="kind" ${kv(k)}>${g(K[k].ic,16)}<span>${K[k].l}</span></button>`).join('')}</div>${why}${foot}`;
}
function paintEd(anim){
 const ed=edH();
 if(web()){const p=root.querySelector('#pane');p.innerHTML=ed;p.classList.toggle('open',!!ed);if(S.view==='map')measureMap();return}
 const host=root.querySelector('#sheet');
 if(!ed){host.innerHTML='';return}
 host.innerHTML=`<div class="dim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><span class="grab"></span>${ed}</div>`;
 const sh=host.querySelector('.sheet'),dm=host.querySelector('.dim');
 if(anim){sh.getBoundingClientRect();requestAnimationFrame(()=>{sh.classList.add('up');dm.classList.add('up')})}else{sh.classList.add('up');dm.classList.add('up')}
}
function openEd(id){
 if(id==='new'){S.open='new';S.draft='';S.dk=S.view==='map'&&S.cam.z>=OPEN_AT?nearestKind():null}
 else{const m=byId(id);S.open=id;S.draft=m.t;S.dk=m.k}
 if(S.swiped!==null){S.swiped=null;paintMain(true)}
 paintEd(true);if(web())paintMain(true);else if(S.view==='map')drawMap();
 syncSave();
 /* focus once the sheet has arrived: focusing inside a box that is still off screen scrolls its parents */
 setTimeout(()=>{const ta=root.querySelector('#ta');if(ta){ta.focus({preventScroll:true});ta.setSelectionRange(ta.value.length,ta.value.length)}},web()?0:300);
}
function nearestKind(){let b=null,d=1e9;KO.forEach(k=>{const c=CL[k],e=Math.hypot(c[0]-S.cam.cx,c[1]-S.cam.cy);if(e<d){d=e;b=k}});return b}
function closeEd(){
 const sh=root.querySelector('#sheet .sheet');
 if(sh){sh.classList.remove('up');root.querySelector('#sheet .dim').classList.remove('up');setTimeout(()=>{S.open=null;paintEd();if(S.view==='map')drawMap()},260)}
 else{S.open=null;paintEd();paintMain(true)}
}
function syncSave(){root.querySelectorAll('#savebtn').forEach(b=>b.disabled=!(S.draft.trim()&&S.dk))}
const spot=(k,m)=>{const c=CLT[k],ys=S.mems.filter(o=>o.k===k&&o!==m).map(o=>o.y);let y=c[1]-c[2]*.5;for(let i=0;i<20&&ys.some(v=>Math.abs(v-y)<56);i++)y+=58;return[c[0]+(Math.random()-.5)*c[2]*.6,Math.min(c[1]+c[2]*.8,y)]};
function save(){
 const t=S.draft.replace(/\s+/g,' ').trim();if(!t||!S.dk)return;
 if(S.open==='new'){const [x,y]=spot(S.dk);S.mems.push({id:++uid,k:S.dk,t,o:'stated',n:0,s:'Typed in Memories',x,y});toast('Remembered')}
 else{const m=byId(S.open);if(m.k!==S.dk){[m.x,m.y]=spot(S.dk,m);m.k=S.dk}if(m.t!==t){m.t=t;if(m.o==='learned'){m.o='stated';m.s='Changed in Memories';m.n=0}}toast('Saved')}
 paintMain(true);closeEd();
}
function forget(id){const i=S.mems.findIndex(m=>m.id===id);if(i<0)return;const [m]=S.mems.splice(i,1);S.swiped=null;
 const wasOpen=S.open!==null;paintMain(true);if(wasOpen)closeEd();toast('Memory forgotten',()=>{S.mems.splice(i,0,m);paintMain(true)})}
let tT;
function toast(text,undo){clearTimeout(tT);S.toast={text,undo};paintToast();tT=setTimeout(()=>{S.toast=null;paintToast()},undo?8000:2400)}
function paintToast(){const el=root.querySelector('#toast');if(el)el.innerHTML=S.toast?`<div class="toast" role="status"><span>${S.toast.text}</span>${S.toast.undo?'<button data-act="undo">Undo</button>':''}</div>`:''}

/* ---------- paint ---------- */
/* The layout is picked once, from the map's shape when it first opens, and kept: opening the editor pane or resizing never reshuffles it. */
function measureMap(){const fd=root.querySelector('.fd');if(!fd)return;const w=fd.offsetWidth,h=fd.offsetHeight;MW=w;MH=h;
 if(!S._camSet){setLayout(w>h*1.1);S.cam={cx:WW/2,cy:WH/2,z:fitZ()};S._camSet=true}
 drawMap()}
function paintMain(keep){
 const main=root.querySelector('#main');const sc=main.querySelector('.lsc'),top=keep&&sc?sc.scrollTop:0;
 main.classList.toggle('mapmode',S.view==='map');
 if(S.view==='map'){if(!main.querySelector('.fd'))main.innerHTML='<div class="fd"></div>';measureMap()}
 else{main.innerHTML=`<div class="lsc">${listH()}</div>`;main.querySelector('.lsc').scrollTop=top}
 const c=root.querySelector('#cnt');if(c)c.textContent=S.mems.length;
}
function paint(){root.innerHTML=shell();fit();paintMain();paintEd();paintToast()}
function fit(){const el=root.firstElementChild;if(!el)return;el.style.transform='';const w=el.offsetWidth,h=el.offsetHeight,aw=stage.clientWidth-8,ah=Math.max(360,window.innerHeight-stage.getBoundingClientRect().top-16);const s=Math.min(1,aw/w,ah/h);el.style.transform=`scale(${s})`;el.style.transformOrigin='top left';root.style.width=w*s+'px';root.style.height=h*s+'px'}
const scaleOf=()=>{const el=root.firstElementChild;return el.getBoundingClientRect().width/el.offsetWidth};
function setView(v){S.view=v;S.swiped=null;root.querySelectorAll('.vs').forEach(b=>{b.classList.toggle('on',b.dataset.v===v);b.setAttribute('aria-selected',b.dataset.v===v)});
 paintMain()}

/* ---------- input ---------- */
function bind(){
 let moved=false;
 root.addEventListener('click',e=>{const a=e.target.closest('[data-act]');if(!a||moved)return;const act=a.dataset.act;
  if(act==='view')setView(a.dataset.v);
  else if(act==='sort'){S.sort=a.dataset.v;paintMain()}
  else if(act==='search'){S.search=!S.search;if(!S.search)S.q='';a.classList.toggle('on',S.search);root.querySelector('#sbar').innerHTML=sbar();paintMain(true);if(S.search)root.querySelector('#q').focus({preventScroll:true})}
  else if(act==='clearq'){S.q='';root.querySelector('#q').value='';a.style.display='none';paintMain(true)}
  else if(act==='new')openEd('new');
  else if(act==='open')openEd(+a.dataset.id);
  else if(act==='close')closeEd();
  else if(act==='save')save();
  else if(act==='kind'){S.dk=a.dataset.k;root.querySelectorAll('.ko').forEach(b=>{const on=b.dataset.k===S.dk;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});syncSave()}
  else if(act==='forget')forget(+a.dataset.id);
  else if(act==='undo'){const u=S.toast&&S.toast.undo;S.toast=null;paintToast();u&&u()}
  else if(act==='fly'){const c=CL[a.dataset.k];fly(c[0],c[1],Math.min(1.05,Math.max(.8,MW/(c[2]*2.6))))}
  else if(act==='dot'){const m=byId(+a.dataset.id),[wx,wy]=P_(m);fly(wx,wy,Math.max(OPEN_AT*1.6,S.cam.z))}
  else if(act==='zin')fly(S.cam.cx,S.cam.cy,Math.min(ZMAX,S.cam.z*1.5));
  else if(act==='zout')fly(S.cam.cx,S.cam.cy,Math.max(ZMIN,S.cam.z/1.5));
  else if(act==='all')fly(WW/2,WH/2,fitZ());
 });
 root.addEventListener('input',e=>{if(e.target.id==='ta'){S.draft=e.target.value;root.querySelector('#cc').textContent=S.draft.length;syncSave()}
  if(e.target.id==='q'){S.q=e.target.value;const c=root.querySelector('[data-act=clearq]');if(c)c.style.display=S.q?'flex':'none';paintMain(true)}});
 root.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&S.open){e.preventDefault();closeEd()}
  if(e.target.id==='ta'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();save()}
  if(e.key==='Enter'&&e.target.classList.contains('rw'))openEd(+e.target.closest('[data-row]').dataset.row);
 });
 const P=new Map();let mode=null,start=null,rowEl=null,rowId=null,pinch0=null;
 const local=e=>{const fd=root.querySelector('.fd'),r=fd.getBoundingClientRect(),s=scaleOf();return[(e.clientX-r.left)/s,(e.clientY-r.top)/s]};
 root.addEventListener('pointerdown',e=>{moved=false;
  const fd=e.target.closest('.fd');
  if(fd&&!e.target.closest('.zm,.zall')){P.set(e.pointerId,local(e));mode='map';start={cam:{...S.cam},p:local(e)};cancelAnimationFrame(flyRaf);if(P.size===2){const [a,b]=[...P.values()];pinch0={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:S.cam.z,mid:[(a[0]+b[0])/2,(a[1]+b[1])/2]}}return}
  const sw=e.target.closest('[data-row]');
  if(sw&&!e.target.closest('.act')){mode='row';rowEl=sw.querySelector('.rw');rowId=+sw.dataset.row;start={x:e.clientX,y:e.clientY,o:S.swiped===rowId?-96:0,h:null}}
 });
 window.addEventListener('pointermove',e=>{
  if(mode==='map'&&P.has(e.pointerId)){const p=local(e);P.set(e.pointerId,p);
   if(P.size===2&&pinch0){const [a,b]=[...P.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);moved=true;zoomAt(pinch0.mid[0],pinch0.mid[1],pinch0.z*d/pinch0.d);return}
   const dx=p[0]-start.p[0],dy=p[1]-start.p[1];if(Math.hypot(dx,dy)>5)moved=true;if(moved){S.cam.cx=start.cam.cx-dx/S.cam.z;S.cam.cy=start.cam.cy-dy/S.cam.z;clampCam();drawMap()}}
  if(mode==='row'&&!web()){const s=scaleOf(),dx=(e.clientX-start.x)/s,dy=(e.clientY-start.y)/s;
   if(start.h===null&&Math.hypot(dx,dy)>8)start.h=Math.abs(dx)>Math.abs(dy);
   if(start.h){moved=true;const x=Math.min(0,Math.max(-120,start.o+dx));rowEl.style.transition='none';rowEl.style.transform=`translateX(${x}px)`;rowEl.parentElement.classList.toggle('open',x<0);start.last=x}
   else if(start.h===false)mode=null}
 });
 window.addEventListener('pointerup',e=>{
  if(mode==='map'){P.delete(e.pointerId);if(P.size<2)pinch0=null;if(P.size===0){mode=null;setTimeout(()=>{moved=false},0)}return}
  if(mode==='row'){mode=null;
   if(start.h){const open=(start.last??0)<-48;rowEl.style.transition='';rowEl.style.transform=open?'translateX(-96px)':'';rowEl.parentElement.classList.toggle('open',open);S.swiped=open?rowId:null;setTimeout(()=>{moved=false},0)}
   else if(!moved){if(S.swiped!==null){const id=S.swiped;S.swiped=null;const r=root.querySelector(`[data-row="${id}"]`);if(r){r.classList.remove('open');r.querySelector('.rw').style.transform=''}}else openEd(rowId)}}
 });
 root.addEventListener('wheel',e=>{const fd=e.target.closest('.fd');if(!fd)return;e.preventDefault();cancelAnimationFrame(flyRaf);const [x,y]=local(e);zoomAt(x,y,S.cam.z*Math.exp(-e.deltaY*(e.ctrlKey?.012:.0022)))},{passive:false});
 window.addEventListener('resize',()=>{fit();if(S.view==='map')measureMap()});
}
window.MEMP={start(r,s){root=r;stage=s;bind();paint()},plat(p){S.plat=p;S.open=null;S.swiped=null;S.view='list';S._camSet=false;paint()}};
})();
