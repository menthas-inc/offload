const OFFLOAD_TP=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon:TPIcon, LabelMark:TPLabel } = OFFLOAD_TP;

/* Today, launch, Activity and the Mail step, as built and decided 1 October 2026
   (readme: Today; The launch screen; Dates and notifications; 026). Shared by both kits:
   `and` switches the few Android differences, as the kits' README tabulates. */
const TP_DATA={
  needs:[
    {k:"danger",icon:"cloud-off",kind:"Calendar",title:"Google Calendar stopped syncing",why:"Events after Sunday are missing from your day.",acts:["Reconnect","Not now"]},
    {k:"at",icon:"users",kind:"Waiting 2 days",title:"Ana Duarte wants to connect",why:["Shares ",{thread:"Europe, October"}," with you"],acts:["Accept","Not now"]},
    {k:"at",icon:"message-circle",kind:"offload asked",title:"Sintra train: Saturday or Sunday?",why:[{thread:"Europe, October"}],acts:["Saturday","Sunday"]},
    {k:"tip",icon:"mail",kind:"Tip",title:"Forward emails to offload",why:"Send them to over@to.offload.club from jo@hey.com.",acts:["Copy address","Got it"]}],
  days:[
    {name:"Today",next:["Call with Ana"," in 1h 30m"],
     ev:[{t:"9:00",e:"9:30",title:"Standup",s:"Google, Work",past:true},{t:"12:00",e:"12:30",title:"Call with Ana",s:"Google, Personal",next:true},{t:"14:00",e:"15:00",title:"Viewing, Rua da Rosa flat",thread:"Flat"},{t:"19:30",e:"22:00",title:"Dinner, Sam",s:"Google, Personal"}],
     todo:[{title:"Renew the bike insurance",thread:"Flat",late:"Due 5 days ago"},{title:"Split the flight cost, €214 each",thread:"Europe, October",late:"Due 2 days ago"},{title:"Call the letting agent",thread:"Flat",at:"11:00"},{title:"Send the slides to Priya",thread:"Work",at:"16:00"},{title:"Buy Viva Viagem cards",thread:"Europe, October",label:[1,"Lisbon"]},{title:"Pay the council tax",thread:"Flat"}],
     spare:[{title:"Return the drill to Tom",thread:"Flat"},{title:"Fix the bathroom tap",thread:"Flat"},{title:"Draft the offsite agenda",thread:"Work"}]},
    {name:"Tomorrow",sub:"Wednesday 1 October",next:["Dentist"," at 10:00"],
     ev:[{t:"10:00",e:"10:45",title:"Dentist",s:"Google, Personal",next:true},{t:"13:00",e:"14:00",title:"Lunch with Maya",s:"Google, Personal"}],
     todo:[{title:"Musée d'Orsay tickets",thread:"Europe, October",label:[2,"Paris"]},{title:"Return the drill to Tom",thread:"Flat"}]},
    {name:"Thursday",sub:"2 October",next:["Viewing, Rua da Rosa flat"," at 14:00"],
     ev:[{t:"14:00",e:"15:00",title:"Viewing, Rua da Rosa flat",thread:"Flat",next:true}],
     todo:[{title:"Check in online, TP 1353",thread:"Europe, October",at:"18:00"}]}],
  activity:{Today:[
    {sent:true,icon:"users",title:"Ana added two to Lisbon trip",time:"9:12"},
    {sent:false,icon:"mail",title:"Dentist, Tuesday 15:00, in Health",body:"From an email, “Your appointment is confirmed”.",time:"8:02",undo:true},
    {sent:false,icon:"tag",title:"Sorted Europe, October into Lisbon, Paris and Istanbul",body:"Seven things labelled.",time:"3:10",undo:true}],
   Yesterday:[{sent:true,icon:"calendar",title:"Due today: Call the clinic back",time:"8:00"},{sent:false,icon:"bell",title:"A reminder wasn't sent",body:"Notifications are off for offload.",time:"18:00",mark:"Not sent"}]}
};
const TP_TONE={danger:"var(--text-danger)",at:"var(--blue-700)",tip:"var(--moss-700)"};

