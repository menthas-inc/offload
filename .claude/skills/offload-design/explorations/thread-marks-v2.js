/* Thread marks v2: direction A (Lucide glyph + one hue, washed with the prism texture). */
const gi=(n,c='')=>`<span class="g ${c}" style="--ic:url(../assets/icons/${n}.svg)"></span>`;
/* The 70, in no groups: one scroll. Each carries the words that pick it. */
const ICONS=[
 ['luggage','trip travel holiday vacation packing'],['plane','flight flights airport'],['car','car service mot garage'],['bike','bike cycling ride'],['tent','camping festival'],
 ['map','route itinerary city'],['globe','abroad visa world'],['house','flat home house apartment rent'],['sofa','furniture living move moving'],['key','keys landlord lease'],
 ['wrench','repair fix plumber'],['hammer','build diy shelf bookshelf'],['paintbrush','paint decorate'],['sprout','garden balcony plants'],['flower-2','flowers wedding'],
 ['tree-pine','christmas hike forest'],['stethoscope','dentist doctor health insurance clinic'],['pill','meds pharmacy prescription'],['heart-pulse','fitness heart'],['dumbbell','gym workout'],
 ['footprints','run running marathon walk'],['apple','diet groceries'],['utensils','dinner recipes restaurant food'],['coffee','coffee cafe'],['wine','wine drinks bar'],
 ['cake','birthday cake party'],['gift','gift gifts present presents'],['party-popper','celebration party'],['baby','baby kids nursery'],['dog','dog puppy vet'],
 ['cat','cat'],['graduation-cap','school course study university'],['book-open','books reading read'],['briefcase','work job office'],['laptop','computer tech'],
 ['receipt','taxes tax receipts expenses'],['piggy-bank','savings budget'],['wallet','money spending'],['landmark','bank mortgage council'],['shopping-cart','shopping buy'],
 ['shirt','clothes wardrobe'],['music','music concert band'],['camera','photos photography'],['gamepad-2','games gaming'],['film','movies films watch'],
 ['palette','art design'],['newspaper','later articles news'],['mountain','ski climbing mountains'],['waves','beach surf swim'],['sparkles','ideas'],
 ['train-front','train rail'],['ship','ferry cruise boat'],['hotel','hotel stay'],['bed','bedroom sleep'],['lamp','lighting lamps'],
 ['fish','fishing aquarium'],['bird','birds birding'],['leaf','compost nature'],['sun','summer'],['snowflake','winter'],
 ['umbrella','rain'],['heart','dating love'],['users','family friends club'],['mic','podcast talk'],['pen-tool','writing blog novel'],
 ['code','code dev app'],['rocket','launch startup project'],['trophy','league competition'],['ticket','tickets show event'],['calendar-heart','anniversary']
];
const THREADS=[
 {n:'Lisbon trip',m:'4 open · Ana, Tom',ic:'luggage',h:1,sh:1},
 {n:'Bookshelf build',m:'2 open',ic:'hammer',h:5},
 {n:'Dentist and insurance',m:'1 open',ic:'stethoscope',h:6},
 {n:'Flat admin',m:'6 open · Sam',ic:'house',h:3,sh:1},
 {n:'Books to read',m:'31 kept',ic:'book-open',h:4},
 {n:"Ana's birthday",m:'3 open · Tom',ic:'gift',h:2,sh:1},
 {n:'Half marathon',m:'Plan, 12 weeks',ic:'footprints',h:10},
 {n:'Balcony garden',m:'5 kept',ic:'sprout',h:8},
 {n:'Car service',m:'Due 20 Oct',ic:'car',h:9},
 {n:'Taxes 2026',m:'2 open',ic:'receipt',h:7},
 {n:'Read later',m:'23 kept',ic:'newspaper',h:1}
];
/* The wash: the thread's one hue, with the prism texture's light and shade on it.
   Placement of the texture is seeded from the name so no two tiles wash alike. */
