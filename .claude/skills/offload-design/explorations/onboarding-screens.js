/* Onboarding exploration: screens. Copy marked in the page as verbatim comes from apps/mobile/lib/gate.ts on main. */
const gi=(n,c='')=>`<span class="g ${c}" style="--ic:url(../assets/icons/${n}.svg)"></span>`;
const AVC={JM:'var(--label-1)',AD:'var(--label-2)',TR:'var(--label-6)'};
const avi=(i,s=28)=>`<span class="av" style="width:${s}px;height:${s}px;background:${AVC[i]};font-size:${Math.round(s*.38)}px">${i}</span>`;
const SCENES=[
 {t:'offload keeps track for you',s:'Dump the things you would otherwise forget. offload remembers them and puts them in order.'},
 {t:'Everything lands in threads',s:'Related things gather in one thread. Share it, and plan it with the people in it.'},
 {t:'Send it any way',s:'Type it, say it, snap a photo, or forward the email.'}
];
const DUMPS=[['Ana can only travel the 14th to the 17th','t0'],['matte black, 30cm','t1'],['€214 for the flights','t0'],['4 more shelf brackets','t1']];
const CONSENT={policyBefore:'I have read the ',policyLink:'privacy policy',policyAfter:'.',
 processing:'I understand offload will hold whatever I dump in, which can include health, money and other private matters, and I agree to it being processed to run offload.',
 note:'We do not recommend sharing passwords, card numbers or government IDs in any AI tool.'};
const EXAMPLES=['Book the Alfama flat for the 14th','Ana can only travel the 14th to the 17th','Oak brackets, 30cm, matte black'];

function art(){return `<div class="art">
<div class="sc sc0">${DUMPS.map(([d,to],i)=>`<div class="bw w${i}${i%2?' r':''}" data-to="${to}"><div class="bub b${i}">${d}</div></div>`).join('')}
 <div class="thr t0" data-n0="2" data-n1="4"><span class="tw">${gi('lasso')}</span><b>Lisbon trip</b><em>2</em></div>
 <div class="thr t1" data-n0="1" data-n1="3"><span class="tw">${gi('bookmark')}</span><b>Bookshelf build</b><em>1</em></div></div>
<div class="sc sc1"><div class="tc"><div class="tch"><span class="tw">${gi('lasso')}</span><b>Lisbon trip</b><span class="avs">${avi('JM')}<i class="a2">${avi('AD')}</i><i class="a3">${avi('TR')}</i></span></div>
 <div class="tci">${gi('calendar')}<span>Alfama flat, 14 to 17 Oct</span></div>
 <div class="tci">${gi('tag')}<span>Flights, €214</span></div>
 <div class="tci">${gi('text-quote')}<span>Ana can only travel the 14th to the 17th</span></div>
 <div class="tci nw">${avi('TR',20)}<span><b>Tom</b> added Pastéis de Belém</span></div></div>
 <div class="shr">${gi('users')}Shared with Ana and Tom</div></div>
<div class="sc sc2"><div class="ins">
 <div class="in i0"><div class="ph-img">${gi('image')}</div><span>${gi('camera')}Photo</span></div>
 <div class="in i1"><div class="wave">${Array.from({length:18},(_,k)=>`<u style="height:${[8,14,22,12,26,18,9,20,28,16,11,24,15,7,19,25,10,13][k]}px"></u>`).join('')}</div><span>${gi('mic')}Voice note, 0:12</span></div>
 <div class="in i2"><div class="ml"><b>Fwd: Your booking is confirmed</b><s>Alfama, 14 to 17 Oct</s></div><span>${gi('mail')}Email</span></div>
 <div class="in i3"><div class="ml"><b>airbnb.com/rooms/4471</b><s>Read and filed</s></div><span>${gi('link')}Link</span></div></div>
 <div class="filed">${gi('check')}All four filed in Lisbon trip</div></div>
</div>`}
const bars=()=>`<div class="bars">${SCENES.map((_,i)=>`<i class="bar b${i}"><u></u></i>`).join('')}</div>`;
const copy=()=>`<div class="copy">${SCENES.map((x,i)=>`<div class="cp c${i}"><h2>${x.t}</h2><p>${x.s}</p></div>`).join('')}</div>`;
function foot(pri,sec,{dis=0,stack=0}={}){
 const p=`<span class="btn pri${dis?' dis':''}">${pri}</span>`,s=sec?`<span class="btn sec">${sec}</span>`:'';
 return `<div class="ft${stack?' stack':''}${sec?'':' one'}">${stack?p+s:s+p}</div>`;
}
const stb=plat=>plat==='android'?'<div class="stb"><span>9:41</span><span>▾ ▴ ▮</span></div>':'<div class="stb"><span>9:41</span><span>●●● ▮</span></div>';
const home=plat=>plat==='ios'?'<div class="hb"><i></i></div>':'<div class="gb"><i></i></div>';
function phoneWrap(plat,inner,cls=''){return `<div class="ph ${cls}">${stb(plat)}${inner}${home(plat)}</div>`}
function webWrap(inner,cls=''){return `<div class="ph web ${cls}"><div class="wtop"><img src="../logos/svg/offload-lockup-black.svg" alt="offload"></div>${inner}</div>`}