function ThreadPill({name,onOpen}){
  return <span role="button" tabIndex={0} onClick={e=>{e.stopPropagation();onOpen&&onOpen(name)}}
    style={{display:"inline-flex",alignItems:"center",gap:4,height:24,padding:"0 9px 0 7px",borderRadius:"var(--radius-pill)",
      background:"var(--surface-accent-soft)",color:"var(--text-accent)",font:"var(--weight-medium) 12.5px/1 var(--font-core)",
      whiteSpace:"nowrap",cursor:"pointer",verticalAlign:"middle"}}><TPIcon name="lasso" size={13}/>{name}</span>;
}
const tpBits=(v,onThread)=>Array.isArray(v)?v.map((b,i)=>typeof b==="string"?<span key={i}>{b}</span>:<ThreadPill key={i} name={b.thread} onOpen={onThread}/>):v;

function NeedsYou({items,and,onThread}){
  const [i,setI]=React.useState(0);
  if(i>=items.length)return null;
  const c=items[i];const r=and?16:18;
  const card={borderRadius:r,background:"var(--surface-raised)",boxShadow:"inset 0 0 0 1px var(--border-hairline),var(--shadow-2)"};
  const pill={height:34,display:"inline-flex",alignItems:"center",padding:"0 14px",borderRadius:"var(--radius-pill)",border:"1px solid var(--border-hairline)",
    font:"var(--weight-medium) 13px/1 var(--font-core)",boxSizing:"border-box",cursor:"pointer",background:"transparent",color:"var(--text-primary)"};
  const left=items.length-i;
  return (
    <div style={{position:"relative",paddingBottom:left>1?10:0}}>
      {left>2?<div style={{...card,position:"absolute",left:20,right:20,bottom:0,height:60,opacity:.7}}/>:null}
      {left>1?<div style={{...card,position:"absolute",left:10,right:10,bottom:5,height:60}}/>:null}
      <div style={{...card,position:"relative",padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,font:"var(--weight-medium) 12px/1 var(--font-core)",color:TP_TONE[c.k]}}>
          <TPIcon name={c.icon} size={14}/>{c.kind}
          <span style={{marginLeft:"auto",color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums"}}>{i+1} of {items.length}</span></div>
        <div style={{font:"var(--weight-semibold) 17px/22px var(--font-core)",margin:"8px 0 2px"}}>{c.title}</div>
        <div style={{font:"var(--weight-regular) 13.5px/19px var(--font-core)",color:"var(--text-secondary)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tpBits(c.why,onThread)}</div>
        <div style={{display:"flex",gap:6,marginTop:12,alignItems:"center"}}>
          {c.acts.map((a,j)=><button key={a} type="button" onClick={()=>setI(i+1)} style={j===0?{...pill,border:"none",background:and?"var(--a-on, var(--surface-inverse))":"var(--surface-inverse)",color:"var(--text-inverse)"}:pill}>{a}</button>)}
          <button type="button" aria-label="Tomorrow" onClick={()=>setI(i+1)} style={{...pill,marginLeft:"auto",width:34,padding:0,justifyContent:"center",color:"var(--icon-on-well)"}}><TPIcon name="clock" size={14}/></button>
        </div>
      </div>
    </div>);
}

function DayStepper({day,onPrev,onNext,first}){
  const b={width:40,height:40,borderRadius:"var(--radius-pill)",border:"none",background:"var(--surface-fill)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text-primary)"};
  return <div style={{display:"flex",alignItems:"center",gap:4}}>
    <button type="button" aria-label="Previous day" onClick={onPrev} disabled={first} style={{...b,opacity:first?.35:1}}><TPIcon name="chevron-left" size={18}/></button>
    <div style={{flex:1,textAlign:"center"}}><div style={{font:"var(--weight-semibold) 20px/1.2 var(--font-core)",letterSpacing:"-.01em"}}>{day.name}</div>
      {day.sub?<div style={{font:"var(--weight-regular) 13px/1.3 var(--font-core)",color:"var(--text-secondary)",marginTop:2}}>{day.sub}</div>:null}</div>
    <button type="button" aria-label="Next day" onClick={onNext} style={b}><TPIcon name="chevron-right" size={18}/></button></div>;
}

function TPHead({children,n,hint}){
  return <div style={{display:"flex",alignItems:"baseline",gap:8,paddingBottom:6,font:"var(--weight-semibold) 15px/1.2 var(--font-core)"}}>{children}
    {n!=null?<em style={{fontStyle:"normal",fontWeight:400,fontSize:13,color:"var(--text-tertiary)"}}>{n}</em>:null}
    {hint?<span style={{marginLeft:"auto",font:"var(--weight-regular) 12.5px/1 var(--font-core)",color:"var(--text-tertiary)"}}>{hint}</span>:null}</div>;
}
function TodoRow({it,last,onThread,add,onAdd,onOpen}){
  const chip=(bg,fg,icon,t)=><span style={{display:"inline-flex",alignItems:"center",gap:4,height:24,padding:"0 8px",borderRadius:"var(--radius-xs)",background:bg,color:fg,font:"var(--weight-medium) 12px/1 var(--font-core)"}}><TPIcon name={icon} size={12}/>{t}</span>;
  return <div role="button" tabIndex={0} onClick={onOpen} style={{cursor:"pointer",display:"grid",gridTemplateColumns:add?"22px minmax(0,1fr) auto":"22px minmax(0,1fr)",columnGap:8,padding:"10px 14px",boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
    <span style={{height:20,display:"flex",alignItems:"center",justifyContent:"center"}}><i style={{width:15,height:15,borderRadius:4,border:"1.5px solid var(--icon-on-well)",boxSizing:"border-box"}}/></span>
    <div><b style={{display:"block",font:"var(--weight-medium) 15px/20px var(--font-core)"}}>{it.title}</b>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginTop:3,font:"var(--weight-regular) 13px/18px var(--font-core)",color:"var(--text-secondary)"}}>
        {it.late?chip("var(--clay-100)","var(--text-danger)","calendar",it.late):null}
        {it.at?chip("var(--surface-raised)","var(--text-secondary)","clock",it.at):null}
        {it.thread?<ThreadPill name={it.thread} onOpen={onThread}/>:null}
        {it.label&&TPLabel?<TPLabel color={it.label[0]}>{it.label[1]}</TPLabel>:null}</div></div>
    {add?<button type="button" onClick={e=>{e.stopPropagation();onAdd()}} style={{alignSelf:"center",height:28,display:"inline-flex",alignItems:"center",gap:3,padding:"0 10px",borderRadius:"var(--radius-pill)",border:"none",boxShadow:"inset 0 0 0 1px var(--border-strong)",background:"var(--surface-raised)",font:"var(--weight-medium) 12.5px/1 var(--font-core)",cursor:"pointer"}}><TPIcon name="plus" size={13}/>Today</button>:null}
  </div>;
}

function TodayBody({and,onThread,quiet}){
  const [d,setD]=React.useState(0);
  const [taken,setTaken]=React.useState([]);
  const [editing,setEditing]=React.useState(null);
  const day=TP_DATA.days[d];
  const cardBg=and?"var(--a-c-low, var(--surface-fill))":"var(--surface-fill)";const r=and?16:"var(--radius-lg)";
  const todo=day.todo.concat(d===0?TP_DATA.days[0].spare.filter(s=>taken.includes(s.title)):[]);
  const spare=d===0?day.spare.filter(s=>!taken.includes(s.title)):[];
  return <div style={{display:"flex",flexDirection:"column",gap:16,padding:"var(--space-3) var(--gutter-screen) var(--space-9)"}}>
    {quiet?null:<NeedsYou items={TP_DATA.needs} and={and} onThread={onThread}/>}
    <DayStepper day={day} first={d===0} onPrev={()=>setD(Math.max(0,d-1))} onNext={()=>setD(Math.min(TP_DATA.days.length-1,d+1))}/>
    {day.ev.length?<>
      <div style={{font:"var(--weight-semibold) 20px/1.25 var(--font-core)",letterSpacing:"-.01em"}}>{day.next[0]}<span style={{color:"var(--blue-600)"}}>{day.next[1]}</span></div>
      <div><TPHead n={day.ev.length}>Where you will be</TPHead>
        <div style={{display:"flex",gap:8,overflowX:"auto",margin:"0 calc(var(--gutter-screen) * -1)",padding:"0 var(--gutter-screen) 4px",scrollbarWidth:"none"}}>
          {day.ev.map(e=><div key={e.title} style={{flex:"0 0 auto",width:128,padding:"10px 12px",borderRadius:and?16:14,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:3,
            opacity:e.past?.5:1,background:e.next?"var(--surface-raised)":cardBg,boxShadow:e.next?"inset 0 0 0 1px var(--border-hairline),var(--shadow-2)":"none"}}>
            <i style={{fontStyle:"normal",font:"var(--weight-semibold) 12px/1 var(--font-core)",color:"var(--text-secondary)",fontVariantNumeric:"tabular-nums"}}>{e.t} to {e.e}</i>
            <b style={{font:"var(--weight-medium) 14px/1.3 var(--font-core)"}}>{e.title}</b>
            {e.thread?<span><ThreadPill name={e.thread} onOpen={onThread}/></span>:<span style={{font:"var(--weight-regular) 12px/1.3 var(--font-core)",color:"var(--text-tertiary)"}}>{e.s}</span>}</div>)}</div></div></>:null}
    {todo.length?<div><TPHead n={todo.length}>To do</TPHead><div style={{borderRadius:r,background:cardBg,overflow:"hidden"}}>{todo.map((it,i)=><TodoRow key={it.title} it={it} last={i===todo.length-1} onThread={onThread} onOpen={()=>setEditing(it)}/>)}</div></div>:null}
    {spare.length?<div><TPHead hint="picked by offload">If you have time</TPHead><div style={{borderRadius:r,background:cardBg,overflow:"hidden"}}>{spare.map((it,i)=><TodoRow key={it.title} it={it} add last={i===spare.length-1} onThread={onThread} onAdd={()=>setTaken(t=>t.concat(it.title))}/>)}</div></div>:null}
    {editing?<RowEditSheet it={editing} and={and} onClose={()=>setEditing(null)}/>:null}
  </div>;
}

function CustomizeSheet({and,onClose}){
  const [rows,setRows]=React.useState([["Needs you","Requests, questions, account issues, tips",true],["Your day","Events and to-dos, a day at a time",true],["What moved","Shared threads, since you last looked",false]]);
  const sw=(on,i)=><button type="button" role="switch" aria-checked={on} onClick={()=>setRows(rs=>rs.map((r,j)=>j===i?[r[0],r[1],!r[2]]:r))}
    style={{width:and?52:44,height:and?32:26,borderRadius:99,border:"none",position:"relative",flex:"0 0 auto",cursor:"pointer",background:on?"var(--moss-600)":(and?"transparent":"var(--ink-200)"),boxShadow:!on&&and?"inset 0 0 0 2px var(--a-on-var, var(--text-secondary))":"none"}}>
    <i style={{position:"absolute",top:and?(on?4:8):3,[on?"right":"left"]:and?(on?4:8):3,width:and?(on?24:16):20,height:and?(on?24:16):20,borderRadius:99,background:on||!and?"#fff":"var(--a-on-var, var(--text-secondary))"}}/></button>;
  return <><div onClick={onClose} style={{position:"absolute",inset:0,background:"var(--surface-scrim)",zIndex:40}}/>
    <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:41,background:and?"var(--a-c-low, var(--surface-raised))":"var(--surface-raised)",borderRadius:and?"28px 28px 0 0":"20px 20px 0 0",padding:"8px var(--gutter-screen) 36px",boxShadow:"var(--shadow-sheet)"}}>
      <div style={{width:and?32:36,height:4,borderRadius:99,background:"var(--border-strong)",margin:"0 auto 14px"}}/>
      <div style={{font:"var(--text-title-2)"}}>Customize Today</div>
      <div style={{font:"var(--text-body-sm-role)",color:"var(--text-secondary)",margin:"4px 0 12px"}}>Drag to reorder. Switch off to hide.</div>
      {rows.map(([n,e,on],i)=><div key={n} style={{minHeight:56,display:"flex",alignItems:"center",gap:12,boxShadow:"inset 0 -1px 0 var(--border-hairline)"}}>
        <span style={{color:"var(--icon-on-well)",display:"flex"}}><TPIcon name="grip-vertical" size={17}/></span>
        <span style={{flex:1}}><span style={{font:"var(--text-body-role)"}}>{n}</span><em style={{display:"block",fontStyle:"normal",font:"var(--weight-regular) 13px/1.3 var(--font-core)",color:"var(--text-tertiary)"}}>{e}</em></span>{sw(on,i)}</div>)}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:14}}>
        <button type="button" onClick={onClose} style={{height:30,padding:"0 12px",borderRadius:99,border:"1px solid var(--border-hairline)",background:"transparent",font:"var(--weight-medium) 13px/1 var(--font-core)",color:"var(--text-secondary)",cursor:"pointer"}}>Reset</button>
        <button type="button" onClick={onClose} style={{height:30,padding:"0 14px",borderRadius:99,border:"none",background:"var(--surface-inverse)",color:"var(--text-inverse)",font:"var(--weight-medium) 13px/1 var(--font-core)",cursor:"pointer"}}>Done</button></div>
    </div></>;
}

