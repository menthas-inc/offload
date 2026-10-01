const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Sheet, Toast, Button, PrismField } = OFFLOAD_DS;
/* Never borrow another thread's summary: if offload has not written one, say only
   what this thread's own fields support. */
function neutralStanding(thread){
  if(!thread) return null;
  return {text:thread.count+" things in here. "+(thread.kind==="older"?"Nothing has moved for a while.":"Nothing needs an answer right now."),
    updated:"no summary yet"};
}

function App(){
  const D=(typeof window!=="undefined"&&window.OFFLOAD_DATA)||{spaces:[],today:[],earlier:[],lisbon:{notes:[],tasks:[]},prompts:[]};
  const [tab,setTab]=React.useState("home");
  const [space,setSpace]=React.useState(null);
  const [person,setPerson]=React.useState(null);
  const [memory,setMemory]=React.useState(null);
  const [convo,setConvo]=React.useState(null);
  const [allConvos,setAllConvos]=React.useState(false);
  const [writing,setWriting]=React.useState(false);
  const [extraTurns,setExtraTurns]=React.useState({});
  const [draft,setDraft]=React.useState("");
  const [sheet,setSheet]=React.useState(false);
  const [toast,setToast]=React.useState(null);
  /* A swipe hides a row and offers undo. Nothing is destroyed while the toast is up. */
  const [hidden,setHidden]=React.useState([]);
  const undoTimer=React.useRef(null);
  function remove(id,what){
    setHidden(h=>h.concat(id));
    clearTimeout(undoTimer.current);
    setToast({message:(what||"Deleted")+", gone in a moment",action:"Undo",
      onAction:()=>setHidden(h=>h.filter(x=>x!==id))});
    undoTimer.current=setTimeout(()=>setToast(null),8000);
  }
  /* Every toast leaves on its own, whether or not it carries an undo. Raising one through
     this is the only way, so a confirmation can never sit over the screen for good. */
  function say(message,action,onAction){
    clearTimeout(undoTimer.current);
    setToast({message,action,onAction});
    undoTimer.current=setTimeout(()=>setToast(null),8000);
  }
  const [nowOverride,setNowOverride]=React.useState(null);
  /* An exchange started from a page, before it becomes a saved conversation. */
  const [live,setLive]=React.useState(null);
  const [folded,setFolded]=React.useState(false);
  /* Every dump ticks this, and the prism field warps when it changes. It is a
     count rather than a boolean so consecutive arrivals each register. */
  const [filed,setFiled]=React.useState(0);
  /* Opening the list marks everything read; the rows stay, greyed. */
  const [notifs,setNotifs]=React.useState(D.notifications||[]);
  const [notifOpen,setNotifOpen]=React.useState(false);
  const [notifClosing,setNotifClosing]=React.useState(false);
  const [settings,setSettings]=React.useState(false);
  const [settingsPage,setSettingsPage]=React.useState(null);
  /* One switch for the whole app: System follows the device, the other two force it. */
  const [theme,setTheme]=React.useState("Light");
  /* First run: the gate, the tutorial, and the two states that come off them. */
  const [phase,setPhase]=React.useState("app");
  const [refused,setRefused]=React.useState(false);
  const [joined,setJoined]=React.useState(false);
  const [step,setStep]=React.useState(1);
  /* Sharing: the sheet, and the one invitation waiting in My threads. */
  const [share,setShare]=React.useState(null);
  const [invite,setInvite]=React.useState(false);
  const [pending,setPending]=React.useState({from:"Ana",thing:"Lisbon trip",initials:"AD"});
  const themeAttr=theme.toLowerCase();

  const now=nowOverride||new Date();
  const tod=timeOfDay(now);
  const [tasks,setTasks]=React.useState(D.lisbon.tasks);
  const [today,setToday]=React.useState(D.today);
  if(!D.spaces.length) return null;

  function saidFrom(p){
    const text=(p.text||"").trim();
    const photos=p.photos||[];
    if(!text&&!p.voice&&!photos.length)return null;
    const said={text};
    if(p.voice)said.voice=p.voice;
    if(photos.length)said.photos=photos;
    return said;
  }
  /* One reply machine for both the overlay and the full conversation: seen, then
     either a mark for an instruction or writing and an answer. */
  function converse(key,said,answer){
    const asText=said.text||(said.voice?"a voice note":"");
    const push=(rows)=>setExtraTurns(t=>({...t,[key]:[...(t[key]||[]),...rows]}));
    const setLast=(status)=>setExtraTurns(t=>{const rows=[...(t[key]||[])];
      for(let i=rows.length-1;i>=0;i--){if(rows[i].from==="you"){rows[i]={...rows[i],status};break;}}
      return {...t,[key]:rows};});
    const isOrder=/^(delete|remove|forget|turn off|stop|remind|snooze|mark)\b/i.test(asText);
    push([{from:"you",...said,status:"seen"}]);
    setDraft("");
    if(isOrder){setTimeout(()=>setLast("done"),1100);return;}
    setTimeout(()=>setWriting(true),700);
    setTimeout(()=>{setWriting(false);setLast(null);push([{from:"offload",...answer(asText)}]);},2100);
  }
  /* Canned but specific: money and dates answer from the sample data, anything else
     is acknowledged. A prototype should never pretend to understand. */
  function answerFor(said){
    const s=said.toLowerCase();
    /* 013: a question is answered from what offload has and files nothing. Decided on the
       text, before anything is read. */
    const A=D.answers||{};
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
    if(/theme|dark mode|text size/.test(s))return A.theme;
    if(/butter|already add|did i add|is .* on the list/.test(s))return A.butter;
    if(/left to do|still open|what is left|outstanding|to do from/.test(s))return A.open;
    if(/staying|where am i|which flat|alfama/.test(s))return A.staying;
    if(/knife|sharpen|did i save|read later/.test(s))return A.cutShort;
    if(/which trip|the trip|trips/.test(s))return A.which;
    if(/owe|money|cost|pay/.test(s))return {text:"Three things. You owe Ana \u20AC214 for the flights, Sam \u00A312 for the drill bits, and the flat insurance renews at \u00A3340 on the 20th.",
      refs:[{id:"lisbon",name:"Lisbon trip"},{kind:"money",name:"\u20AC214 to Ana"},{kind:"time",name:"the 20th"}]};
    if(/ana|date|when/.test(s))return {text:"Ana can only travel the 14th to the 17th. She said so on Tuesday, and nothing has changed since.",
      refs:[{id:"lisbon",name:"Lisbon trip"},{kind:"time",name:"14th to 17th"}]};
    if(/shelf|bookshelf|bracket/.test(s))return {text:"Oak, 210cm by 76cm, matte black brackets at 30cm. The brackets aren't ordered and the sale ends Friday.",
      refs:[{id:"shelf",name:"Bookshelf build"},{kind:"time",name:"Friday"}]};
    return {text:"Kept it with the Lisbon trip, where the rest of that lives.",refs:[{id:"lisbon",name:"Lisbon trip"}]};
  }

  /* A tap on a quick reply is your turn, written into the log as typing it would be. The
     turn it creates carries the write; the turn that asked carried no write tools. */
  function pickReply(key,option){
    const push=(row)=>setExtraTurns(t=>({...t,[key]:[...(t[key]||[]),row]}));
    push({from:"you",text:option.label});
    if(option.kind==="plain"){setTimeout(()=>push({from:"offload",text:"Left it off."}),700);return;}
    setTimeout(()=>{
      if(option.kind==="thread"){push({from:"offload",text:option.label+". The flights and the flat are both booked."});return;}
      push({from:"offload",text:"Added to Groceries."});
      say("Butter added to Groceries.","Undo",()=>{});
    },900);
  }

  function submit(payload){
    const p=payload||{};
    setFiled((n)=>n+1);
    if(convo){
      const said=saidFrom(p);
      if(said)converse(convo.id,said,()=>({text:"Added to this one, with the rest of it."}));
      return;
    }
    if(live){
      const said=saidFrom(p);
      if(said)converse(live.id,said,answerFor);
      return;
    }
    /* A dump can be typed, spoken, or a photo, and whichever it is, it opens a
       conversation. It belongs there until offload files it, so nothing lands in
       Priority on the way past. */
    const said=saidFrom(p);
    if(!said)return;
    const id="live-"+Date.now();
    setLive({id,title:said.text||(said.voice?"Voice note":(said.photos||[])[0])||"New conversation",from:tab==="home"?tod.label:tab==="spaces"?"My threads":"Memories",when:"Just now"});
    setFolded(false);
    converse(id,said,answerFor);
  }
  const lisbon=D.spaces[0];
  const unread=notifs.filter(n=>n.unread).length;
  /* Dismissing rolls the sheet back up before it leaves; reading is what happens
     when it is gone. */
  function closeNotifications(then){
    if(notifClosing)return;
    setNotifClosing(true);
    setTimeout(()=>{setNotifClosing(false);setNotifOpen(false);
      setNotifs(ns=>ns.map(n=>({...n,unread:false})));
      if(typeof then==="function")then();},260);
  }
  const bell={unread,barSolid:notifOpen,onOpenNotifications:()=>notifOpen?closeNotifications():setNotifOpen(true),
    onOpenSettings:()=>setSettings(true)};

  const empty=phase==="empty";
  let screen;
  if(invite){
    screen=<InviteScreen from={pending.from} thing={pending.thing} initials={pending.initials}
      onAccept={()=>{setInvite(false);setPending(null);say("Added to your threads")}}
      onLater={()=>setInvite(false)}/>;
  } else if(memory){
    screen=<MemoryScreen id={memory} data={D.memories} onBack={()=>setMemory(null)}
      onOpenMemory={setMemory} onOpenThread={(id)=>{setMemory(null);setSpace(id)}}
      onOpenPerson={(who)=>{setMemory(null);setPerson(who)}}/>;
  } else if(settings){
    window.__openSettingsPage=setSettingsPage;
    screen=settingsPage
      ?<SettingsDetail page={settingsPage} onBack={()=>setSettingsPage(null)} theme={theme} setTheme={setTheme}/>
      :<SettingsScreen onBack={()=>setSettings(false)} onOpen={(r)=>setSettingsPage(r.id)}/>;
  } else if(convo){
    screen=<ConversationScreen conversation={convo} onBack={()=>setConvo(null)}
      turns={(D.memories.turns[convo.id]||[]).concat(extraTurns[convo.id]||[])} writing={writing}
      onOpenThread={(id)=>{setConvo(null);setSpace(id)}}/>;
  } else if(allConvos){
    screen=<AllConversationsScreen hidden={hidden} onDelete={remove} data={D.memories} onBack={()=>setAllConvos(false)} onOpenConversation={setConvo}/>;
  } else if(person){
    screen=<PersonScreen person={D.people[person]} memories={D.memories} onOpenMemory={setMemory}
      onBack={()=>setPerson(null)}
      onOpenThread={(id)=>{setPerson(null);setSpace(id)}}/>;
  } else if(space){
    const body=space==="lisbon"?{notes:D.lisbon.notes,tasks:tasks}:(D.contents[space]||{notes:[],tasks:[]});
    /* Only the widgets this thread's contents justify, in the order offload proposes them. */
    const widgets=(D.widgets[space]||[]).map(kind=>({kind,data:(D[kind==="files"?"files":kind]||{})[space]})).filter(w=>w.data);
    screen=<ThreadScreen space={D.spaces.find(s=>s.id===space)||lisbon} notes={body.notes} tasks={body.tasks}
      standing={D.standing[space]||neutralStanding(D.spaces.find(s=>s.id===space))} widgets={widgets}
      onBack={()=>setSpace(null)} onMove={()=>setSheet(true)} onShare={()=>setShare((D.spaces.find(s=>s.id===space)||lisbon).name)}
      onOpenPerson={setPerson}
      onToggle={(id)=>setTasks(tasks.map(t=>t.id===id?{...t,done:!t.done}:t))}/>;
  } else if(empty&&tab==="home"){
    screen=<M3EmptyToday {...bell} onExample={(t)=>setDraft(t)}/>;
  } else if(empty&&tab==="spaces"){
    screen=<M3QuietEmpty {...bell} line="Threads appear here on their own, once there is enough in one place to be one."/>;
  } else if(empty){
    screen=<M3QuietEmpty {...bell} line="What offload learns about you collects here. Nothing is learned yet."/>;
  } else if(tab==="home"){
    screen=<TodayScreen {...bell} hidden={hidden} onDelete={remove} data={D.today_view} now={now} onOpenThread={setSpace} onOpenItem={()=>setSpace("lisbon")} onOpenPerson={setPerson}/>;
  } else if(tab==="spaces"){
    screen=<ThreadsScreen {...bell} hidden={hidden} onDelete={remove} spaces={D.spaces} onOpen={setSpace} onNew={()=>setSheet(true)}
      pending={pending} onOpenInvite={()=>setInvite(true)}/>;
  } else {
    screen=<MemoriesScreen {...bell} hidden={hidden} onDelete={remove} data={D.memories} onOpenMemory={setMemory} onOpenConversation={setConvo} onOpenAll={()=>setAllConvos(true)}/>;
  }

  /* Where you are, as a route and a depth. Going deeper enters from the right, coming back
     enters from the left, and swapping two peers (a tab) fades through. */
  const route=invite?["invite","",2]
    :memory?["memory",memory,2]
    :settings?(settingsPage?["settingsPage",settingsPage,2]:["settings","",1])
    :convo?["convo",convo.id,2]
    :allConvos?["allConvos","",1]
    :person?["person",person,2]
    :space?["space",space,1]
    :["tab",tab,0];
  const routeKey=route[0]+":"+route[1];
  const nav=React.useRef({key:routeKey,depth:route[2],dir:"none"});
  if(nav.current.key!==routeKey){
    nav.current={key:routeKey,depth:route[2],
      dir:route[2]>nav.current.depth?"fwd":route[2]<nav.current.depth?"back":"peer"};
  }
  const enter=nav.current.dir==="none"?undefined
    :nav.current.dir==="peer"?"a-through-in 300ms cubic-bezier(.2,0,0,1) both"
    :(nav.current.dir==="back"?"a-in-x-back":"a-in-x")+" 300ms cubic-bezier(.05,.7,.1,1) both";

  return (
    <>
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"center",
      padding:"8px 10px",background:"var(--paper)",border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-sm)",boxShadow:"var(--shadow-1)"}}>
      <span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:11,color:"var(--text-tertiary)"}}>platform</span>
      {[["iOS","../mobile_app/index.html"],["Android","../android_app/index.html"]].map(([l,href])=>(
        <a key={l} href={href}
          style={{textDecoration:"none",display:"inline-flex",alignItems:"center",height:26,padding:"0 10px",
            borderRadius:"var(--radius-pill)",font:"var(--weight-medium) 12px/1 var(--font-core)",
            background:l==="Android"?"var(--surface-inverse)":"var(--surface-fill)",
            color:l==="Android"?"var(--text-inverse)":"var(--text-tertiary)"}}>{l}</a>
      ))}
      <span style={{width:1,height:18,background:"var(--border-hairline)"}}/>
      <span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:11,color:"var(--text-tertiary)"}}>preview time</span>
      {[["now",null],["10:00",10],["14:00",14],["21:00",21]].map(([l,h])=>{
        const on=h===null?nowOverride===null:(nowOverride&&nowOverride.getHours()===h);
        return <button key={l} type="button" onClick={()=>{if(h===null)setNowOverride(null);else{const dd=new Date();dd.setHours(h,0,0,0);setNowOverride(dd)}}}
          style={{border:"none",cursor:"pointer",height:26,padding:"0 10px",borderRadius:"var(--radius-pill)",
            font:"var(--weight-medium) 12px/1 var(--font-core)",fontVariantNumeric:"tabular-nums",
            background:on?"var(--surface-inverse)":"var(--surface-fill)",
            color:on?"var(--text-inverse)":"var(--text-tertiary)"}}>{l}</button>;
      })}
      <span style={{width:1,height:18,background:"var(--border-hairline)"}}/>
      {["Light","Dark"].map((t)=>(
        <button key={t} type="button" onClick={()=>setTheme(t)}
          style={{border:"none",cursor:"pointer",height:26,padding:"0 10px",borderRadius:"var(--radius-pill)",
            font:"var(--weight-medium) 12px/1 var(--font-core)",
            background:theme===t?"var(--surface-inverse)":"var(--surface-fill)",
            color:theme===t?"var(--text-inverse)":"var(--text-tertiary)"}}>{t}</button>
      ))}
      <span style={{width:1,height:18,background:"var(--border-hairline)"}}/>
      <span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:11,color:"var(--text-tertiary)"}}>first run</span>
      {[["sign in","signin"],["refusal","refusal"],["not invited","notinvited"],["tutorial","tutorial"],["connect","connect"],["mail","mail"],["offline","offline"],["no answer","noanswer"],["day one","empty"],["app","app"]].map(([l,p])=>{
        const on=p==="refusal"?(phase==="signin"&&refused):(phase===p&&!(p==="signin"&&refused));
        return <button key={l} type="button" onClick={()=>{
          if(p==="refusal"){setPhase("signin");setRefused(true);return}
          setRefused(false);setJoined(false);setStep(1);setPhase(p);
          /* Leaving for another phase closes anything the last one left open. */
          setShare(null);setInvite(false);setSpace(null);setPerson(null);setMemory(null);setConvo(null);
        }} style={{border:"none",cursor:"pointer",height:26,padding:"0 10px",borderRadius:"var(--radius-pill)",
          font:"var(--weight-medium) 12px/1 var(--font-core)",
          background:on?"var(--surface-inverse)":"var(--surface-fill)",
          color:on?"var(--text-inverse)":"var(--text-tertiary)"}}>{l}</button>;
      })}
      <span style={{width:1,height:18,background:"var(--border-hairline)"}}/>
      <span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:11,color:"var(--text-tertiary)"}}>
        sunset {window.OffloadSun&&window.OffloadSun.sunsetTime(now)?window.OffloadSun.sunsetTime(now).toTimeString().slice(0,5):", "}
      </span>
    </div>
    <Phone theme={themeAttr}>
      {(phase==="offline"||phase==="noanswer")?<LaunchHold and kind={phase} onRetry={()=>setPhase("app")}/>:null}
      {(phase==="signin"||phase==="notinvited"||phase==="tutorial"||phase==="connect"||phase==="mail")?(
        <AGateShell>{
        phase==="mail"
          ?<MailStep and onDone={()=>setPhase("empty")}/>
          :phase==="connect"
          ?<M3ConnectScreen onConnect={()=>setPhase("mail")} onSkip={()=>setPhase("mail")}/>
          :phase==="notinvited"
          ?<M3NotInvitedScreen joined={joined} onJoin={()=>setJoined(true)}
            onSwitch={()=>{setJoined(false);setPhase("signin")}}/>
          :phase==="tutorial"
            ?<M3TutorialScreen step={step} onSkip={()=>setPhase("app")}
              onNext={()=>{if(step<window.A_TUTORIAL_STEPS)setStep(step+1);else setPhase("connect")}}/>
            :<M3SignInScreen error={refused?"That didn't go through. Nothing was sent, try again.":null}
              onApple={()=>{setRefused(false);setStep(1);setPhase("tutorial")}}
              onGoogle={()=>{setRefused(false);setPhase("notinvited")}}/>
        }</AGateShell>
      ):(<>
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",position:"relative"}}>
        <div key={routeKey} style={{position:"relative",zIndex:1,flex:1,minHeight:0,display:"flex",flexDirection:"column",
          animation:enter}}>
          {screen}
        </div>
        {/* Content dissolves under the bar instead of being cut by its edge, as on iOS. */}
        {notifOpen?null:<span aria-hidden="true" style={{position:"absolute",left:0,right:0,top:"var(--appbar-height)",height:20,zIndex:2,
          pointerEvents:"none",background:"linear-gradient(to bottom,var(--surface-raised),transparent)"}}/>}
        {toast?<div style={{position:"absolute",left:"var(--space-4)",right:"var(--space-4)",bottom:"var(--space-4)",zIndex:10}}>
          <Toast style={{borderRadius:"var(--radius-xs)",boxShadow:"0 1px 2px rgba(0,0,0,0.3),0 2px 6px 2px rgba(0,0,0,0.15)"}}
            message={toast.message} action={toast.action} onAction={()=>{if(toast.onAction)toast.onAction();setToast(null)}}/></div>:null}
        {live&&!folded?(
          <LiveConversation variant="sheet" live={live} turns={(extraTurns[live?live.id:""]||[])} writing={writing}
            onTick={(row,next)=>say((next?"Ticked ":"Put back ")+row.title,"Undo",()=>{})}
            onPick={(o)=>pickReply(live.id,o)}
            onFold={()=>setFolded(true)} onClose={()=>{setLive(null);setFolded(false)}}
            onFull={()=>{setConvo({id:live.id,title:live.title,when:"Just now"});setLive(null);setFolded(false)}}
            onOpenThread={(id)=>{setLive(null);setFolded(false);setSpace(id)}}/>
        ):null}
        {share?<ShareSheet thingName={share} onClose={()=>setShare(null)}
          onShared={(names)=>say("Shared with "+names.join(" and "))}/>:null}
        {sheet?<Sheet title="Move to a thread" onClose={()=>setSheet(false)}
          footer={<><Button variant="secondary" block onClick={()=>setSheet(false)}>Cancel</Button><Button variant="primary" block onClick={()=>setSheet(false)}>Move</Button></>}>
          {D.spaces.slice(0,3).map((s,i)=><ARow key={s.id} selected={i===0} onClick={()=>{}} border={i<2}
            leading={s.icon}
            title={s.name} meta={s.meta}/>)}
        </Sheet>:null}
      </div>
      {(()=>{
        /* The composer never leaves the plate. Raised or not, the plate is composer
           plus tabs, which keeps the prism field one surface of one height. */
        const showComposer=!(space||person||memory||(allConvos&&!convo)||settings);
        const showTabs=!(space||person||memory||convo||allConvos||settings);
        const inFolded=live&&folded;
        const underSheet=live&&!folded;
        /* Same as iOS: the field sits behind the composer-and-tabs band, the
           veil closes at both of its edges, and a folded title row stays out
           of it. */
        const plate=(
          <div style={{position:"relative",zIndex:9,overflow:"hidden",
            background:"var(--surface-plate)",
            borderRadius:underSheet?0:"var(--radius-xl) var(--radius-xl) 0 0",
            boxShadow:underSheet?"none":"0 -6px 12px -6px rgba(0,0,0,0.22)",
            pointerEvents:notifOpen?"none":undefined}}>
            {inFolded?<FoldedHeader title={live.title} onRaise={()=>setFolded(false)}
              onClose={()=>{setLive(null);setFolded(false)}}/>:null}
            <div style={{position:"relative"}}>
            {PrismField?<PrismField variant="band" veil="graded" pulse={filed} basePath="../../assets/prism" style={{zIndex:0}}/>:null}
            <div style={{position:"relative",zIndex:2}}>
            {showComposer?<Composer value={draft} onChange={setDraft} onSubmit={submit} bare
              placeholder={convo?"Add to this conversation":live?"Add to this":undefined}/>:null}
            {showTabs?<ANav
              value={tab} onChange={(v)=>{setTab(v);setSpace(null);setPerson(null);setMemory(null);setConvo(null);setAllConvos(false);setLive(null);setFolded(false);setSettings(false);setSettingsPage(null);setShare(null);setInvite(false)}} items={[
              {value:"home",label:tod.label,icon:tod.icon},
              {value:"spaces",label:"My threads",icon:"lasso"},
              {value:"thoughts",label:"Memories",icon:"cloudy"}]}/>:null}
            </div>
            </div>
          </div>
        );
        return plate;
      })()}
      {notifOpen?<NotificationSheet items={notifs} unread={unread} closing={notifClosing} onClose={closeNotifications}
        onOpen={(n)=>closeNotifications(()=>{const id={"Lisbon trip":"lisbon","Bookshelf build":"shelf","Flat admin":"home"}[n.thread];if(id)setSpace(id)})}/>:null}
      </>)}
    </Phone>
    </>
  );
}

Object.assign(window,{App});
