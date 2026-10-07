/* Memories tab: one list and one map of the same memories, behind a List | Map switch.
   038's kinds, with their words folded into About and the possessives dropped. */
(function(){
const g=(n,s)=>`<i class="g" style="--ic:url(../assets/icons/${n}.svg)${s?';width:'+s+'px;height:'+s+'px':''}"></i>`;
const K={
 people:{l:'People',ic:'users',c:'var(--label-2)'},
 things:{l:'Things',ic:'tag',c:'var(--label-1)'},
 about:{l:'About',ic:'heart',c:'var(--label-6)'},
 rules:{l:'Rules',ic:'compass',c:'var(--ink-950)'},
 patterns:{l:'Patterns',ic:'spline',c:'var(--label-5)'}
};
const KO=['people','things','about','rules','patterns'];
/* [kind, text, origin, day, source, world x, world y]. Positions: kind first, then meaning. */
const M=[
 ['people','Their wife is Meera.','stated','3 Oct','Said in Lisbon trip',232,206],
 ['people','Meera\u2019s birthday is 14 March.','stated','3 Oct','Said in Lisbon trip',300,250],
 ['people','They call their mother Maman.','learned','Yesterday','From what you said in Sunday lunch',214,372],
 ['people','Their brother is Arjun.','learned','28 Sep','From what you said in Bookshelf build',300,410],
 ['things','They share a calendar with Meera.','answered','2 Oct','Your answer to \u201cWhich calendar is shared with Meera?\u201d',590,230],
 ['things','Home is in Toronto.','learned','26 Sep','From a note in Groceries',760,300],
 ['things','Their car is a 2019 Civic.','stated','19 Sep','Said in Car',800,380],
 ['about','\u201cThe cottage\u201d is the place in Muskoka.','learned','Yesterday','From what you said in Long weekend',420,630],
 ['about','\u201cStandup\u201d is their 9:30 work meeting.','learned','30 Sep','From a note in Work',196,604],
 ['about','They work at Shopify as a designer.','stated','12 Sep','Said in Work',250,560],
 ['about','They have two kids, Sam and Leila.','learned','24 Sep','From a note in School',300,740],
 ['about','They are allergic to nuts.','stated','10 Sep','Said in Groceries',190,790],
 ['rules','They write dates day first.','stated','8 Sep','Said in Lisbon trip',700,770],
 ['rules','Work things never go in Home.','stated','8 Sep','Said in Home',780,830],
 ['patterns','They pay bills on the 5th.','learned','Today','From notes in Home and Bills',600,520],
 ['patterns','They shop for groceries on Sundays.','learned','1 Oct','From notes in Groceries',660,580]
].map((r,i)=>({id:i,k:r[0],t:r[1],o:r[2],d:r[3],s:r[4],x:r[5],y:r[6]}));
/* kind clouds, and the smaller groups of meaning inside them */
const CL={people:[262,310,190],things:[720,300,170],about:[290,680,210],rules:[740,800,120],patterns:[630,550,110]};
const SUB=[['people',266,228,80],['people',257,391,74],['things',590,230,58],['things',780,340,84],['about',223,582,76],['about',420,630,56],['about',245,765,84],['rules',740,800,80],['patterns',630,550,76]];
const by=k=>M.filter(m=>m.k===k);
const kv=(k,x='')=>`data-k="${k}" style="--k:${K[k].c};${x}"`;
const meta=m=>`<span class="mt">${m.o==='learned'?`<span class="lr" style="display:flex;align-items:center;gap:4px">${g('sparkles')}Learned</span>`:`<span>${m.o==='answered'?'Your answer':'You said'}</span>`}<span>\u00b7</span><span>${m.d}</span></span>`;

let PLAT='ios';
const stb=()=>PLAT==='android'?`<div class="stb"><span>9:41</span><i>\u25be \u25b4 \u25ae</i></div>`:`<div class="stb"><span>9:41</span><i>\u25cf\u25cf\u25cf \u25ae</i></div>`;
const plate=()=>`<div class="plate"><div class="cmp"><s>Dump anything</s><span>${g('camera')}</span><span>${g('mic')}</span></div><div class="tabs"><span>${g('sun')}Today</span><span>${g('message-circle')}Threads</span><span class="on">${g('cloudy')}Memories</span></div><div class="hb"><i></i></div></div>`;
const phone=(body,over='',view='list')=>`<div class="ph">${stb()}${bar(view)}<div class="body">${body}</div>${plate()}${over}</div>`;
/* the switch is Segmented's icon variant, as a thread's List | Map */
const sw=(view)=>`<span class="vt">${['list','map'].map(v=>`<i class="${v===view?'on':''}">${g(v,16)}</i>`).join('')}</span>`;
const bar=(view)=>`<div class="ab"><h1>Memories</h1>${sw(view)}<span class="ib">${g('search')}</span><span class="ib">${g('plus')}</span></div>`;
const LOGO=`<svg width="20" height="20" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="21" r="10" fill="currentColor"/><path d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/></svg>`;
const web=(view,main,pane)=>`<div class="wb"><nav class="side"><span class="brand">${LOGO}offload</span><span class="ni">${g('sun')}Today</span><span class="ni">${g('message-circle')}My threads<em>14</em></span><span class="ni on">${g('cloudy')}Memories<em>${M.length}</em></span><span class="sl">Recent</span>${['Lisbon trip','Bookshelf build','Groceries','Work'].map(n=>`<span class="ni">${g('lasso')}${n}</span>`).join('')}<span class="ft"></span><span class="ni">${g('bell')}Activity</span><span class="ni">${g('settings')}Settings</span></nav><div class="wm"><div class="wh"><h1>Memories</h1>${sw(view)}<span class="srch">${g('search')}Search memories</span><span class="wbtn">${g('plus')}New memory</span></div><div class="wcols"><div class="wlist" style="${view==='map'?'padding:0;position:relative':''}">${main}</div>${pane?`<div class="wpane">${pane}</div>`:''}</div></div></div>`;
const cell=(html,lab)=>`<div class="cell">${html}<div class="lab">${lab}</div></div>`;

/* list */
const row=(m,o={})=>`<div class="rw${o.dot?' ind':''}${o.cls?' '+o.cls:''}" ${kv(m.k)}>${o.dot?'<span class="dot"></span>':''}<span class="tx"><b>${m.t}</b>${meta(m)}</span></div>`;
const swiped=m=>`<div class="swp"><span class="act">Forget</span>${row(m)}</div>`;
const segSort=(s)=>`<div class="seg"><i class="${s==='kind'?'on':''}">By kind</i><i class="${s==='new'?'on':''}">Newest</i></div>`;
const kindList=(o={})=>`${segSort('kind')}${KO.slice(0,o.n||3).map(k=>`<div class="sh" ${kv(k,o.gut||'')}><span class="sw"></span>${K[k].l}<em>${by(k).length}</em></div>${by(k).map((m,i)=>o.swipe&&k==='things'&&i===1?swiped(m):row(m,{cls:o.cls?o.cls+(m.id===o.on?' on':''):''})).join('')}`).join('')}`;

/* the editor, one for both views */
const kindPick=sel=>`<div class="kgrid">${KO.map(k=>`<span class="ko${k===sel?' on':''}" ${kv(k)}>${g(K[k].ic)}${K[k].l}</span>`).join('')}</div>`;
const editor=(m,head)=>`${head}<div class="fld"><p>${m.t}<i></i></p><div class="cnt">${m.t.length}/200</div></div>
<div class="slab">Kind</div>${kindPick(m.k)}
<div class="why">${g(m.o==='learned'?'sparkles':m.o==='answered'?'message-circle-more':'text-quote')}<span>${m.o==='learned'?`<b>offload learned this</b> ${m.d==='Yesterday'?'yesterday':'on '+m.d}. ${m.s}.`:m.o==='answered'?`<b>${m.s}</b> on ${m.d}. It picks that calendar next time you say \u201cwith Meera\u201d.`:`<b>You asked offload to remember this</b> on ${m.d}. ${m.s}.`}</span></div>
<span class="forget">${g('trash-2')}Forget</span>`;
const sheet=(m,top)=>`<div class="dim"></div><div class="sheet" style="top:${top}px"><span class="grab"></span>${editor(m,'<div class="shh"><span class="cx">Cancel</span><b>Memory</b><span class="done">Save</span></div>')}</div>`;
const paneEd=m=>editor(m,'<div class="shh"><b>Memory</b><span class="wbtn" style="height:32px">Save</span></div>');

/* map: a world of 1000 by 1000, seen through a viewport at centre (cx,cy) and zoom z.
   Zoomed out, memories are dots and the kinds are named; zoomed in, they are readable. */
function map(W,H,cx,cy,z,o={}){
 const X=x=>(x-cx)*z+W/2,Y=y=>(y-cy)*z+H/2,near=z>=.95;
 let h=`<div class="fd"><div class="tex"></div>`;
 KO.forEach(k=>{const c=CL[k],r=c[2]*z*1.25;h+=`<span class="cl" ${kv(k,`left:${X(c[0])-r}px;top:${Y(c[1])-r}px;width:${r*2}px;height:${r*2}px`)}></span>`});
 SUB.forEach(s=>{const r=s[3]*z;h+=`<span class="sub" ${kv(s[0],`left:${X(s[1])-r}px;top:${Y(s[2])-r}px;width:${r*2}px;height:${r*2}px`)}></span>`});
 if(!near)KO.forEach(k=>{const c=CL[k];h+=`<span class="cln" ${kv(k,`left:${X(c[0])}px;top:${Y(c[1]-c[2]*.72)}px`)}>${g(K[k].ic)}${K[k].l}<u>${by(k).length}</u></span>`});
 M.forEach(m=>{const x=X(m.x),y=Y(m.y);if(x<-140||x>W+140||y<-40||y>H+40)return;
  if(!near){h+=`<span class="md${m.o==='learned'?' lrn':''}" ${kv(m.k,`left:${x}px;top:${y}px`)}></span>`;return}
  h+=`<span class="mp${m.id===o.tap?' tap':''}" ${kv(m.k,`left:${x}px;top:${y}px;font-size:${Math.min(16,11+z*2.4).toFixed(1)}px;max-width:${Math.round(110+z*55)}px`)}>${m.o==='learned'?g('sparkles'):''}${m.t}</span>`});
 if(near&&o.edge)o.edge.forEach(k=>{const c=CL[k];const rx=X(c[0]),x=Math.min(W-12,Math.max(12,rx)),y=Math.min(H-60,Math.max(24,Y(c[1]))),tx=rx>W-12?'-100%':rx<12?'0':'-50%';h+=`<span class="edge" ${kv(k,`left:${x}px;top:${y}px;transform:translate(${tx},-50%)`)}>${g(K[k].ic)}${K[k].l}</span>`});
 const zp=Math.round((Math.log(z/.42)/Math.log(2.4/.42))*100);
 h+=`<span class="zm"><span>+</span><b><i style="height:${Math.max(6,zp)}%"></i></b><span>\u2212</span></span>`;
 return h+(o.extra||'')+'</div>';
}

function render(){
 if(PLAT==='web'){
  return [
   cell(web('list',kindList({n:3,cls:'wrw',on:4,gut:'--gut:14px'}),paneEd(M[4])),'List. Two panes, as a thread is on web: the memory you pick opens on the right.'),
   cell(web('map',map(1048-400,690,450,470,.72),null).replace('<div class="wlist" style="padding:0;position:relative">','<div class="wlist" style="padding:0;position:relative;height:690px">'),'Map, zoomed out: every kind is a cloud with its count, and each memory is a dot. Scroll or pinch on the trackpad to zoom, drag to move around.'),
   cell(web('map',map(1048-400,690,250,300,1.7,{tap:2,edge:['things','about','patterns']}),paneEd(M[2])).replace('<div class="wlist" style="padding:0;position:relative">','<div class="wlist" style="padding:0;position:relative;height:690px">'),'Map, zoomed into People. Clicking a memory opens the same pane as the list. The kinds you have moved away from wait at the edges; click one to go there.')
  ].join('');
 }
 const W=PLAT==='android'?412:390,H=PLAT==='android'?640:600;
 const list=`<div class="scroll">${kindList({swipe:1})}</div>`;
 return [
  cell(phone(list),'List, by kind. The switch beside the title changes view and stays where you left it. A swipe forgets, with the same Undo as a thread.'),
  cell(phone(list,sheet(M[2],236)),'Tap a row: the sentence opens in a sheet. Rewrite it, move it to another kind, or forget it. The grey box says where it came from.'),
  cell(phone(map(W,H,480,520,.42),'','map'),'Map, zoomed out. One cloud per kind, sized by how much is in it. Memories are dots, amber where offload learned them. Nothing to read yet; this is the overview.'),
  cell(phone(map(W,H,262,320,1.05,{edge:['things','about','patterns']}),'','map'),'Pinch into People. Inside a kind, memories that mean similar things sit together: Meera\u2019s two, then family. The kinds off screen are labelled at the edge.'),
  cell(phone(map(W,H,262,320,1.05,{tap:2,edge:['things','about','patterns']}),sheet(M[2],236),'map'),'Tap a memory on the map and the same sheet opens. Close it and you are where you were.'),
  cell(phone(map(W,H,280,650,1.15,{edge:['people','rules','patterns']}),'','map'),'About, which now holds their words too. Work, the cottage, and the household each make their own group.')
 ].join('');
}
window.MEM={render,setPlat:p=>{PLAT=p}};
})();