const seed=s=>[...s].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7);
function mark(t,size=40,{wash=true}={}){
 const k=seed(t.n),px=k%100,py=(k>>7)%100,r=(k>>3)%360;
 return `<span class="mk${wash?' wash':''}" style="width:${size}px;height:${size}px;--k:${size}px;--h:var(--label-${t.h});--px:${px}%;--py:${py}%;--r:${r}deg">${t.ic?gi(t.ic):''}</span>`;
}
const pill=t=>`<span class="tp">${mark(t,18)}${t.n}</span>`;
const stb=plat=>plat==='android'?'<div class="stb"><span>9:41</span><span>▾ ▴ ▮</span></div>':'<div class="stb"><span>9:41</span><span>●●● ▮</span></div>';
const home=plat=>plat==='ios'?'<div class="hb"><i></i></div>':'<div class="gb"><i></i></div>';
const tabs=on=>`<div class="tabs">${[['sun','Today'],['lasso','My threads'],['brain','Memories']].map(([i,l],k)=>`<span class="${k===on?'on':''}">${gi(i)}<b>${l}</b></span>`).join('')}</div>`;
const ph=(plat,inner,cls='')=>`<div class="ph ${cls}">${stb(plat)}${inner}${home(plat)}</div>`;
const seg=()=>`<span class="seg"><i class="on">${gi('list')}</i><i>${gi('map-pin')}</i></span>`;
/* The thread's app bar, as Thread.tsx's Bar draws it: back, name, then the tools.
   With the List | Map switch drawn, labels and calendars move into More. */