/* Launch holding on a failure: the mark where the splash left it, measured from the
   screen's centre, and the failure in the spinner's place. Never danger red. */
function LaunchHold({kind,and,onRetry}){
  const off=kind==="offline";const size=and?192:216;
  return <div style={{position:"absolute",inset:0,zIndex:80,background:"var(--surface-page)"}}>
    <span style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",color:"var(--text-primary)"}}>{OFFLOAD_TP.Logo?<OFFLOAD_TP.Logo variant="mark" size={size}/>:null}</span>
    <div style={{position:"absolute",left:24,right:24,top:"calc(50% + "+(size/2+52)+"px)",display:"flex",flexDirection:"column",alignItems:"center",gap:12,textAlign:"center"}}>
      <div><div style={{font:"var(--weight-semibold) 17px/1.3 var(--font-core)"}}>{off?"You're offline":"offload isn't answering"}</div>
        <div style={{font:"var(--weight-regular) 14px/1.45 var(--font-core)",color:"var(--text-secondary)",marginTop:4}}>{off?"offload picks up when you're back.":"It's on our side. Trying again."}</div></div>
      <button type="button" onClick={onRetry} style={{height:36,padding:"0 16px",borderRadius:99,border:"none",boxShadow:"inset 0 0 0 1px var(--border-strong)",background:"transparent",font:"var(--weight-medium) 14px/1 var(--font-core)",color:"var(--text-primary)",cursor:"pointer"}}>Try again</button>
    </div></div>;
}

