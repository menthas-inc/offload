const { Icon, IconButton, Badge, Button, Chip, Toast } = OFFLOAD_DS;

/* The whole shell in one place: a sidebar, a stack of panes two of which are on screen,
   one composer, and the two overlays. Pane rules, in order of how often they bite:
   - paper alternates with depth: page colour, white, page colour, and so on
   - the stack holds five at most; a sixth drops the oldest
   - a third pane pushes the leftmost out rather than shrinking everything
   - clicking a sidebar link resets to a single pane
   - narrow windows drop to one pane and the crumb becomes a back button */
function paneTitle(p){
  if(p.kind==="today")return {label:"Today",icon:"sun"};
  if(p.kind==="things")return {label:"My threads",icon:"lasso"};
  if(p.kind==="memories")return {label:"Memories",icon:"cloudy"};
  if(p.kind==="conversations")return {label:"All conversations",icon:"message-circle"};
  if(p.kind==="settings")return {label:"Settings",icon:"settings"};
  if(p.kind==="setting")return {label:(S_PAGE[p.id]||{}).title||"Settings",icon:(S_PAGE[p.id]||{}).icon||"settings"};
  if(p.kind==="first")return {label:"Today",icon:"sun"};
  if(p.kind==="thread"){const t=D.spaces.find(s=>s.id===p.id);return {label:t?t.name:"Thing",icon:"lasso"};}
  if(p.kind==="memory"){const m=D.memories.items[p.id];return {label:m?m.label:"Memory",icon:"cloudy"};}
  if(p.kind==="person")return {label:(D.people[p.id]||{}).name||p.id,icon:"users"};
  if(p.kind==="conversation")return {label:p.title,icon:"message-circle"};
  if(p.kind==="task")return {label:p.label||"Thing",icon:"check"};
  if(p.kind==="calendar")return {label:"Calendar",icon:"calendar"};
  return {label:"offload",icon:"lasso"};
}
/* Note 3, the orphan case: a task or a conversation marks the thread it belongs to. */
function navTarget(p){
  if(!p)return null;
  if(p.kind==="task"){
    const t=p.threadId?D.spaces.find(s=>s.id===p.threadId):D.spaces.find(s=>s.name===p.thread);
    return t?{kind:"thread",id:t.id}:null;
  }
  if(p.kind==="memory"){const m=D.memories.items[p.id];
    const th=m&&m.threads&&m.threads[0];return th?{kind:"thread",id:th.id}:{kind:"memories"};}
  if(p.kind==="conversation"||p.kind==="conversations")return {kind:"memories"};
  if(p.kind==="setting")return {kind:"settings"};
  if(p.kind==="person")return {kind:"things"};
  if(p.kind==="calendar")return {kind:"today"};
  if(p.kind==="first")return {kind:"today"};
  return p;
}

function WThings({open,dead,onDelete,pending,onOpenInvite}){
  const groups=[["For now","now",null],["Always on","always","accent"],["Older threads","older",null]];
  const [allOlder,setAllOlder]=React.useState(false);
  const alive=D.spaces.filter(s=>!dead[s.id]);
  return (
    <>
      <WPaneHead big title="My threads" sub={alive.length+" in here, "+alive.filter(s=>s.kind==="now").length+" live"}/>
      <WBody>
        {pending?<WPendingInvite from={pending.from} thing={pending.thing} initials={pending.initials} onOpen={onOpenInvite}/>:null}
        {groups.map(([label,kind,tone])=>{
          let list=D.spaces.filter(s=>s.kind===kind);
          const total=list.filter(s=>!dead[s.id]).length;
          if(kind==="older"&&!allOlder)list=list.slice(0,3);
          return (
            <React.Fragment key={kind}>
              {kind==="now"?null:<WSection count={total} tone={tone}>{label}</WSection>}
              {list.map((s,i)=>(
                <WRow key={s.id} icon={s.icon} title={s.name} meta={s.meta}
                  tools={["archive","trash-2"]} last={i===list.length-1}
                  gone={!!dead[s.id]} onDelete={()=>onDelete(s.id,s.name)}
                  trailing={<span style={{font:"var(--weight-medium) 14px/1 var(--font-core)",color:"var(--text-secondary)",
                    fontVariantNumeric:"tabular-nums"}}>{s.count}</span>}
                  onClick={()=>open({kind:"thread",id:s.id})}/>
              ))}
              {kind==="older"&&!allOlder&&total>3?<div style={{padding:"var(--space-4) 0 0"}}>
                <Button variant="ghost" size="sm" iconAfter="chevron-right" onClick={()=>setAllOlder(true)}>
                  All {total} older threads</Button></div>:null}
            </React.Fragment>
          );
        })}
      </WBody>
    </>
  );
}