function bar(t,tools){
 const T={map:seg(),labels:`<span class="tb">${gi('tag')}</span>`,share:`<span class="tb">${gi('share-2')}</span>`,cal:`<span class="tb">${gi('calendar')}</span>`,more:`<span class="tb">${gi('ellipsis')}</span>`};
 return `<div class="ab"><span class="bk">${gi('chevron-left')}</span><span class="abm">${mark(t,28)}</span><b class="abt">${t.n}</b><span class="tools">${tools.map(x=>T[x]).join('')}</span></div>`;
}
const filter=labels=>`<div class="fb"><span class="fc on">All</span>${labels.map(([n,h])=>`<span class="fc"><i style="background:var(--label-${h})"></i>${n}</span>`).join('')}<span class="fp">${gi('plus')}</span></div>`;
function list(plat){
 return ph(plat,`<div class="lt"><h1>My threads</h1><span class="ib">${gi('search')}</span><span class="ib">${gi('plus')}</span></div><div class="body">${THREADS.slice(0,9).map(t=>`<div class="rw">${mark(t,plat==='android'?44:40)}<div class="tx"><b>${t.n}</b><s>${t.m}</s></div>${t.sh?`<span class="shd">${gi('users')}</span>`:''}</div>`).join('')}</div>${tabs(1)}`);
}
function thread(plat,t=THREADS[0]){
 const days=[['M',12],['T',13],['W',14,1],['T',15,1],['F',16,1],['S',17,1],['S',18]];
 return ph(plat,`${bar(t,['map','share','more'])}${filter([['Bookings',2],['Food',6],['To pack',9]])}
 <div class="body"><div class="rail"><div class="rh"><b>October</b><span>${gi('chevron-left')}${gi('chevron-right')}</span></div><div class="days">${days.map(([d,n,on])=>`<span class="${on?'on':''}${n===14?' t':''}"><s>${d}</s><b>${n}</b><i></i></span>`).join('')}</div>
 <div class="ev"><span class="evb"></span><div><b>Alfama flat</b><s>14 to 17 Oct</s></div></div></div>
 <div class="wh">To do<em>3</em></div>
 ${['Book the Alfama flat for the 14th','Ask Ana about the ferry','Pack the adaptor'].map((x,i)=>`<div class="it"><i class="ck"></i><span>${x}</span>${i===0?'<span class="lc" style="--h:var(--label-2)">Bookings</span>':''}</div>`).join('')}
 <div class="wh">Everything in here<em>9</em></div><div class="it">${gi('link')}<span>airbnb.com/rooms/4471</span></div></div>
 <div class="cmp"><span>Dump anything</span></div>`);
}
function bars(plat){
 const a=THREADS[0],b=THREADS[1],c={...THREADS[2],n:'Dentist and insurance claims for the crown'};
 return `<div class="ph bars">${[
  ['Lisbon trip: places, so List | Map is in the bar',bar(a,['map','share','more'])],
  ['Bookshelf build: no labels yet, a calendar connected',bar(b,['labels','share','cal','more'])],
  ['A long name: the name gives way, never the tools',bar(c,['share','cal','more'])]
 ].map(([l,h])=>`<div class="bl">${l}</div>${h}`).join('')}</div>`;
}
function today(plat){
 const rows=[[THREADS[0],'Book the Alfama flat','Today'],[THREADS[2],'Call the insurer about the crown','Today'],[THREADS[8],'Car service at 9:00','Tomorrow'],[THREADS[5],'Order the cake','Thu']];
 return ph(plat,`<div class="lt"><h1>Today</h1><span class="ib">${gi('bell')}</span></div><div class="body">${rows.map(([t,x,d])=>`<div class="trw"><i class="ck"></i><div class="tx"><b>${x}</b><div class="mks">${pill(t)}<span class="dc">${gi('calendar')}${d}</span></div></div></div>`).join('')}
 <div class="ans"><div class="q">Where did I put the shelf measurements?</div><div class="a">In ${pill(THREADS[1])}: <b>matte black, 30cm</b>, and 4 more brackets.</div></div></div>${tabs(0)}`);
}
function pickerBody(t){
 return `<div class="prev">${mark(t,56)}<div class="nf"><span class="nfl">Name</span><span class="nfv">${t.n}<i></i></span></div></div>
 <div class="pl">Icon</div><div class="pscroll"><div class="pgrid">${ICONS.map(([n])=>`<span class="pk${n===t.ic?' on':''}">${gi(n)}</span>`).join('')}</div></div>
 <div class="pl">Colour</div><div class="sws">${Array.from({length:10},(_,i)=>`<i class="${i+1===t.h?'on':''}">${mark({...t,ic:'',h:i+1,n:t.n+i},26)}</i>`).join('')}</div>`;
}
function picker(plat){
 const t=THREADS[0];
 return ph(plat,`${bar(t,['map','share','more'])}<div class="dim"></div><div class="sheet"><i class="grab"></i><div class="shh"><span class="cx">Cancel</span><b>Edit thread</b><span class="done">Save</span></div>${pickerBody(t)}</div>`,'sheetph');
}
function web(view){
 const t=THREADS[0];
 const side=`<div class="wsb"><b class="wl">offload</b><span>${gi('sun')}Today</span><span class="on">${gi('lasso')}My threads</span><span>${gi('brain')}Memories</span><span style="margin-top:auto">${gi('settings')}Settings</span></div>`;
 const col=`<div class="wls"><div class="wlh"><h3>My threads</h3><span class="ib">${gi('plus')}</span></div>${THREADS.map((x,i)=>`<div class="wrw${i===0?' on':''}">${mark(x,32)}<div class="tx"><b>${x.n}</b><s>${x.m}</s></div></div>`).join('')}</div>`;
 const head=`<div class="wth"><span class="wmk">${mark(t,36)}</span><h2>${t.n}</h2><span class="wsp"></span><span class="wsh">${gi('share-2')}Share</span>${seg()}<span class="tb">${gi('ellipsis')}</span></div>${filter([['Bookings',2],['Food',6],['To pack',9]])}`;
 const body=`<div class="wh">To do<em>3</em></div>${['Book the Alfama flat for the 14th','Ask Ana about the ferry','Pack the adaptor'].map(x=>`<div class="it"><i class="ck"></i><span>${x}</span></div>`).join('')}`;
 const pop=view==='picker'?`<div class="wpop"><div class="shh"><span class="cx">Cancel</span><b>Edit thread</b><span class="done">Save</span></div>${pickerBody(t)}</div>`:'';
 const today_=`<div class="wpn"><h2 class="wtt">Today</h2>${[[THREADS[0],'Book the Alfama flat','Today'],[THREADS[2],'Call the insurer about the crown','Today'],[THREADS[8],'Car service at 9:00','Tomorrow'],[THREADS[5],'Order the cake','Thu']].map(([tt,x,d])=>`<div class="trw"><i class="ck"></i><div class="tx"><b>${x}</b><div class="mks">${pill(tt)}<span class="dc">${gi('calendar')}${d}</span></div></div></div>`).join('')}</div>`;
 return `<div class="ph web">${side}${col}${view==='today'?today_:`<div class="wpn">${head}${body}${pop}</div>`}</div>`;
}
Object.assign(window,{list,thread,bars,today,picker,web,THREADS,ICONS,mark,gi});