/* Activity: a pushed screen with no plate, newest first. A filled disc is what reached the
   phone; a hollow one on --border-lift is what did not. */
function ActivityScreen({and,onBack,onOpen}){
  const [undone,setUndone]=React.useState([]);
  return <div style={{position:"absolute",inset:0,zIndex:60,background:"var(--surface-page)",display:"flex",flexDirection:"column"}}>
    <div style={{height:and?64:52,flex:"0 0 auto",display:"flex",alignItems:"center",gap:8,padding:"0 var(--space-3)",marginTop:and?28:47}}>
      <button type="button" aria-label="Back" onClick={onBack} style={{width:44,height:44,border:"none",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text-primary)"}}><TPIcon name="chevron-left" size={22}/></button>
      <span style={{font:and?"var(--weight-regular) 22px/28px var(--font-core)":"var(--weight-semibold) 17px/1 var(--font-core)",flex:and?"none":1,textAlign:and?"left":"center",marginRight:and?0:44}}>Activity</span></div>
    <div style={{flex:1,overflowY:"auto",padding:"0 0 var(--space-9)"}}>
      {Object.entries(TP_DATA.activity).map(([g,rows])=><div key={g}>
        <div style={{padding:"18px var(--gutter-screen) 6px",font:"var(--weight-semibold) 13px/1 var(--font-core)",color:"var(--text-secondary)"}}>{g}</div>
        {rows.map((n,i)=><div key={i} role="button" tabIndex={0} onClick={()=>onOpen&&onOpen(n)} style={{display:"flex",gap:12,padding:"10px var(--gutter-screen)",alignItems:"flex-start",cursor:"pointer",boxShadow:"inset 0 -1px 0 var(--border-hairline)"}}>
          <span style={{width:28,height:28,flex:"0 0 auto",borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",
            background:n.sent?"var(--surface-fill)":"transparent",boxShadow:n.sent?"none":"inset 0 0 0 1.5px var(--border-lift, var(--border-strong))",color:"var(--text-secondary)"}}><TPIcon name={n.icon} size={14}/></span>
          <div style={{flex:1,minWidth:0}}><div style={{font:"var(--weight-medium) 15px/20px var(--font-core)"}}>{n.title}</div>
            {n.body?<div style={{font:"var(--weight-regular) 13px/18px var(--font-core)",color:"var(--text-secondary)",marginTop:2}}>{n.body}</div>:null}
            {n.mark?<span style={{display:"inline-flex",alignItems:"center",height:20,padding:"0 7px",marginTop:5,borderRadius:"var(--radius-xs)",background:"var(--surface-fill)",font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-secondary)"}}>{n.mark}</span>:null}</div>
          <span style={{font:"var(--weight-regular) 12.5px/20px var(--font-core)",color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums"}}>{n.time}</span>
          {n.undo?<button type="button" onClick={e=>{e.stopPropagation();setUndone(u=>u.concat(g+i))}} style={{minWidth:44,height:44,marginTop:-12,border:"none",background:"transparent",font:"var(--weight-medium) 13px/1 var(--font-core)",color:undone.includes(g+i)?"var(--text-tertiary)":"var(--text-accent)",cursor:"pointer"}}>{undone.includes(g+i)?"Undone":"Undo"}</button>:null}
        </div>)}</div>)}
    </div></div>;
}

/* First run's Mail step (026), in the calendar step's layout, after it. */
function MailStep({and,onDone}){
  return <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 var(--gutter-screen)"}}>
    <div style={{display:"flex",justifyContent:"flex-end",paddingTop:14}}><button type="button" onClick={onDone} style={{border:"none",background:"transparent",font:"var(--weight-medium) 15px/1 var(--font-core)",color:"var(--text-secondary)",cursor:"pointer",height:44}}>Not now</button></div>
    <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:18}}>
      <span style={{width:56,height:56,borderRadius:16,background:"var(--surface-fill)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-primary)"}}><TPIcon name="mail" size={26}/></span>
      <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)"}}>Forward what matters</div>
      <div><b style={{display:"block",font:"var(--weight-medium) 16px/1.4 var(--font-core)"}}>Send it an email.</b><span style={{font:"var(--text-body-role)",color:"var(--text-secondary)"}}>Forward anything to over@to.offload.club and it's filed.</span></div>
      <div><b style={{display:"block",font:"var(--weight-medium) 16px/1.4 var(--font-core)"}}>Only from your address.</b><span style={{font:"var(--text-body-role)",color:"var(--text-secondary)"}}>Mail from jo@hey.com is the only mail it accepts.</span></div>
    </div>
    <button type="button" onClick={onDone} style={{height:50,borderRadius:99,border:"none",background:"var(--surface-inverse)",color:"var(--text-inverse)",font:"var(--weight-semibold) 16px/1 var(--font-core)",margin:"0 0 40px",cursor:"pointer"}}>Add to contacts</button>
  </div>;
}

/* The one row sheet, as built 26 to 29 September: title, When, Repeats and Labels, the
   Labels panel opening in place, and the three-pill foot. A grabber on top; a drag is Cancel. */
function RowEditSheet({it,and,onClose}){
  const [panel,setPanel]=React.useState(false);
  const [on,setOn]=React.useState(it&&it.label?[it.label[0]]:[]);
  const L=[[1,"Lisbon",4],[2,"Paris",3],[3,"Istanbul",2]];
  const er=(icon,n,v,act)=><div role="button" tabIndex={0} onClick={act} style={{minHeight:48,display:"flex",alignItems:"center",gap:12,boxShadow:"inset 0 -1px 0 var(--border-hairline)",cursor:act?"pointer":"default",color:"var(--text-primary)"}}>
    <span style={{color:"var(--icon-on-well)",display:"flex"}}><TPIcon name={icon} size={18}/></span><span style={{flex:1,font:"var(--text-body-role)"}}>{n}</span>
    <span style={{font:"var(--text-body-sm-role)",color:"var(--text-secondary)"}}>{v}</span><span style={{color:"var(--text-tertiary)",display:"flex"}}><TPIcon name="chevron-right" size={16}/></span></div>;
  const pb=(t,k,f)=><button type="button" onClick={f} style={{height:30,padding:"0 12px",borderRadius:99,display:"inline-flex",alignItems:"center",gap:4,font:"var(--weight-medium) 13px/1 var(--font-core)",cursor:"pointer",
    border:k==="pri"?"none":"1px solid var(--border-hairline)",background:k==="pri"?"var(--surface-inverse)":"transparent",color:k==="pri"?"var(--text-inverse)":k==="dan"?"var(--text-danger)":"var(--text-secondary)",marginRight:k==="dan"?"auto":0}}>{k==="dan"?<TPIcon name="trash-2" size={13}/>:null}{t}</button>;
  return <><div onClick={onClose} style={{position:"absolute",inset:0,zIndex:70,background:"var(--surface-scrim)"}}/>
    <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:71,background:and?"var(--a-c-low, var(--surface-raised))":"var(--surface-raised)",borderRadius:and?"28px 28px 0 0":"20px 20px 0 0",padding:"8px var(--gutter-screen) 36px",boxShadow:"var(--shadow-sheet)"}}>
      <button type="button" aria-label="Close" onClick={onClose} style={{display:"block",width:and?32:36,height:4,borderRadius:99,border:"none",padding:0,background:"var(--border-strong)",margin:"0 auto 16px",cursor:"grab"}}/>
      {!panel?<>
        <div style={{font:"var(--weight-medium) 17px/1.35 var(--font-core)",padding:"10px 12px",borderRadius:12,background:"var(--surface-input)",marginBottom:8}}>{it.title}</div>
        {er("calendar","When",it.late||it.at||"Today",()=>{})}
        {er("clock","Repeats","",()=>{})}
        {er("tag","Labels",on.length?L.filter(l=>on.includes(l[0])).map(l=>l[1]).join(", "):"None",()=>setPanel(true))}
        <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>{pb("Delete","dan",onClose)}{pb("Cancel","",onClose)}{pb("Save","pri",onClose)}</div>
      </>:<>
        <div style={{font:"var(--text-title-2)"}}>Labels</div><div style={{font:"var(--text-body-sm-role)",color:"var(--text-secondary)",margin:"4px 0 10px"}}>{it.title}</div>
        {L.map(([n,name,c])=><div key={n} role="button" tabIndex={0} onClick={()=>setOn(o=>o.includes(n)?o.filter(x=>x!==n):o.concat(n))} style={{minHeight:48,display:"flex",alignItems:"center",gap:12,boxShadow:"inset 0 -1px 0 var(--border-hairline)",cursor:"pointer"}}>
          <i style={{width:10,height:10,borderRadius:99,background:"var(--label-"+n+")"}}/><span style={{flex:1,font:"var(--text-body-role)"}}>{name}</span><em style={{fontStyle:"normal",color:"var(--text-tertiary)",font:"var(--text-body-sm-role)"}}>{c}</em>
          <span style={{width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",background:on.includes(n)?"var(--surface-inverse)":"transparent",boxShadow:on.includes(n)?"none":"inset 0 0 0 1.5px var(--border-strong)",color:"var(--text-inverse)"}}>{on.includes(n)?<TPIcon name="check" size={14}/>:null}</span></div>)}
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>{pb("Cancel","",()=>setPanel(false))}{pb("Done","pri",()=>setPanel(false))}</div>
      </>}
    </div></>;
}

Object.assign(window,{RowEditSheet,TodayBody,CustomizeSheet,LaunchHold,ActivityScreen,MailStep,ThreadPill,TP_DATA});
