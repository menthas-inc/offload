/* Thread marks exploration: data and renderers. */
const LU='https://cdn.jsdelivr.net/npm/lucide-static@0.469.0/icons/';
const LOCAL=new Set(['lasso','bookmark','house','newspaper','users','sun','brain','search','plus','x','chevron-left','chevron-right','ellipsis','calendar','tag','map-pin','check','bell','settings','list','sparkles','pencil','share-2','clock','link','text-quote','camera','mic','image']);
const gi=(n,c='')=>`<span class="g ${c}" style="--ic:url(${LOCAL.has(n)?'../assets/icons/'+n+'.svg':LU+n+'.svg'})"></span>`;
const FE=cp=>`https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/${cp}_flat.svg`;
const emo=(cp,ch)=>`<img class="emo" src="${FE(cp)}" alt="" onerror="this.outerHTML='<span class=&quot;emo t&quot;>${ch}</span>'">`;
const THREADS=[
 {n:'Lisbon trip',m:'4 open · Ana, Tom',ic:'luggage',e:['1f9f3','🧳'],h:1,sh:1},
 {n:'Bookshelf build',m:'2 open',ic:'hammer',e:['1f528','🔨'],h:5},
 {n:'Dentist and insurance',m:'1 open',ic:'stethoscope',e:['1f9b7','🦷'],h:6},
 {n:'Flat admin',m:'6 open · Sam',ic:'house',e:['1f3e0','🏠'],h:3,sh:1},
 {n:'Books to read',m:'31 kept',ic:'book-open',e:['1f4da','📚'],h:4},
 {n:"Ana's birthday",m:'3 open · Tom',ic:'gift',e:['1f381','🎁'],h:2,sh:1},
 {n:'Half marathon',m:'Plan, 12 weeks',ic:'footprints',e:['1f3c3','🏃'],h:10},
 {n:'Balcony garden',m:'5 kept',ic:'sprout',e:['1f331','🌱'],h:8},
 {n:'Car service',m:'Due 20 Oct',ic:'car',e:['1f697','🚗'],h:9},
 {n:'Taxes 2026',m:'2 open',ic:'receipt',e:['1f9fe','🧾'],h:7},
 {n:'Read later',m:'23 kept',ic:'newspaper',e:['1f4f0','📰'],h:1}
];
/* mode: now | A (glyph+colour) | Am (glyph only) | B (flat emoji) | C (colour only) */
function mark(t,mode,size=40){
 const s=`width:${size}px;height:${size}px;--k:${size}px`;
 if(mode==='A')return `<span class="mk tint" style="${s};--h:var(--label-${t.h})">${gi(t.ic)}</span>`;
 if(mode==='Am')return `<span class="mk" style="${s}">${gi(t.ic)}</span>`;
 if(mode==='B')return `<span class="mk em" style="${s}">${emo(t.e[0],t.e[1])}</span>`;
 if(mode==='C')return `<span class="mk tint" style="${s};--h:var(--label-${t.h})">${gi('lasso')}</span>`;
 return `<span class="mk" style="${s}">${gi('lasso')}</span>`;
}
function pill(t,mode){
 const lead=mode==='B'?emo(t.e[0],t.e[1]):mode==='A'||mode==='Am'?gi(t.ic):mode==='C'?`<span class="dotc" style="--h:var(--label-${t.h})"></span>`:gi('lasso');
 return `<span class="tp${mode==='B'?' e':''}">${lead}${t.n}</span>`;
}
const stb=plat=>plat==='android'?'<div class="stb"><span>9:41</span><span>▾ ▴ ▮</span></div>':'<div class="stb"><span>9:41</span><span>●●● ▮</span></div>';
const home=plat=>plat==='ios'?'<div class="hb"><i></i></div>':'<div class="gb"><i></i></div>';
const tabs=on=>`<div class="tabs">${[['sun','Today'],['lasso','My threads'],['brain','Memories']].map(([i,l],k)=>`<span class="${k===on?'on':''}">${gi(i)}<b>${l}</b></span>`).join('')}</div>`;
const ph=(plat,inner,cls='')=>`<div class="ph ${cls}">${stb(plat)}${inner}${home(plat)}</div>`;
function list(plat,mode,n=9){
 return ph(plat,`<div class="lt"><h1>My threads</h1><span class="ib">${gi('search')}</span><span class="ib">${gi('plus')}</span></div><div class="body">${THREADS.slice(0,n).map(t=>`<div class="rw">${mark(t,mode,plat==='android'?44:40)}<div class="tx"><b>${t.n}</b><s>${t.m}</s></div>${t.sh?`<span class="shd">${gi('users')}</span>`:''}</div>`).join('')}</div>${tabs(1)}`);
}
function thread(plat,mode,t=THREADS[0]){
 const tile=mode==='now'?'':mark(t,mode,30);
 return ph(plat,`<div class="ab"><span class="bk">${gi('chevron-left')}</span><div class="abt">${tile}<b>${t.n}</b></div><span class="bk">${gi('ellipsis')}</span></div>
 <div class="body"><div class="hd">${mode==='now'?'':mark(t,mode,64)}<div><h2>${t.n}</h2><p>Ana, Tom and you · 14 Oct</p></div></div>
 <div class="sec">Before the trip</div>
 ${['Book the Alfama flat for the 14th','Flights, €214','Ana can only travel the 14th to the 17th'].map((x,i)=>`<div class="it"><i class="ck${i===1?' on':''}">${i===1?gi('check'):''}</i><span>${x}</span></div>`).join('')}
 <div class="sec">Places</div><div class="it">${gi('map-pin')}<span>Pastéis de Belém</span></div></div>
 <div class="cmp"><span>Add to Lisbon trip</span></div>`);
}
function today(plat,mode){
 const rows=[[THREADS[0],'Book the Alfama flat','Today'],[THREADS[2],'Call the insurer about the crown','Today'],[THREADS[8],'Car service at 9:00','Tomorrow'],[THREADS[5],'Order the cake','Thu']];
 return ph(plat,`<div class="lt"><h1>Today</h1><span class="ib">${gi('bell')}</span></div><div class="body">${rows.map(([t,x,d])=>`<div class="trw"><i class="ck"></i><div class="tx"><b>${x}</b><div class="mks">${pill(t,mode)}<span class="dc">${gi('calendar')}${d}</span></div></div></div>`).join('')}
 <div class="ans"><div class="q">Where did I put the shelf measurements?</div><div class="a">In ${pill(THREADS[1],mode)}: <b>matte black, 30cm</b>, and 4 more brackets.</div></div></div>${tabs(0)}`);
}
function picker(plat,mode){
 const t=THREADS[0];
 const sug=mode==='B'?[['1f9f3','🧳'],['1f6eb','🛫'],['1f30d','🌍'],['1f3e8','🏨'],['1f305','🌅'],['1f68c','🚌']]:['luggage','plane','globe','palmtree','map','hotel'];
 const cats=mode==='B'?
  [['Travel',['1f9f3','1f30d','1f697','1f6b2','26fa','1f3e8']],['Home',['1f3e0','1fa91','1f9f9','1f511','1fab4','1f6c1']],['Health',['1f9b7','1f48a','1f3c3','1f9d8','1fa7a','1f34e']],['Money',['1f9fe','1f4b6','1f3e6','1f4b3','1f4c8','1f45b']]]
  :[['Travel',['luggage','plane','car','bike','tent','palmtree']],['Home',['house','sofa','key','wrench','lamp','bath']],['Health',['stethoscope','pill','footprints','heart-pulse','dumbbell','apple']],['Money',['receipt','piggy-bank','landmark','credit-card','wallet','chart-line']]];
 const cell=x=>mode==='B'?`<span class="pk">${emo(Array.isArray(x)?x[0]:x,'')}</span>`:`<span class="pk">${gi(x)}</span>`;
 const sw=mode==='A'?`<div class="pl">Colour</div><div class="sws">${Array.from({length:10},(_,i)=>`<i class="${i===0?'on':''}" style="background:var(--label-${i+1})"></i>`).join('')}</div>`:'';
 return ph(plat,`<div class="dim"></div><div class="sheet"><i class="grab"></i><div class="shh"><b>Thread icon</b><span class="done">Done</span></div>
 <div class="prev">${mark(t,mode,56)}<div><b>${t.n}</b><s>offload picked this from the name</s></div></div>
 <div class="fs">${gi('search')}<span>${mode==='B'?'Search emoji':'Search icons'}</span></div>
 <div class="pl">Suggested for Lisbon trip</div><div class="pgrid">${sug.map((x,i)=>cell(x).replace('class="pk"',i===0?'class="pk on"':'class="pk"')).join('')}</div>
 ${sw}${cats.slice(0,mode==='A'?2:3).map(([c,a])=>`<div class="pl">${c}</div><div class="pgrid">${a.map(cell).join('')}</div>`).join('')}</div>`,'sheetph');
}
function web(mode,view){
 const side=`<div class="wsb"><b class="wl">offload</b><span>${gi('sun')}Today</span><span class="on">${gi('lasso')}My threads</span><span>${gi('brain')}Memories</span><span style="margin-top:auto">${gi('settings')}Settings</span></div>`;
 const col=`<div class="wls"><div class="wlh"><h3>My threads</h3><span class="ib">${gi('plus')}</span></div>${THREADS.map((t,i)=>`<div class="wrw${i===0?' on':''}">${mark(t,mode,32)}<div class="tx"><b>${t.n}</b><s>${t.m}</s></div></div>`).join('')}</div>`;
 const t=THREADS[0];
 const pane=view==='today'?`<div class="wpn"><h2 class="wtt">Today</h2>${[[THREADS[0],'Book the Alfama flat','Today'],[THREADS[2],'Call the insurer about the crown','Today'],[THREADS[8],'Car service at 9:00','Tomorrow'],[THREADS[5],'Order the cake','Thu']].map(([tt,x,d])=>`<div class="trw"><i class="ck"></i><div class="tx"><b>${x}</b><div class="mks">${pill(tt,mode)}<span class="dc">${gi('calendar')}${d}</span></div></div></div>`).join('')}</div>`
  :`<div class="wpn"><div class="wth">${mode==='now'?'':mark(t,mode,48)}<div><h2>${t.n}</h2><p>Ana, Tom and you · 14 Oct</p></div>${mode==='now'?'':'<span class="chg">Change icon</span>'}</div><div class="sec">Before the trip</div>${['Book the Alfama flat for the 14th','Flights, €214','Ana can only travel the 14th to the 17th'].map((x,i)=>`<div class="it"><i class="ck${i===1?' on':''}">${i===1?gi('check'):''}</i><span>${x}</span></div>`).join('')}</div>`;
 return `<div class="ph web">${side}${col}${pane}</div>`;
}
Object.assign(window,{list,thread,today,picker,web,THREADS,mark,gi});
