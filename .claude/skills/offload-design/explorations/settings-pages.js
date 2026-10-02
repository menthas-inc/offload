/* Settings exploration: data and renderers. Copy is the app's as built (apps/mobile/app/settings,
   apps/web/src/components/panes) unless a row is tagged proposed. */
const SVG=b=>'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+b+'</svg>');
const EXTRA={
 smartphone:SVG('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>'),
 monitor:SVG('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
 'user-plus':SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
 globe:SVG('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>'),
 copy:SVG('<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
 'log-out':SVG('<path d="m16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'),
 ban:SVG('<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>'),
 'type':SVG('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>')
};
const icu=n=>EXTRA[n]?`url('${EXTRA[n]}')`:`url(../assets/icons/${n}.svg)`;
const g=(n,c='')=>`<span class="g ${c}" style="--ic:${icu(n)}"></span>`;
const AV={JM:'var(--label-1)',AD:'var(--label-2)',TR:'var(--label-6)',SO:'var(--label-4)',PR:'var(--label-5)'};
const av=(i,s=36)=>`<span class="av" style="width:${s}px;height:${s}px;background:${AV[i]||'var(--ink-400)'};font-size:${Math.round(s*.36)}px">${i}</span>`;
const prop='<em class="prop">proposed</em>';

/* ---------- custom blocks ---------- */
const reqCard=`<div class="req">${av('PR',40)}<div class="tx"><b>Priya Raman wants to connect</b><s>priya@raman.studio</s></div><div class="reqb"><span class="pb pri">Accept</span><span class="pb">Not now</span></div></div>`;
const addSomeone=()=>`<div class="add"><div class="fld">${g('search')}<span>Their email address</span></div><span class="pb pri">Find</span></div><p class="cap">They need to be on offload already. You can also share a thread and ask from there.</p>`;
const appCards=()=>`<div class="apps">
<div class="app"><div class="apph"><span class="mk gc">${g('calendar')}</span><div class="tx"><b>Google Calendar</b><s>jo@hey.com, connected 14 Sep</s></div><span class="st on">Connected</span></div>
<div class="appr"><div class="rw go"><div class="tx"><b>Calendars offload can use</b></div><span class="v">4 of 7</span><span class="chev">${g('chevron-right')}</span></div>
<div class="rw"><div class="tx"><b>Ask before adding</b><s>Off means offload adds it without asking, unless somebody else would see it.</s></div>${sw(true)}</div></div></div>
<div class="app"><div class="apph"><span class="mk ml">${g('mail')}</span><div class="tx"><b>Mail</b><s>Forward an email and it's filed like anything you dump</s></div><span class="st">Ready</span></div>
<div class="appr"><div class="rw"><div class="tx"><b class="mono">over@to.offload.club</b><s>Only mail from jo@hey.com is accepted. Forward by hand.</s></div><span class="pb">${g('copy')}Copy</span></div>
<div class="rw go"><div class="tx"><b>Add to contacts</b></div><span class="chev">${g('arrow-up-right')}</span></div></div></div>
</div>`;
const appsEmpty=`<div class="apps"><div class="app"><div class="apph"><span class="mk gc">${g('calendar')}</span><div class="tx"><b>Google Calendar</b><s>See your week in offload, and let it add things for you.</s></div><span class="pb pri">Connect</span></div></div></div>`;

let CHOICE='tiles';
const thumbs={
 Light:'<i class="th lt"><u></u><u></u><u class="s"></u></i>',
 Dark:'<i class="th dk"><u></u><u></u><u class="s"></u></i>',
 System:'<i class="th sy"><b class="lt"><u></u><u></u></b><b class="dk"><u></u><u></u></b></i>',
 Monday:'<i class="th wk">'+['M','T','W','T','F','S','S'].map((d,i)=>`<u class="${i===0?'f':''}${i>4?' we':''}">${d}</u>`).join('')+'</i>',
 Sunday:'<i class="th wk">'+['S','M','T','W','T','F','S'].map((d,i)=>`<u class="${i===0?'f':''}${i===0||i===6?' we':''}">${d}</u>`).join('')+'</i>',
 Default:'<i class="th tz"><span style="font-size:20px">Aa</span></i>',
 Larger:'<i class="th tz"><span style="font-size:28px">Aa</span></i>'
};
const SUB={Light:'Always light',Dark:'Always dark',System:'Follows this device',Monday:'Weeks run Monday to Sunday',Sunday:'Weeks run Sunday to Saturday',Default:'The size it ships at',Larger:'Text bigger, layout unchanged'};
function choice(opts,on,mode){mode=mode||CHOICE;
 if(mode==='tiles')return `<div class="tiles n${opts.length}">`+opts.map(o=>`<div class="tile${o===on?' on':''}">${thumbs[o]}<span class="tl"><i class="rd"></i>${o}</span></div>`).join('')+'</div>';
 if(mode==='cards')return '<div class="rcards">'+opts.map(o=>`<div class="rcard${o===on?' on':''}"><i class="rd"></i><div class="tx"><b>${o}</b><s>${SUB[o]}</s></div></div>`).join('')+'</div>';
 return '<div class="segc">'+opts.map(o=>`<span class="${o===on?'on':''}">${o}</span>`).join('')+'</div>';
}
const sw=on=>`<span class="sw${on?' on':''}"><i></i></span>`;

/* ---------- pages ---------- */
const PAGES={
index:{t:'Settings',ic:'settings',sum:'jo@hey.com',secs:[
 {html:()=>`<div class="who">${av('JM',52)}<div class="tx"><b>Jo Martins</b><s>jo@hey.com</s></div><span class="pb ol">Sign out</span></div>`+reqCard},
 {t:'You',ic:'circle-dot',rows:[{t:'My account',ic:'circle-dot',v:'jo@hey.com',go:1},{t:'My people',ic:'users',v:'3',dot:1,go:1}]},
 {t:'Reaching you',ic:'bell',rows:[{t:'Notifications',ic:'bell',v:'8:00, 19:00',go:1},{t:'Connected apps',ic:'link',v:'Calendar, Mail',go:1}]},
 {t:'What offload does with it',ic:'lock',rows:[{t:'Privacy',ic:'lock',go:1}]},
 {t:'The app',ic:'sliders-horizontal',rows:[{t:'Date and time',ic:'clock',v:'Lisbon',go:1},{t:'Appearance',ic:'blend',v:'System',go:1},{t:'Help and about',ic:'compass',v:'2.1.0',go:1}]}
]},
account:{t:'My account',ic:'circle-dot',sum:'Jo Martins, signed in on 3 devices',secs:[
 {t:'Profile',ic:'circle-dot',cap:'How you appear to people you share with.',rows:[{t:'Name',v:'Jo Martins',edit:1},{t:'Email',v:'jo@hey.com',n:'From your Google sign in. Changing it is not done here.'}]},
 {t:'Where you are',ic:'map-pin',cap:'So a date or a forecast is the one where you are. Leave it unset and offload says it does not know rather than guessing.',rows:[{t:'Country',v:'Portugal',go:1,country:1}]},
 {t:'Signed in on',ic:'smartphone',cap:'Ending a session signs that device out on its next request.',rows:[
  {t:'iPhone 15',dev:'smartphone',n:'This device',cur:1},{t:'Chrome on Mac',dev:'monitor',n:'Since 14 Sep',btn:'End'},{t:'iPad',dev:'smartphone',n:'Since 2 Aug',btn:'End'},{t:'End all other sessions',act:1}]},
 {rows:[{t:'Sign out',ic:'log-out',act:1}]}
]},
people:{t:'My people',ic:'users',sum:'3 connected, 1 waiting on you',secs:[
 {t:'Waiting on you',ic:'bell',count:'1',html:()=>reqCard},
 {t:'Connect with someone',ic:'user-plus',html:addSomeone},
 {t:'Connected',ic:'users',count:'3',cap:'Who you can share a thread with.',rows:[{t:'Ana Duarte',av:'AD',n:'Lisbon trip, Berlin in October',go:1},{t:'Tom Reilly',av:'TR',n:'Lisbon trip',go:1},{t:'Sam Ibekwe',av:'SO',n:'Nothing shared yet',go:1}]},
 {t:'Asked by you',ic:'clock',count:'1',rows:[{t:'Lena Hart',av:'LH',n:'Pending since 28 Sep',btn:'Withdraw'}]},
 {t:'Blocked',ic:'ban',rows:[{t:'Blocked',v:'None',go:1}]}
]},
notifications:{t:'Notifications',ic:'bell',sum:'Mornings at 8:00, evenings at 19:00',secs:[
 {t:'Dates',ic:'calendar',cap:'What is due, said once a day rather than one by one.',rows:[
  {t:'Due today',n:'One message each morning.',sw:1},{t:'In the morning at',time:'8:00',sub:1},
  {t:'Tomorrow',n:'One message each evening.',sw:1},{t:'In the evening at',time:'19:00',sub:1}]},
 {t:'People',ic:'users',cap:'When someone reaches for you.',rows:[{t:'Connection requests',sw:1},{t:'Added to a shared thread',sw:1}]},
 {t:'On this phone',web:'On your phones',ic:'smartphone',rows:[{t:'Allowed',stat:'on',n:'Sounds, the lock screen, and turning offload off entirely are in System settings.'},{t:'System settings',go:1,ext:1}],
  webRows:[{t:'These go to your phones',n:'offload for web does not send notifications. Each phone has its own switch in its system settings.'}]}
]},
apps:{t:'Connected apps',ic:'link',sum:'Calendar and Mail',secs:[
 {t:'Connected',ic:'link',html:appCards}
]},
privacy:{t:'Privacy',ic:'lock',sum:'What leaves offload, and what it keeps',secs:[
 {t:'Reaching the web',ic:'globe',cap:'Both are on. Each says what leaves, then the limit on it.',rows:[
  {t:'Search the web',n:"Sends the words you dumped to a search company when offload can't answer from your threads. Your threads and notes are never sent.",sw:1},
  {t:'Read links I paste',n:'Opens a link you dumped and reads the page. Nothing of yours is sent.',sw:1}]},
 {t:'What offload keeps',ic:'archive',rows:[{t:'Conversations',v:'60 days',n:'Anything you asked it to remember becomes a memory and stays until you delete it.',p:1}]},
 {t:'The fine print',ic:'text-quote',rows:[{t:'Privacy policy',go:1,ext:1}]}
]},
datetime:{t:'Date and time',ic:'clock',sum:'Lisbon, weeks start Monday',secs:[
 {t:'Your clock',ic:'clock',cap:'Everything is shown and scheduled in this zone.',rows:[{t:'Time zone',v:'Lisbon',go:1,country:1},{t:'Follow this device',n:'Offer to switch when the phone is somewhere else.',webN:'Offer to switch when this browser is somewhere else.',sw:1}]},
 {t:'Week starts on',ic:'calendar',cap:"Which day a thread's timeline begins its weeks on.",html:()=>choice(['Monday','Sunday'],'Monday')}
]},
appearance:{t:'Appearance',ic:'blend',sum:'On this device',secs:[
 {t:'Theme',ic:'blend',cap:'System follows whatever this device is set to.',html:()=>choice(['Light','Dark','System'],'System')},
 {t:'Text size',ic:'type',webOnly:1,cap:'Larger sets the text bigger and leaves everything else where it is.',html:()=>choice(['Default','Larger'],'Default')},
 {t:'Today',ic:'sun',rows:[{t:'Switch to Tonight after sunset',n:'Sunset in Lisbon today is 19:21.',sw:1,p:1}]}
]},
help:{t:'Help and about',ic:'compass',sum:'offload 2.1.0',secs:[
 {t:'Learn',ic:'compass',rows:[{t:'See the tutorial again',n:'The three screens from your first day.',go:1,p:1}]},
 {t:'About',ic:'text-quote',rows:[{t:'Version',v:'2.1.0 (418)',noweb:1},{t:'Privacy policy',go:1,ext:1}]}
]}
};

/* ---------- renderers ---------- */
function row(r,plat){
 const lead=r.ic?`<span class="ld">${g(r.ic)}${r.dot?'<i class="dot"></i>':''}</span>`:r.av?av(r.av,plat==='android'?40:36):r.dev?`<span class="ld dv">${g(r.dev)}</span>`:'';
 let tail='';
 if(r.v)tail+=r.country&&plat==='web'?`<span class="sel">${r.v}${g('chevron-down')}</span>`:r.edit&&plat==='web'?`<span class="v">${r.v}</span><span class="lk">Change</span>`:`<span class="v">${r.v}</span>`;
 if(r.time)tail+=`<span class="tp">${r.time}</span>`;
 if(r.cur)tail+='<span class="st on">This device</span>';
 if(r.stat)tail+='<span class="st on">On</span>';
 if(r.btn)tail+=`<span class="pb">${r.btn}</span>`;
 if(r.sw)tail+=sw(true);
 if((r.go||r.edit)&&!(r.country&&plat==='web')&&!(r.edit&&plat==='web'))tail+=`<span class="chev">${g(r.ext?'arrow-up-right':'chevron-right')}</span>`;
 const n=plat==='web'&&r.webN?r.webN:r.n;
 return `<div class="rw${r.sub?' sub':''}${r.act?' act':''}${lead?' hl':''}"${r.cur?' data-cur':''}>${lead}<div class="tx"><b>${r.t}${r.p?prop:''}</b>${n&&!r.cur?`<s>${n}</s>`:''}</div>${tail}</div>`;
}
function section(s,dir,plat){
 if(s.webOnly&&plat!=='web')return '';
 const rows=(plat==='web'&&s.webRows?s.webRows:s.rows||[]).filter(r=>!(r.noweb&&plat==='web'));
 const t=plat==='web'&&s.web?s.web:s.t;
 const inner=(s.html?s.html():'')+(rows.length?`<div class="rows">${rows.map(r=>row(r,plat)).join('')}</div>`:'');
 if(!t)return `<div class="sec bare">${s.html?s.html():''}${rows.length?`<div class="card">${rows.map(r=>row(r,plat)).join('')}</div>`:''}</div>`;
 const cnt=s.count?`<em class="cnt">${s.count}</em>`:'';
 const cap=s.cap?`<p>${s.cap}</p>`:'';
 const raw=s.html&&!rows.length;
 if(dir==='A')return `<div class="sec sA"><div class="sh"><h4>${t}${cnt}</h4>${cap}</div><div class="${raw?'raw':'card'}">${inner}</div></div>`;
 if(dir==='B')return `<div class="sec sB"><div class="sh"><span class="stile">${g(s.ic)}</span><div><h4>${t}${cnt}</h4>${cap}</div></div><div class="${raw?'raw':'card'}">${inner}</div></div>`;
 return `<div class="sec sC"><div class="cardC"><div class="sh"><span class="stile">${g(s.ic)}</span><div><h4>${t}${cnt}</h4>${cap}</div></div><div class="cin${raw?' raw':''}">${inner}</div></div></div>`;
}
function pageBody(id,dir,plat){
 const P=PAGES[id];
 const hero=dir==='C'&&id!=='index'?`<div class="hero"><span class="htile">${g(P.ic)}</span><div><h3>${P.t}</h3><p>${P.sum}</p></div></div>`:'';
 return hero+P.secs.map(s=>section(s,dir,plat)).join('');
}
const st=plat=>plat==='android'?'<div class="stb"><span>9:41</span><span>▾ ▴ ▮</span></div>':'<div class="stb"><span>9:41</span><span>●●● ▮</span></div>';
function phone(id,dir,plat){
 const P=PAGES[id];
 const title=dir==='C'&&id!=='index'?'':P.t;
 return `<div class="ph" data-dir="${dir}">${st(plat)}<div class="ab"><span class="bk">${g('chevron-left')}</span><b>${title}</b><span class="bk" style="visibility:hidden">${g('chevron-left')}</span></div><div class="body">${pageBody(id,dir,plat)}</div>${plat==='ios'?'<div class="hb"><i></i></div>':'<div class="gb"><i></i></div>'}</div>`;
}
const SB=`<div class="wsb"><b>offload</b><span>${g('sun')}Today</span><span>${g('lasso')}My threads</span><span>${g('brain')}Memories</span><span style="margin-top:auto">${g('bell')}Activity</span><span class="on">${g('settings')}Settings</span></div>`;
function web(id,dir){
 const P=PAGES[id];
 const idx=PAGES.index.secs.slice(1).map(s=>`<div class="wg"><div class="wgl">${s.t}</div>${s.rows.map(r=>{const on=(r.t==='Privacy'?'privacy':r.t==='My account'?'account':r.t==='My people'?'people':r.t==='Connected apps'?'apps':r.t==='Date and time'?'datetime':r.t==='Help and about'?'help':r.t.toLowerCase())===id;return `<div class="wr${on?' on':''}"><span class="ld">${g(r.ic)}${r.dot?'<i class="dot"></i>':''}</span><b>${r.t}</b>${r.v?`<span class="v">${r.v}</span>`:''}</div>`}).join('')}</div>`).join('');
 const head=dir==='C'?`<div class="hero"><span class="htile">${g(P.ic)}</span><div><h3>${P.t}</h3><p>${P.sum}</p></div></div>`:`<div class="wph"><h3>${P.t}</h3></div>`;
 return `<div class="ph web" data-dir="${dir}">${SB}<div class="wix"><div class="wph"><h3>Settings</h3><p>jo@hey.com</p></div><div class="wwho">${av('JM',40)}<div class="tx"><b>Jo Martins</b><s>jo@hey.com</s></div><span class="pb ol">Sign out</span></div>${idx}</div><div class="wpg"><div class="wpgin">${head}${P.secs.map(s=>section(s,dir,'web')).join('')}</div></div></div>`;
}
function frame(id,dir,plat){return plat==='web'?(id==='index'?'':web(id,dir)):phone(id,dir,plat)}
Object.assign(window,{PAGES,frame,phone,web,choice,g,av,sw,appsEmpty,reqCard,section,row});