/* The calendar earns the pane mechanism: a real week, hours down the side. */
function WCalendar(){
  const H0=8,H1=21,PX=44;
  const y=h=>Math.round((h-H0)*PX);
  const days=weekDays();
  return (
    <>
      <WPaneHead wide title="Calendar" sub="Week of 10 August"
        tools={[["chevron-left","Previous"],["chevron-right","Next"],["plus","New event"]]}/>
      <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"var(--space-5) var(--space-8) var(--space-7)"}}>
        <div style={{display:"flex",borderTop:"1px solid var(--border-hairline)"}}>
          <div style={{width:50,flex:"0 0 auto",paddingTop:26}}>
            {Array.from({length:H1-H0},(_,i)=>H0+i).map(h=>(
              <div key={h} style={{height:PX,fontSize:11.5,color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums"}}>
                {clock(h,h===H0||h===12)}</div>
            ))}
          </div>
          {days.map(d=>(
            <div key={d.num} style={{flex:1,minWidth:0,boxShadow:"inset 1px 0 0 var(--border-hairline)"}}>
              <div style={{height:26,display:"flex",alignItems:"center",justifyContent:"center",gap:5,
                font:"var(--weight-medium) 12px/1 var(--font-core)",
                color:d.today?"var(--blue-700)":"var(--text-secondary)"}}>
                <span style={{fontVariantNumeric:"tabular-nums"}}>{d.num}</span>{d.name}
              </div>
              <div style={{position:"relative",height:(H1-H0)*PX}}>
                {Array.from({length:H1-H0},(_,i)=>H0+i).map(h=>(
                  <span key={h} style={{position:"absolute",left:0,right:0,top:y(h),height:1,background:"var(--border-hairline)"}}/>
                ))}
                {d.events.map((e,i)=>{
                  const h=Math.max(22,y(e.end)-y(e.start)-3),short=h<40;
                  const bg=e.tone==="attention"?"var(--blue-50)":e.tone==="accent"?"var(--surface-accent-soft)":"var(--surface-fill)";
                  const fg=e.tone==="attention"?"var(--blue-700)":e.tone==="accent"?"var(--text-accent)":"var(--text-primary)";
                  const bar=e.tone==="attention"?"var(--blue-600)":e.tone==="accent"?"var(--moss-600)":"var(--ink-400)";
                  return (
                    <span key={i} style={{position:"absolute",left:3,right:3,top:y(e.start),height:h,overflow:"hidden",
                      borderRadius:"var(--radius-xs)",padding:"4px 6px",background:bg,color:fg,
                      boxShadow:"inset 3px 0 0 "+bar,font:"var(--weight-medium) 11.5px/1.25 var(--font-core)"}}>
                      {short?<span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block"}}>
                        <u style={{textDecoration:"none",opacity:.7,fontVariantNumeric:"tabular-nums"}}>{clock(e.start,true)}</u> {e.title}</span>
                      :<><span style={{display:"block"}}>{e.title}</span>
                        <u style={{display:"block",textDecoration:"none",fontWeight:400,fontSize:10.5,opacity:.75,marginTop:1,
                          fontVariantNumeric:"tabular-nums"}}>{clock(e.start,true)}</u></>}
                    </span>
                  );
                })}
                {d.today?<span style={{position:"absolute",left:0,right:0,top:y(14.6),height:2,background:"var(--clay-600)"}}>
                  <u style={{position:"absolute",left:-4,top:-3,width:8,height:8,borderRadius:99,background:"var(--clay-600)",display:"block"}}/>
                </span>:null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function paneNode(p,ctx){
  switch(p.kind){
    case "today":return <WToday open={ctx.open} now={ctx.now} selectedId={ctx.selectedId}/>;
    case "first":return <WFirstRun onExample={ctx.onExample}/>;
    case "things":return ctx.dayOne
      ?<WQuietEmpty title="My threads" line="Threads appear here on their own, once there is enough in one place to be one."/>
      :<WThings open={ctx.open} dead={ctx.dead} onDelete={ctx.onDelete} pending={ctx.pending} onOpenInvite={ctx.openInvite}/>;
    case "memories":return ctx.dayOne
      ?<WQuietEmpty title="Memories" line="What offload learns about you collects here. Nothing is learned yet."/>
      :<WMemories open={ctx.open}/>;
    case "memory":return <WMemory id={p.id} open={ctx.open} onOpenPerson={ctx.onOpenPerson}/>;
    case "conversations":return <WAllConversations open={ctx.open}/>;
    case "conversation":return <WConversation item={p} turns={ctx.turnsFor(p.id)} writing={ctx.writing===p.id}
      onTick={ctx.onTickAnswer} onPick={(o)=>ctx.onPickReply(p.id,o)}
      onOpenThread={(id)=>ctx.open({kind:"thread",id})}/>;
    case "thread":return <WThing id={p.id} open={ctx.open} onOpenPerson={ctx.onOpenPerson}
      onShare={()=>ctx.onShare((D.spaces.find(s=>s.id===p.id)||{}).name||"this thing")}/>;
    case "task":return <WTask item={p} open={ctx.open}/>;
    case "person":return <WPerson name={p.id} open={ctx.open}/>;
    case "settings":return <WSettings onOpen={ctx.openSetting} activeId={ctx.settingId}/>;
    case "setting":return <WSetting id={p.id} onOpenPerson={ctx.onOpenPerson}/>;
    case "calendar":return <WCalendar/>;
    default:return null;
  }
}

function App(){
  const [panes,setPanes]=React.useState([{kind:"today",depth:0}]);
  const [leaving,setLeaving]=React.useState(null);
  const [dir,setDir]=React.useState(null);
  const [draft,setDraft]=React.useState("");
  const [live,setLive]=React.useState(null);
  const [extra,setExtra]=React.useState({});
  const [writing,setWriting]=React.useState(null);
  const [palette,setPalette]=React.useState(false);
  const [narrow,setNarrow]=React.useState(false);
  const [theme,setTheme]=React.useState("Light");
  const [dead,setDead]=React.useState({});
  /* Before the shell: the gate, the refusal, the no-invite screen and the tutorial. */
  const [phase,setPhase]=React.useState("app");
  const [refused,setRefused]=React.useState(false);
  const [joined,setJoined]=React.useState(false);
  const [step,setStep]=React.useState(1);
  /* Sharing: the modal, and the one invitation waiting in My threads. */
  const [share,setShare]=React.useState(null);
  const [invite,setInvite]=React.useState(false);
  const [pending,setPending]=React.useState({from:"Ana",thing:"Lisbon trip",initials:"AD"});
  const [dayOne,setDayOne]=React.useState(false);
  const [toast,setToast]=React.useState(null);
  const toastTimer=React.useRef(null);

  /* Deleting: the row asks in place, then collapses, then the undo waits eight seconds in
     a toast. Nothing is dropped from the data, so undo is just a flag flip. */
  function onDelete(id,label){
    setDead(d=>({...d,[id]:true}));
    setToast({id,label});
    clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>{
      setToast(t=>t?{...t,leaving:true}:null);
      setTimeout(()=>setToast(null),200);
    },8000);
  }
  function undoDelete(){
    clearTimeout(toastTimer.current);
    setToast(t=>{if(t)setDead(d=>{const n={...d};delete n[t.id];return n});return null});
  }

  const active=panes[panes.length-1];
  const now=React.useMemo(()=>{
    const sun=window.OffloadSun;
    const t=new Date(D.todayIso+"T14:30:00");
    const s=sun?sun.sunsetTime(t):null;
    return {dateLabel:t.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}),
      sunset:s?s.toTimeString().slice(0,5):"19:00",evening:sun?sun.isNight(t):false};
  },[]);

  /* The stack keeps up to five panes; two of them are on screen. Opening slides the new
     pane in from the right, the survivor shifts left with it, and the pane that runs off
     the left edge fades out on its way. Depth is stamped on the pane when it is pushed, so
     truncating the stack never repaints a pane the user is still reading. */
  const MAX_PANES=5;
  function open(p){
    setPanes(prev=>{
      const same=prev[prev.length-1];
      if(same&&same.kind===p.kind&&same.id===p.id)return prev;
      setDir("fwd");
      if(prev.length>=2){
        const out=prev[prev.length-2];
        setLeaving({p:out,depth:out.depth});
        setTimeout(()=>setLeaving(null),260);
      }
      const next=[...prev,{...p,depth:same?same.depth+1:0}];
      return next.length>MAX_PANES?next.slice(next.length-MAX_PANES):next;
    });
  }
  function back(n){setLeaving(null);setDir("back");setPanes(prev=>prev.slice(0,n));}
  /* Settings pages are siblings, not children: opening one from the index replaces the page
     on the right and leaves the index where it is. That is the whole reason for two panes. */
  function openSetting(id){
    const last=panes[panes.length-1];
    if(last&&last.kind==="setting"){
      if(last.id===id)return;
      setDir(null);setLeaving(null);
      setPanes(prev=>[...prev.slice(0,-1),{kind:"setting",id,depth:prev[prev.length-1].depth}]);
      return;
    }
    open({kind:"setting",id});
  }
  function reset(p){setLeaving(null);setDir(null);setPanes([{...p,depth:0}]);}
  const trail=panes.map(p=>Object.assign({},paneTitle(p),{pane:p}));

  function turnsFor(id){return (D.memories.turns[id]||[]).concat(extra[id]||[]);}
  function answerFor(said){
    const s=said.toLowerCase();
    /* 013: answered from what the account can see, and nothing is filed. Decided on the
       text before anything is read, so the same sentence always lands the same way. */
    const AN=D.answers||{};
    /* 016: a public fact offload does not hold, answered with the domain it came from. */
    if(/memorial day|bank holiday|what day is|public holiday/.test(s))return {text:"Monday 25 May.",refs:[{id:"lisbon",name:"Ana's bbq",kind:"thread"}],
      sources:[{domain:"timeanddate.com",url:"https://www.timeanddate.com/holidays/us/memorial-day"}]};
    /* Six reads are possible in one turn, so this is the three-chips-and-a-count case. */
    if(/long weekend|what's on|whats on|going on near/.test(s))return {text:"Three things on Monday. Filed the cooler.",
      refs:[{id:"lisbon",name:"Ana's bbq",kind:"thread"}],
      sources:[{domain:"timeanddate.com",url:"#"},{domain:"visitlisboa.com",url:"#"},{domain:"cp.pt",url:"#"},
        {domain:"metro.lisboa.pt",url:"#"},{domain:"fetedeslumieres.example",url:"#"}]};
    /* A link that could not be read is filed as it always was, and offload says nothing. */
    if(/^https?:\/\//.test(s))return {text:"Filed it.",refs:[{id:"read",name:"Read later",kind:"thread"}]};
    if(/gun show|which candidate|polls are ahead/.test(s))return {text:"Can't search that."};
    if(/theme|dark mode|text size/.test(s))return AN.theme;
    if(/butter|already add|did i add|is .* on the list/.test(s))return AN.butter;
    if(/left to do|still open|what is left|outstanding|to do from/.test(s))return AN.open;
    if(/staying|where am i|which flat|alfama/.test(s))return AN.staying;
    if(/knife|sharpen|did i save|read later/.test(s))return AN.cutShort;
    if(/which trip|the trip|trips/.test(s))return AN.which;
    if(/owe|money|cost|pay/.test(s))return {text:"Three things. You owe Ana \u20ac214 for the flights, Sam \u00a312 for the drill bits, and the flat insurance renews at \u00a3340 on the 20th.",
      refs:[{id:"lisbon",name:"Lisbon trip"},{kind:"money",name:"\u20ac214 to Ana"},{kind:"time",name:"the 20th"}]};
    if(/ana|date|when/.test(s))return {text:"Ana can only travel the 14th to the 17th. She said so on Tuesday, and nothing has changed since.",
      refs:[{id:"lisbon",name:"Lisbon trip"},{kind:"time",name:"14th to 17th"}]};
    if(/shelf|bookshelf|bracket/.test(s))return {text:"Oak, 210cm by 76cm, matte black brackets at 30cm. The brackets aren't ordered and the sale ends Friday.",
      refs:[{id:"shelf",name:"Bookshelf build"},{kind:"time",name:"Friday"}]};
    return {text:"Kept it with the Lisbon trip, where the rest of that lives.",refs:[{id:"lisbon",name:"Lisbon trip"}]};
  }
  /* An instruction gets a mark, not a sentence. Anything else gets an answer. */
  function converse(key,said){
    const push=rows=>setExtra(t=>({...t,[key]:[...(t[key]||[]),...rows]}));
    const order=/^(delete|remove|forget|turn off|stop|remind|snooze|mark)\b/i.test(said);
    push([{from:"you",text:said,status:order?undefined:"seen"}]);
    setDraft("");
    if(order){setTimeout(()=>setExtra(t=>{const rows=[...(t[key]||[])];
      for(let i=rows.length-1;i>=0;i--)if(rows[i].from==="you"){rows[i]={...rows[i],status:"done"};break;}
      return {...t,[key]:rows};}),900);return;}
    setTimeout(()=>setWriting(key),500);
    setTimeout(()=>{setWriting(null);push([{from:"offload",...answerFor(said)}]);},1700);
  }
  /* A tap on a quick reply is your turn, written into the log as typing it would be. */
  function pickReply(key,option){
    const push=row=>setExtra(t=>({...t,[key]:[...(t[key]||[]),row]}));
    push({from:"you",text:option.label});
    if(option.kind==="plain"){setTimeout(()=>push({from:"offload",text:"Left it off."}),700);return;}
    setTimeout(()=>{
      if(option.kind==="thread"){push({from:"offload",text:option.label+". The flights and the flat are both booked."});return;}
      push({from:"offload",text:"Added to Groceries."});
      setToast({id:"answer-add",undoable:true,label:"Butter added to Groceries."});
    },900);
  }

  function submit(){
    const said=draft.trim();
    if(!said)return;
    if(active.kind==="conversation"){converse(active.id,said);setDraft("");return;}
    if(live){converse(live.id,said);return;}
    const id="live-"+Date.now();
    setLive({id,title:said});
    converse(id,said);
  }

  React.useEffect(()=>{
    const h=(e)=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setPalette(v=>!v);}
      if(e.key==="Escape"){setPalette(false);setLive(null);}
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[]);

  /* Ticking is the only write a result row can do, and it is reversible the ordinary way. */
  function onTickAnswer(row,next){setToast({id:"answer-tick",undoable:true,label:(next?"Ticked ":"Put back ")+row.title});}
  const ctx={open,now,turnsFor,writing,dead,onDelete,openSetting,dayOne,pending,
    onTickAnswer,onPickReply:pickReply,
    onShare:(name)=>setShare(name),openInvite:()=>setInvite(true),
    onOpenPerson:(name)=>open({kind:"person",id:name}),
    onExample:(text)=>{setDraft(text);reset({kind:"today"});},
    selectedId:active&&active.kind==="task"?active.id:null,
    settingId:active&&active.kind==="setting"?active.id:null};

  const shown=narrow?[active]:panes.slice(-2);
  const paperAt=(d)=>d%2===0?"page":"raised";
  const unread=D.notifications.filter(n=>n.unread).length;

  return (
    <>
      <style>{"@keyframes w-pulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes w-rise{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}@keyframes w-pane-in{from{transform:translateX(120px);opacity:0}to{transform:none;opacity:1}}@keyframes w-pane-shift{from{transform:translateX(80px)}to{transform:none}}@keyframes w-pane-back{from{transform:translateX(-64px);opacity:0}to{transform:none;opacity:1}}@keyframes w-grow{from{max-height:0;opacity:0}to{max-height:420px;opacity:1}}@keyframes w-fade{from{opacity:0}to{opacity:1}}@keyframes w-crumb{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}@keyframes w-mark{from{transform:scaleY(.2);opacity:0}to{transform:none;opacity:1}}@keyframes w-sink{from{transform:none;opacity:1}to{transform:translateY(8px);opacity:0}}"}</style>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",width:narrow?1180:1440}}>
        <span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:11,color:"var(--text-tertiary)"}}>preview</span>
        {[["Light"],["Dark"]].map(([t])=>(
          <button key={t} type="button" onClick={()=>setTheme(t)}
            style={{border:"none",cursor:"pointer",height:26,padding:"0 10px",borderRadius:"var(--radius-pill)",
              font:"var(--weight-medium) 12px/1 var(--font-core)",
              background:theme===t?"var(--surface-inverse)":"var(--surface-fill)",
              color:theme===t?"var(--text-inverse)":"var(--text-secondary)"}}>{t}</button>
        ))}
        <span style={{width:1,height:18,background:"var(--border-hairline)"}}/>
        {[["1440, two panes",false],["1180, one pane",true]].map(([l,v])=>(
          <button key={l} type="button" onClick={()=>setNarrow(v)}
            style={{border:"none",cursor:"pointer",height:26,padding:"0 10px",borderRadius:"var(--radius-pill)",
              font:"var(--weight-medium) 12px/1 var(--font-core)",
              background:narrow===v?"var(--surface-inverse)":"var(--surface-fill)",
              color:narrow===v?"var(--text-inverse)":"var(--text-secondary)"}}>{l}</button>
        ))}
        <span style={{width:1,height:18,background:"var(--border-hairline)"}}/>
        <span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:11,color:"var(--text-tertiary)"}}>first run</span>
        {[["sign in","signin"],["refusal","refusal"],["not invited","notinvited"],["tutorial","tutorial"],["day one","empty"],["app","app"]].map(([l,p])=>{
          const on=p==="refusal"?(phase==="signin"&&refused)
            :p==="empty"?(phase==="app"&&dayOne)
            :(phase===p&&!(p==="signin"&&refused)&&!(p==="app"&&active.kind==="first"));
          return <button key={l} type="button" onClick={()=>{
            if(p==="refusal"){setPhase("signin");setRefused(true);return}
            setRefused(false);setJoined(false);setStep(1);setShare(null);setInvite(false);
            if(p==="empty"){setPhase("app");setDayOne(true);reset({kind:"first"});return}
            setDayOne(false);
            setPhase(p);
            if(p==="app")reset({kind:"today"});
          }} style={{border:"none",cursor:"pointer",height:26,padding:"0 10px",borderRadius:"var(--radius-pill)",
            font:"var(--weight-medium) 12px/1 var(--font-core)",
            background:on?"var(--surface-inverse)":"var(--surface-fill)",
            color:on?"var(--text-inverse)":"var(--text-secondary)"}}>{l}</button>;
        })}
      </div>
      <div data-theme={theme==="Dark"?"dark":"light"}
        style={{width:narrow?1180:1440,height:900,display:"flex",overflow:"hidden",position:"relative",
          borderRadius:"var(--radius-lg)",background:"var(--surface-page)",color:"var(--text-primary)",
          border:"1px solid var(--border-hairline)",boxShadow:"var(--shadow-3)"}}>
        {phase!=="app"?<WGate phase={phase} refused={refused} joined={joined} step={step}
          onApple={()=>{setRefused(false);setStep(1);setPhase("tutorial")}}
          onGoogle={()=>{setRefused(false);setPhase("notinvited")}}
          onJoin={()=>setJoined(true)}
          onSwitch={()=>{setJoined(false);setPhase("signin")}}
          onSkip={()=>{setPhase("app");setDayOne(true);reset({kind:"first"})}}
          onNext={()=>{if(step<window.W_TUTORIAL_STEPS)setStep(step+1);else{setPhase("app");setDayOne(true);reset({kind:"first"})}}}/>:(<>
        <WSidebar active={navTarget(active)} unread={unread} dead={dead}
          onTab={(k)=>reset({kind:k})} onOpen={reset}
          onSettings={()=>reset({kind:"settings"})}/>
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
          <WCrumbs trail={trail} narrow={narrow}
            onJump={(i)=>back(i+1)}
            onBack={()=>back(panes.length-1)}
            onClose={()=>back(panes.length-1)}/>
          <div style={{flex:1,minHeight:0,display:"flex",overflow:"hidden",position:"relative"}}>
            {leaving?<WPane leaving width={LEFT_W} paper={paperAt(leaving.depth)}>{paneNode(leaving.p,ctx)}</WPane>:null}
            {shown.map((p,i)=>{
              const top=i===shown.length-1;
              const anim=dir==="fwd"?(top?"w-pane-in":"w-pane-shift"):dir==="back"?"w-pane-back":null;
              return (
                <WPane key={p.kind+(p.id||"")+p.depth} paper={paperAt(p.depth)} edge={i>0} anim={anim}
                  width={top?undefined:LEFT_W}>
                  {paneNode(p,ctx)}
                </WPane>
              );
            })}
          </div>
          <WComposer value={draft} onChange={setDraft} onSubmit={submit}
            placeholder={active.kind==="conversation"||live?"Add to this":undefined}
            live={live?live.title:null} turns={live?turnsFor(live.id):[]} writing={live?writing===live.id:false}
            onTick={onTickAnswer} onPick={(o)=>live&&pickReply(live.id,o)}
            onClose={()=>setLive(null)}
            onOpenThread={(id)=>{setLive(null);open({kind:"thread",id})}}
            onExpand={()=>{open({kind:"conversation",id:live.id,title:live.title,when:"Just now"});setLive(null)}}/>
        </div>
        {palette?<WPalette onClose={()=>setPalette(false)} open={open} onTab={(k)=>reset({kind:k})} dead={dead}/>:null}
        {share?<WShareModal thingName={share} onClose={()=>setShare(null)}
          onShared={(names)=>{setToast({id:"share",undoable:false,label:"Shared with "+names.join(" and ")});
            clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),8000);}}/>:null}
        {invite?<WInviteModal from={pending.from} thing={pending.thing} initials={pending.initials}
          onLater={()=>setInvite(false)}
          onAccept={()=>{setInvite(false);setPending(null);setToast({id:"inv",undoable:false,label:"Added to your threads"});
            clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),8000);}}/>:null}
        {toast?<div style={{position:"absolute",left:0,right:0,bottom:104,display:"flex",justifyContent:"center",zIndex:30,
          animation:(toast.leaving?"w-sink 200ms":"w-rise 220ms")+" var(--ease-out) both"}}>
          <Toast message={toast.undoable===false?toast.label:toast.label+" deleted"}
            icon={toast.id==="share"?"share-2":toast.id==="inv"?"sparkles":"trash-2"}
            action={toast.undoable===false?undefined:"Undo"}
            onAction={toast.undoable===false?undefined:undoDelete}/>
        </div>:null}
        </>)}
      </div>
    </>
  );
}
Object.assign(window,{App});