/* The intro. scene: 'live' or 0..2 (a still at its end state). */
function story(plat,scene='live',opt={}){
 const live=scene==='live';
 const attrs=live?'data-live data-scene="0"':`data-scene="${scene}"`;
 const f=foot('Continue','',opt);
 if(plat==='web')return webWrap(`<div class="wstory story${live?'':' still'}" ${attrs}><div class="wart"><div class="bloom"></div>${art()}</div><div class="wtx">${bars()}${copy()}${f}</div></div>`);
 return phoneWrap(plat,`<div class="story${live?'':' still'}" ${attrs}><div class="top">${bars()}</div><div class="artbox"><div class="bloom"></div>${art()}</div>${copy()}${f}</div>`);
}
const tick=(on,html)=>`<div class="tk${on?' on':''}"><i>${on?gi('check'):''}</i><span>${html}</span></div>`;
function consentBlock(on){return `${tick(on,`${CONSENT.policyBefore}<a>${CONSENT.policyLink}</a>${CONSENT.policyAfter}`)}${tick(on,CONSENT.processing)}<div class="note">${gi('lock')}<span>${CONSENT.note}</span></div>`}
const nameField=(v)=>`<div class="fld${v?' has':''}"><span>${v||'Your name'}</span></div>`;

/* A and C: name and consent on one screen. */
function you(plat,filled){
 const body=`<div class="pg"><h1>Before you start</h1>
 <div class="blk"><h3>What should we call you?</h3>${nameField(filled?'Jo Martins':'')}<p class="hint">This is the name people you share a thread with will see.</p></div>
 <div class="blk"><h3>What you are agreeing to</h3>${consentBlock(filled)}</div></div>${foot('Continue','',{dis:!filled})}`;
 return plat==='web'?webWrap(`<div class="wcol">${body}</div>`):phoneWrap(plat,`<div class="scr">${body}</div>`);
}
const mailCard=(cmp)=>`<div class="cc"><div class="cch"><span class="mk ml">${gi('mail')}</span><div class="tx"><b>Forward emails to offload</b><s>Send anything to <span class="addr">over@to.offload.club</span> from jo@hey.com and it is filed.</s></div></div><div class="ccb">${cmp?'':'<span class="btn sm">'+gi('copy')+'Copy address</span>'}<span class="btn sm">${cmp?'Copy':'Add to contacts'}</span></div></div>`;
const calCard=(cmp,done)=>`<div class="cc"><div class="cch"><span class="mk gc"><span class="gcs"></span></span><div class="tx"><b>Bring in your calendar</b><s>So “before the trip” and “after the dentist” mean something.</s></div></div><div class="ccb">${done?'<span class="pill-on">Connected</span>':`<span class="btn sm${cmp?'':' pri'}">${cmp?'Connect':'Connect Google Calendar'}</span>`}</div></div>`;
const notCard=(cmp)=>`<div class="cc"><div class="cch"><span class="mk nt">${gi('bell')}</span><div class="tx"><b>Hear about what is due</b><s>We will reach you at the right time with the right reminders and information</s></div></div><div class="ccb"><span class="btn sm">${cmp?'Allow':'Allow notifications'}</span></div></div>`;
/* A: one optional screen for everything that connects. */
function connect(plat,done){
 const body=`<div class="pg"><h1>Bring things in</h1><p class="lead">All optional. Each one is in Settings if you would rather wait.</p><div class="ccs">${mailCard()}${calCard(0,done)}${notCard()}</div></div>${foot('Done','Skip for now')}`;
 return plat==='web'?webWrap(`<div class="wcol wide">${body}</div>`):phoneWrap(plat,`<div class="scr">${body}</div>`);
}
/* B: everything after the intro on one scrolling screen. */
function setup(plat){
 const body=`<div class="pg"><h1>Two things, then you are in</h1>
 <div class="blk"><div class="bh"><span class="num">1</span><h3>What should we call you?</h3></div>${nameField('Jo Martins')}<p class="hint">This is the name people you share a thread with will see.</p></div>
 <div class="blk"><div class="bh"><span class="num">2</span><h3>What you are agreeing to</h3></div>${consentBlock(true)}</div>
 <div class="blk opt"><div class="bh"><span class="num o">${gi('plus')}</span><h3>Bring things in</h3><em class="optl">Optional</em></div><div class="rowsC">
  <div class="rC"><span class="mk ml s">${gi('mail')}</span><div class="tx"><b>Forward emails</b><s>over@to.offload.club</s></div><span class="btn sm">Copy</span></div>
  <div class="rC"><span class="mk gc s"><span class="gcs"></span></span><div class="tx"><b>Google Calendar</b><s>Before the trip, after the dentist</s></div><span class="btn sm">Connect</span></div>
  <div class="rC"><span class="mk nt s">${gi('bell')}</span><div class="tx"><b>Notifications</b><s>Mornings and evenings</s></div><span class="btn sm">Allow</span></div></div></div></div>${foot('Get started','')}`;
 return plat==='web'?webWrap(`<div class="wcol">${body}</div>`,'tall'):phoneWrap(plat,`<div class="scr">${body}</div>`,'tall');
}
/* C: the first dump, done for real, then connections offered on Today. */
function firstDump(plat,state){
 const sent=state==='sent';
 const body=`<div class="pg"><h1>Dump your first thing</h1><p class="lead">Anything on your mind. offload files it, and it is waiting on Today.</p>
 <div class="fd">${sent?`<div class="bub r me">Book the Alfama flat for the 14th</div><div class="fdres">${gi('check')}<span>Filed in a new thread, <b>Lisbon trip</b>, with the 14th as its date.</span></div>`:`<div class="sugl">Or start from one of these</div>${EXAMPLES.map(e=>`<span class="sug">${e}</span>`).join('')}`}</div></div>
 <div class="cmpwrap"><div class="cmp"><span>${sent?'Dump anything':'Dump anything'}</span><span class="ci">${gi('camera')}</span><span class="ci">${gi('mic')}</span></div></div>${foot(sent?'Go to Today':'Skip',sent?'':'',{})}`;
 return plat==='web'?webWrap(`<div class="wcol">${body}</div>`):phoneWrap(plat,`<div class="scr">${body}</div>`);
}
function todayOffers(plat){
 const body=`<div class="tab"><img src="../logos/svg/offload-lockup-black.svg" alt="offload"><span>${gi('bell')}</span></div><div class="pg td"><div class="tdh">Today</div>
 <div class="thr flat"><span class="tw">${gi('lasso')}</span><b>Lisbon trip</b><em>1</em></div>
 <div class="tdl">Ways in, when you want them</div>
 <div class="ccs">${mailCard(1).replace('<div class="cc">','<div class="cc dsm"><span class="xx">'+gi('x')+'</span>')}${calCard(1).replace('<div class="cc">','<div class="cc dsm"><span class="xx">'+gi('x')+'</span>')}</div></div>
 <div class="cmpwrap"><div class="cmp"><span>Dump anything</span><span class="ci">${gi('camera')}</span><span class="ci">${gi('mic')}</span></div></div>`;
 return plat==='web'?webWrap(`<div class="wcol">${body}</div>`):phoneWrap(plat,`<div class="scr">${body}</div>`);
}
/* Footer patterns, isolated. */
function footDemo(plat,stack){return `<div class="fdemo ${plat==='web'?'w':''}">${foot('Next','Skip intro',{stack})}</div>`}
Object.assign(window,{story,you,connect,setup,firstDump,todayOffers,footDemo,SCENES});
