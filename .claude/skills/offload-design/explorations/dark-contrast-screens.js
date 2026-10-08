/* Dark contrast exploration: twelve screens of offload as on main, drawn for iOS, Android and web. */
(function(){
const g=n=>`<i class="g" style="--ic:url(../assets/icons/${n}.svg)"></i>`;
const T={eu:['Europe, October','plane',1],flat:['Flat','house',5],work:['Work','briefcase',9],health:['Health','heart-pulse',2],shelf:['Bookshelf build','hammer',3],sam:["Sam's birthday",'cake',7]};
const ti=(k,sz)=>`<span class="ti" style="--hue:var(--label-${T[k][2]});--k:${sz||36}px">${g(T[k][1])}</span>`;
const thc=k=>`<span class="thc">${ti(k,18)}${T[k][0]}</span>`;
const LB={lis:['Lisbon',1],par:['Paris',2],bk:['Booked',10],ideas:['Ideas',4]};
const lb=k=>`<span class="lb" style="--l:var(--label-${LB[k][1]})">${LB[k][0]}</span>`;
const dc=(t,tone,ic)=>`<span class="dc ${tone||''}">${g(ic||'calendar')}${t}</span>`;
const av=(i,m,sm)=>`<span class="av ${m?'m':''} ${sm?'sm':''}">${i}</span>`;
const sec=(t,n,body,x)=>`<div><div class="sh4">${t}${n!=null?`<em>${n}</em>`:''}${x||''}</div>${body}</div>`;
const card=(rows,raised)=>`<div class="card ${raised?'raised':''}">${rows.join('')}</div>`;
const todo=(t,marks,done)=>`<div class="r"><span class="cb ${done?'on':''}">${done?g('check'):''}</span><div class="bd"><b class="${done?'done':''}">${t}</b>${marks?`<div class="marks">${marks}</div>`:''}</div></div>`;
const item=(ic,t,marks,tr)=>`<div class="r"><span class="tile">${g(ic)}</span><div class="bd"><b>${t}</b>${marks?`<div class="marks">${marks}</div>`:''}</div>${tr?`<span class="tr">${tr}</span>`:''}</div>`;
const sw=on=>`<span class="sw ${on?'':'off'}"></span>`;
const srow=(ic,n,em,v,cls)=>`<div class="srow ${cls||''}">${ic?`<span class="well">${g(ic)}</span>`:''}<span class="n">${n}${em?`<em>${em}</em>`:''}</span>${v||''}</div>`;
const chev=t=>`<span class="v">${t||''}${g('chevron-right')}</span>`;
const splash=`<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 11.5V15.5a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3V11.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="8.6" cy="9.4" r="1.05" fill="currentColor"/><circle cx="15.6" cy="9.8" r=".9" fill="currentColor"/><circle cx="12" cy="8.2" r=".75" fill="currentColor"/><circle cx="12" cy="3.6" r="2.6" fill="currentColor"/></svg>`;
const K={people:['People','users','var(--label-2)'],things:['Things','tag','var(--label-1)'],about:['About','heart','var(--label-6)'],rules:['Rules','compass','var(--ink-950)'],patterns:['Patterns','orbit','var(--label-4)']};
const kt=k=>`<span class="kt" data-k style="--k:${K[k][2]}">${g(K[k][1])}${K[k][0]}</span>`;

/* ---------- bodies ---------- */
const B={};
B.today=()=>`<div class="date">Tuesday 30 September</div>
<div class="nd broken">${g('cloud-off')}<div><b>Google Calendar stopped syncing.</b> Events after Sunday are missing from your day.<div class="ac"><span>Reconnect</span><span>Not now</span></div></div></div>
<div class="nd people">${g('users')}<div><b>Ana Duarte wants to connect.</b> She shares Europe, October with you.<div class="ac"><span>Accept</span><span>Not now</span></div></div></div>
<div class="voice">Call with Ana <u>in 1h 30m</u>, then the Rua da Rosa viewing at 14:00.</div>
${sec('Where you will be',4,`<div class="evs"><div class="evc past"><i>9:00 to 9:30</i><b>Standup</b></div><div class="evc nx"><i>12:00 to 12:30</i><b>Call with Ana</b></div><div class="evc"><i>14:00 to 15:00</i><b>Viewing, Rua da Rosa</b></div></div>`)}
${sec('To do',6,card([todo('Renew the bike insurance',dc('5 days ago','late')+thc('flat')),todo('Split the flight cost, €214 each',dc('Today','soon')+thc('eu')+lb('lis')),todo('Send the slides to Priya',dc('16:00','',  'clock')+thc('work')),todo('Book the Sintra train',thc('eu')+lb('lis')),todo('Pay the council tax',thc('flat'),true)]))}`;
B.threads=()=>`<div class="srch">${g('search')}Search threads</div>
${sec('Now',null,card([
`<div class="r">${ti('eu')}<div class="bd"><b>Europe, October</b><span>Ana added 3 things · Lisbon, Paris</span></div><span class="tr">10:12<span class="dot" style="margin:0"></span></span></div>`,
`<div class="r">${ti('flat')}<div class="bd"><b>Flat</b><span>Viewing at 14:00 · 2 to-dos late</span></div><span class="tr">9:40</span></div>`,
`<div class="r">${ti('sam')}<div class="bd"><b>Sam's birthday</b><span>Shared with Tom</span></div><span class="tr">Mon<span class="dot" style="margin:0"></span></span></div>`]))}
${sec('Earlier',null,card([
`<div class="r">${ti('work')}<div class="bd"><b>Work</b><span>Slides for Priya</span></div><span class="tr">Sat</span></div>`,
`<div class="r">${ti('shelf')}<div class="bd"><b>Bookshelf build</b><span>Timber order, 17:00 Friday</span></div><span class="tr">Thu</span></div>`,
`<div class="r">${ti('health')}<div class="bd"><b>Health</b><span>Physio, 6 October</span></div><span class="tr">12 Sep</span></div>`]))}
${sec('Not in a thread',4,`<div class="chips" style="margin-bottom:8px"><span class="chip sel ink">All <em>4</em></span><span class="chip">To-dos <em>2</em></span><span class="chip">Notes <em>1</em></span><span class="chip">Links <em>1</em></span></div>`+card([item('square-check-big','Buy a doormat',`<span class="chip ol" style="height:24px;font-size:12px;padding:0 9px">${ti('flat',14)}Move to Flat</span>`),item('link','A guide to Alfama on foot',`<span class="chip ol" style="height:24px;font-size:12px;padding:0 9px">${ti('eu',14)}Move to Europe, October</span>`)]))}`;
const fbar=`<div class="chips"><span class="chip sel ink">All</span><span class="chip"><i class="ld" style="--l:var(--label-1)"></i>Lisbon <em>8</em></span><span class="chip sel" style="--l:var(--label-2)">Paris <em>5</em></span><span class="chip"><i class="ld" style="--l:var(--label-10)"></i>Booked <em>4</em></span><span class="chip">${g('plus')}</span></div>`;
B.thread=()=>`${fbar}<div class="seg"><span class="on">${g('list')}List</span><span>${g('map')}Map</span></div>
${sec('To do',4,card([todo('Book the Sintra train',dc('Sat','soon','calendar')+lb('lis')),todo('Musée d\'Orsay tickets',dc('2 Oct','late')+lb('par')),todo('Split the flight cost, €214 each',dc('Today','soon')),todo('Flights booked, TP 1353',lb('bk'),true)]))}
${sec('Notes and links',3,card([item('text-quote','Ana: the pastéis place is in Belém, not Alfama',lb('lis'),av('AD','',true)),item('link','Le Comptoir du Relais, book 2 weeks ahead',lb('par')+lb('ideas')),item('image','3 photos from the Sintra guide','', '4:12')]))}`;
B.map=()=>`${fbar}<div class="seg"><span>${g('list')}List</span><span class="on">${g('map')}Map</span></div>
<div class="map" style="height:330px"><i class="water" style="left:0;right:0;bottom:0;height:80px"></i><i class="park" style="left:40px;top:40px;width:120px;height:90px"></i><i class="road" style="left:0;right:0;top:150px;height:10px"></i><i class="road" style="left:200px;top:0;bottom:0;width:9px"></i><i class="road" style="left:0;right:0;top:60px;height:6px;transform:rotate(-12deg)"></i>
<i class="pin a" style="left:110px;top:170px"></i><i class="pin" style="left:230px;top:96px"></i><i class="pin m" style="left:280px;top:200px"></i><i class="pin" style="left:60px;top:230px"></i>
<div class="callout" style="left:130px;top:118px">Pastéis de Belém<em>Saved by Ana</em></div>
<div class="zm" style="top:12px"><span>+</span><span>−</span></div></div>
${card([item('map-pin','Pastéis de Belém',lb('lis'),'1.2 km'),item('map-pin','Castelo de São Jorge',lb('lis')+lb('bk'),'3.4 km'),item('map-pin','Sintra station','', '24 km')])}`;
B.conv=()=>`<div class="ub">when do we fly to lisbon and what's still not booked?</div>
<div class="ob">You fly out on <b style="font-weight:500">Friday 10 October</b>, TP 1353 at 7:05. Two things in Europe, October aren't booked yet.</div>
<div class="ans"><div class="ah">${ti('eu',20)}<b>Europe, October</b><span style="margin-left:auto">2 of 8</span></div>${todo('Book the Sintra train',dc('Sat','soon')+lb('lis'))}${todo('Musée d\'Orsay tickets',dc('2 Oct','late')+lb('par'))}<div class="af">Show all 8</div></div>
<span class="src">${g('mail')}From your TAP email, 14 Sep</span>
<div class="qr"><span class="pri">Book the train</span><span>Remind me Friday</span><span>${g('check')}Done</span></div>
<div class="ub">book the train for saturday morning</div>
<div class="think">${splash}<span>Looking at Saturday trains</span><span class="stop"><i></i>Stop</span></div>`;
B.sheetBase=B.thread;
B.sheet=()=>`<div class="grab"></div><h3>Book the Sintra train</h3><div class="sub">In ${T.eu[0]}</div>
<div><div class="fl">When</div><div class="chips" style="flex-wrap:wrap"><span class="chip">Today</span><span class="chip">Tomorrow</span><span class="chip sel ink">${g('calendar')}Saturday 4 Oct</span><span class="chip ol">Pick a date</span></div></div>
<div><div class="fl">Repeats</div><div class="seg"><span class="on">Never</span><span>Daily</span><span>Weekly</span><span>Custom</span></div></div>
<div><div class="fl">Labels</div><div class="chips" style="flex-wrap:wrap"><span class="chip sel" style="--l:var(--label-1)">${g('check')}Lisbon</span><span class="chip"><i class="ld" style="--l:var(--label-2)"></i>Paris</span><span class="chip"><i class="ld" style="--l:var(--label-10)"></i>Booked</span><span class="chip ol">${g('plus')}New label</span></div></div>
<div class="card" style="border-radius:12px">${srow('bell','Remind me','offload sends a notification at 9:00',sw(true))}</div>
<div class="qr" style="justify-content:space-between"><span style="color:var(--text-danger);border-color:var(--border-danger)">${g('trash-2')}Delete</span><span class="pri" style="padding:0 22px">Save</span></div>`;
const mrow=(t,k,src)=>`<div class="r"><div class="bd"><b style="font-weight:400">${t}</b><div class="marks">${src}</div></div></div>`;
const mh=(k,n)=>`<div class="mh" data-k style="--k:${K[k][2]}"><span class="kd">${g(K[k][1])}</span>${K[k][0]}<em>${n}</em></div>`;
B.mem=()=>`<div class="seg"><span class="on">${g('list')}List</span><span>${g('map')}Map</span></div><div class="seg"><span class="on">By kind</span><span>Newest</span></div>
<div class="chips"><span class="chip sel ink">All <em>24</em></span>${Object.keys(K).map(k=>`<span class="chip">${K[k][0]}</span>`).join('')}</div>
<div>${mh('people',6)}${card([mrow('Ana is my sister, she lives in Porto','people',thc('eu')),mrow('Tom is allergic to peanuts','people',`<span class="thc">Said in a conversation</span>`)])}</div>
<div>${mh('things',5)}${card([mrow('My bike is a grey Brompton, frame 2112','things',thc('flat')),mrow('Passport expires March 2028','things',`<span class="thc">From a photo</span>`)])}</div>
<div>${mh('rules',4)}${card([mrow('Never book flights before 7:00','rules',`<span class="thc">Typed in Memories</span>`)])}</div>`;
B.memmap=()=>`<div class="seg"><span>${g('list')}List</span><span class="on">${g('map')}Map</span></div>
<div class="map" style="height:560px;background:var(--surface-page)">
<div class="mcl" data-k style="--k:${K.people[2]};left:10px;top:20px;width:210px;height:200px"><span class="mt2">${g('users')}People 6</span><span class="mp">Ana, sister</span><span class="mp">Tom, peanuts</span><span class="mp">Priya, manager</span><span class="mp">Sam, 4 Oct</span></div>
<div class="mcl" data-k style="--k:${K.things[2]};left:170px;top:190px;width:190px;height:180px"><span class="mt2">${g('tag')}Things 5</span><span class="mp">Brompton</span><span class="mp">Passport</span><span class="mp">Flat keys</span></div>
<div class="mcl" data-k style="--k:${K.about[2]};left:0;top:350px;width:200px;height:180px"><span class="mt2">${g('heart')}About 5</span><span class="mp">Vegetarian</span><span class="mp">Runs Sundays</span><span class="mp">Hates calls</span></div>
<div class="mcl" data-k style="--k:${K.patterns[2]};left:200px;top:400px;width:150px;height:140px"><span class="mt2">${g('orbit')}Patterns 4</span><span class="mp">Gym Tue</span><span class="mp">Pays rent 1st</span></div>
<div class="zm" style="bottom:12px"><span>+</span><span>−</span></div></div>`;
B.act=()=>`<div class="nd need">${g('message-circle')}<div><b>offload asked: Sintra train, Saturday or Sunday?</b><div style="margin-top:4px;color:var(--text-secondary);font-size:13px">${thc('eu')}</div><div class="qr" style="margin-top:10px"><span class="pri">Saturday</span><span>Sunday</span></div></div></div>
${sec('Today',null,card([
`<div class="r"><span class="dot"></span>${av('AD')}<div class="bd"><b>Ana added 3 things to Europe, October</b><span>10:12 · Pastéis de Belém, and 2 more</span></div></div>`,
`<div class="r"><span class="dot"></span><span class="tile">${g('bell')}</span><div class="bd"><b>Renew the bike insurance</b><div class="marks">${dc('5 days ago','late')}${thc('flat')}</div></div></div>`,
`<div class="r"><span class="dot" style="background:transparent"></span><span class="tile">${g('mail')}</span><div class="bd"><b>Filed an email from TAP</b><span>9:02 · into Europe, October</span></div></div>`]))}
${sec('Yesterday',null,card([
`<div class="r"><span class="dot" style="background:transparent"></span>${av('TM','m')}<div class="bd"><b>Tom accepted Sam's birthday</b><span>18:40</span></div></div>`,
`<div class="r"><span class="dot" style="background:transparent"></span><span class="tile">${g('calendar')}</span><div class="bd"><b>Moved Physio to Monday</b><span>From Google Calendar</span></div></div>`]))}`;
B.person=()=>`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0 0"><span class="av" style="width:84px;height:84px;font-size:28px">AD</span><b style="font:var(--weight-semibold) 22px/1.2 var(--font-core)">Ana Duarte</b><span style="color:var(--text-secondary);font-size:14px">@anaduarte · Porto</span></div>
<div class="card raised" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px"><div style="font:var(--weight-regular) 14.5px/1.45 var(--font-core)"><b style="font-weight:500">Ana wants to connect.</b> You would see the threads you share with each other, and she could add to them.</div><div class="qr"><span class="pri">Accept</span><span>Not now</span><span style="color:var(--text-danger);border-color:var(--border-danger)">Block</span></div></div>
${sec('Shared with you',2,card([`<div class="r">${ti('eu')}<div class="bd"><b>Europe, October</b><span>You, Ana, Tom</span></div><div class="avs">${av('AD','',1)}${av('TM','m',1)}</div></div>`,`<div class="r">${ti('sam')}<div class="bd"><b>Sam's birthday</b><span>You and Ana</span></div><div class="avs">${av('AD','',1)}</div></div>`]))}
${sec('What Ana added',null,card([item('map-pin','Pastéis de Belém',lb('lis'),'10:12'),item('text-quote','The pastéis place is in Belém, not Alfama','', 'Mon')]))}`;
B.settings=()=>`<div class="card"><div class="srow">${av('JO','m')}<span class="n"><b style="font-weight:500">Jo Ibekwe</b><em>jo@hey.com</em></span>${chev()}</div></div>
<div><div class="grp">Connected apps</div>${card([srow('calendar','Google Calendar','Stopped syncing on Sunday',`<span class="v" style="color:var(--text-danger)">Reconnect${g('chevron-right')}</span>`),srow('mail','Mail','over@to.offload.club',chev())])}</div>
<div><div class="grp">Preferences</div>${card([srow('bell','Notifications','',chev('Daily at 8:00')),srow('palette','Appearance','',chev('Dark')),srow('clock','Date and time','',chev('Lisbon')),srow('users','People','',chev('4'))])}</div>
<div><div class="grp">Your data</div>${card([srow('archive','Storage','',chev('412 MB of 2 GB')),srow('lock','Privacy','',chev()),srow('book-open','See the tutorial again','',chev())])}</div>
${card([srow('log-out','Sign out','','','danger')])}`;
B.appear=()=>`<div><div class="grp">Theme</div><div class="pv"><div><span class="tl" style="background:#FAF9F7;color:#0B0B0B"><i style="width:60%"></i><i class="c"></i><i class="c"></i></span>Light</div><div class="on"><span class="tl" style="background:var(--surface-page);color:var(--text-primary)"><i style="width:60%"></i><i class="c"></i><i class="c"></i></span>Dark</div><div><span class="tl" style="background:linear-gradient(135deg,#FAF9F7 50%,var(--surface-page) 50%);color:#7A7A7A"><i style="width:60%"></i><i class="c"></i><i class="c"></i></span>Automatic</div></div></div>
<div class="seg"><span>Light</span><span class="on">Dark</span><span>Automatic</span></div>
<div><div class="grp">Motion</div>${card([srow('','Reduce motion','Fades instead of slides and springs',sw(false)),srow('','The prism moves','The field under the composer drifts when something is filed',sw(true))])}</div>
<div><div class="grp">Start on</div>${card([srow('','Today','',`<span class="v">${g('check')}</span>`),srow('','My threads','',''),srow('','The last thing open','','')])}</div>`;

/* ---------- screens ---------- */
const S=[
{id:'today',n:'Today',tab:0,home:1,body:B.today},
{id:'threads',n:'My threads',tab:1,home:1,big:'My threads',body:B.threads},
{id:'thread',n:'A thread',push:'eu',body:B.thread,toast:'Moved to Flat.',plate:1},
{id:'map',n:'A thread, map',push:'eu',body:B.map,plate:1},
{id:'conv',n:'Conversation',tab:0,home:1,body:B.today,conv:B.conv},
{id:'sheet',n:'Row sheet',push:'eu',body:B.thread,sheet:B.sheet,plate:1},
{id:'mem',n:'Memories, list',tab:2,home:1,big:'Memories',body:B.mem},
{id:'memmap',n:'Memories, map',tab:2,home:1,big:'Memories',body:B.memmap},
{id:'act',n:'Activity',pushT:'Activity',body:B.act},
{id:'person',n:'A person',pushT:'',body:B.person},
{id:'settings',n:'Settings',pushT:'Settings',body:B.settings},
{id:'appear',n:'Appearance',pushT:'Appearance',body:B.appear}];

const st=and=>and?`<div class="st"><span>10:30</span><i>▾ ▴ ▮</i></div>`:`<div class="st"><span>10:30</span><i>●●● ▮</i></div>`;
const tabs=(on,and)=>`<div class="tabs">${[['sun','Today'],['message-circle','Threads'],['cloudy','Memories']].map(([ic,l],i)=>`<span class="${i===on?'on':''}">${and?`<i class="ind">${g(ic)}</i>`:g(ic)}${l}</span>`).join('')}</div>`;
const plate=(on,and)=>`<div class="plate"><div class="prism"><i></i></div><div class="cw"><div class="pill"><s>Dump anything</s><span class="ib">${g('camera')}</span><span class="ib">${g('mic')}</span></div></div>${on!=null?tabs(on,and):''}</div>`;
function appbar(s){
 if(s.home)return `<div class="ab"><span class="mark"><i class="lm"></i>offload</span><span class="sp"></span><span class="abi">${g('search')}</span><span class="abi">${g('bell')}<b></b></span><span class="abi">${g('settings')}</span></div>`;
 if(s.push)return `<div class="ab"><span class="back">${g('chevron-left')}</span><span class="ttl">${ti(s.push,30)}${T[s.push][0]}</span><span class="sp"></span><div class="avs">${av('AD','',1)}${av('TM','m',1)}</div><span class="abi">${g('calendar')}</span><span class="abi">${g('ellipsis')}</span></div>`;
 return `<div class="ab"><span class="back">${g('chevron-left')}</span><span class="sp"></span>${s.id==='person'?`<span class="abi">${g('ellipsis')}</span>`:''}</div>`;
}
function phone(s,and,theme,opt){
 const big=s.big||s.pushT;
 return `<div class="ap ph ${and?'and':''}" data-theme="${theme}" data-opt="${opt}">${st(and)}${appbar(s)}${big?`<div class="lt">${big}</div>`:''}<div class="sc">${s.body()}</div>${s.home?plate(s.tab,and):s.plate?plate(null,and):''}
${s.toast?`<div class="toast"><b>${s.toast}</b><u>Undo</u></div>`:''}
${s.conv?`<div class="scrim" style="z-index:9"></div><div class="cv"><div class="sheet-grab" style="width:36px;height:4px;border-radius:99px;background:var(--border-strong);margin:8px auto 0"></div><div class="hd"><b>Flights for Lisbon</b>${g('maximize-2')}${g('x')}</div><div class="turns">${s.conv()}</div><div class="cw" style="padding-bottom:40px"><div class="pill"><s>Reply</s><span class="ib">${g('mic')}</span></div></div></div>`:''}
${s.sheet?`<div class="scrim"></div><div class="sheet">${s.sheet()}</div>`:''}</div>`;
}
function web(s,theme,opt){
 const nav=[['sun','Today',0],['message-circle','My threads',1],['cloudy','Memories',2]];
 const on=s.tab!=null?s.tab:s.push?-1:-2;
 const side=`<nav class="wsb" data-theme="dark" data-opt="${opt}"><span class="mark"><i class="lm"></i>offload</span>${nav.map(([ic,l,i])=>`<span class="it ${i===on?'on':''}">${g(ic)}${l}</span>`).join('')}
<span class="gl">Recent</span>${['eu','flat','sam','shelf'].map(k=>`<span class="it ${s.push===k?'on':''}">${ti(k,22)}${T[k][0]}</span>`).join('')}
<span class="sp"></span><span class="it ${s.id==='act'?'on':''}">${g('bell')}Activity<b></b></span><span class="it ${s.id==='settings'||s.id==='appear'?'on':''}">${g('settings')}Settings</span></nav>`;
 const title=s.push?T[s.push][0]:s.big||s.pushT||(s.id==='person'?'Ana Duarte':'Today');
 const crumb=s.id==='appear'?'<b>Settings</b>'+g('chevron-right')+'<b>Appearance</b>':s.id==='person'?'<b>People</b>'+g('chevron-right')+'<b>Ana Duarte</b>':`<b>${title}</b>`;
 const head=s.id==='person'?'':`<div class="wph">${s.push?ti(s.push,40):''}<h1>${title}</h1><span class="sp"></span>${s.push?`<div class="avs">${av('AD','',1)}${av('TM','m',1)}</div><span class="tb">${g('calendar')}</span><span class="tb">${g('share-2')}</span><span class="tb">${g('ellipsis')}</span>`:`<span class="tb">${g('search')}</span><span class="tb">${g('sliders-horizontal')}</span>`}</div>`;
 const two=s.id==='thread'?`<div class="wpane two"><div class="meas" style="gap:16px"><div style="display:flex;align-items:center;gap:10px"><span class="cb"></span><b style="font:var(--weight-semibold) 20px/1.25 var(--font-core)">Book the Sintra train</b></div><div class="marks">${dc('Sat 4 Oct','soon')}${lb('lis')}</div><div class="voice" style="font-size:16px;color:var(--text-secondary)">Ana says the 9:11 from Rossio is the quiet one. Return before 18:00.</div><div class="card">${srow('calendar','When','',chev('Saturday 4 October'))}${srow('bell','Remind me','',sw(true))}${srow('tag','Labels','',chev('Lisbon'))}</div><div class="qr"><span>${g('pencil')}Edit</span><span>${g('folder')}Move</span><span style="color:var(--text-danger);border-color:var(--border-danger)">${g('trash-2')}Delete</span></div></div></div>`:
  s.id==='mem'?`<div class="wpane two"><div class="meas" style="gap:14px"><b style="font:var(--weight-semibold) 18px/1.2 var(--font-core)">Edit memory</b><div class="fld focus">Ana is my sister, she lives in Porto</div><div class="fl">Kind</div><div class="chips" style="flex-wrap:wrap">${Object.keys(K).map(k=>k==='people'?kt(k):`<span class="chip">${K[k][0]}</span>`).join('')}</div><div class="snote" style="font-size:13px;margin:0">Learned from a conversation, 12 September. Used 4 times.</div><div class="qr" style="justify-content:space-between"><span style="color:var(--text-danger);border-color:var(--border-danger)">Forget</span><span class="pri">Save</span></div></div></div>`:'';
 const wide=s.id==='memmap'||s.id==='map';
 return `<div class="ap wb" data-theme="${theme}" data-opt="${opt}">${side}<div class="wmain"><div class="wcr">${crumb}<span class="sp"></span>Tuesday 30 September</div><div class="wpanes"><div class="wpane"><div class="meas ${wide?'full':''}">${head}${s.body().replace('style="height:560px','style="height:520px').replace('style="height:330px','style="height:400px')}</div></div>${two}</div>${s.home||s.plate?`<div class="wcompw"><div class="wcomp"><s>Dump anything</s>${g('paperclip')}${g('mic')}</div></div>`:''}</div>
${s.toast?`<div class="toast"><b>${s.toast}</b><u>Undo</u></div>`:''}
${s.conv?`<div class="cv"><div class="hd" style="padding-top:18px"><b>Flights for Lisbon</b>${g('x')}</div><div class="turns">${s.conv()}</div><div class="cw" style="padding-bottom:18px"><div class="pill"><s>Reply</s><span class="ib">${g('mic')}</span></div></div></div>`:''}
${s.sheet?`<div class="scrim"></div><div class="sheet">${s.sheet()}</div>`:''}</div>`;
}
window.DC_SCREENS=S;
window.dcFrame=(s,plat,theme,opt)=>{
 const cls=plat==='web'?'web':plat==='android'?'and':'ios';
 const inner=plat==='web'?web(s,theme,opt):phone(s,plat==='android',theme,opt);
 return `<div class="fr ${cls}" data-theme="${theme}" data-opt="${opt}"><div class="in">${inner}</div></div>`;
};
})();
