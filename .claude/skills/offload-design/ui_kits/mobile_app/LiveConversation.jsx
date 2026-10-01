const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, IconButton, Chip, AnswerResult, QuickReplies, TurnFooter } = OFFLOAD_DS;

/* Kept for the screens that still draw a ref inline. The turn footer owns this contract
   now, including the source kind: outline, because moss means offload did it and a citation
   is the opposite claim. */
const LIVE_REF_TONE={thread:"accent",time:"attention",money:"warning",source:"outline"};
const LIVE_REF_ICON={thread:"lasso",time:"clock",money:null,source:"link"};

function SentVoice({secs,bars}){
  const wave=bars&&bars.length?bars:Array.from({length:26},(_,i)=>0.25+0.6*Math.abs(Math.sin(i*1.7)));
  const mmss=Math.floor(secs/60)+":"+String(Math.round(secs%60)).padStart(2,"0");
  return (
    <span style={{display:"flex",alignItems:"center",gap:"var(--space-3)",minWidth:150}}>
      <Icon name="mic" size={14} style={{color:"var(--text-secondary)",flex:"0 0 auto"}}/>
      <span style={{flex:1,display:"flex",alignItems:"center",gap:2,height:20,overflow:"hidden"}}>
        {wave.map((h,i)=><span key={i} style={{width:3,flex:"0 0 auto",borderRadius:2,height:Math.max(3,Math.round(h*20)),
          background:"var(--ink-950)",opacity:0.3+0.6*(i/wave.length)}}/>)}
      </span>
      <span style={{flex:"0 0 auto",font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",
        fontSize:"var(--size-caption)",color:"var(--text-secondary)"}}>{mmss}</span>
    </span>
  );
}

/* The one mark still drawn on the bubble, on the screens that predate the turn footer.
   Seen has no mark anywhere. */
function StatusChip({state}){
  /* Seen draws nothing. The writing indicator says the same thing at the same moment a few
     lines below, so the eyes were two marks for one state, and they were the product's last
     emoji. Done is the only mark left here. */
  if(state!=="done")return null;
  return (
    <span aria-label="Done" style={{position:"absolute",left:-15,bottom:-16,
      display:"inline-flex",alignItems:"center",gap:4,padding:"0 10px 0 8px",
      height:24,borderRadius:"var(--radius-pill)",background:"var(--moss-600)",
      border:"1px solid var(--moss-600)",
      color:"var(--paper)",boxShadow:"var(--shadow-1)"}}>
      <Icon name="check" size={11}/><span style={{font:"var(--weight-medium) 11px/1 var(--font-core)"}}>Done</span>
    </span>
  );
}

/* 4: a photo sent with a message is shown, not named. */
function SentPhoto({name}){
  return (
    <span style={{display:"flex",alignItems:"center",gap:"var(--space-3)",marginBottom:"var(--space-3)",
      padding:"var(--space-2) var(--space-3)",borderRadius:"var(--radius-sm)",background:"var(--surface-raised)",
      marginTop:"var(--space-3)",
      border:"1px solid var(--blue-100)"}}>
      <span style={{width:34,height:34,flex:"0 0 auto",borderRadius:"var(--radius-xs)",background:"var(--ink-100)",
        display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-tertiary)"}}><Icon name="image" size={15}/></span>
      <span style={{minWidth:0,flex:1,fontSize:"var(--size-caption)",color:"var(--text-secondary)",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
    </span>
  );
}

function Turns({turns,writing,onOpenThread,onTick,onPick}){
  const endRef=React.useRef(null);
  /* Ticking and picking are drawn here and reported upward: the row's own done state is
     local to the kit, the toast and the turn it writes belong to the app. */
  const [ticked,setTicked]=React.useState({});
  const [answered,setAnswered]=React.useState({});
  React.useEffect(()=>{const el=endRef.current&&endRef.current.parentElement;if(el)el.scrollTop=el.scrollHeight;},[turns.length,writing]);
  return (
    <div style={{flex:1,minHeight:0,overflowY:"auto",display:"flex",flexDirection:"column",gap:"var(--space-4)",
      padding:"0 var(--gutter-screen) var(--space-4)"}}>
      {turns.map((t,i)=>t.from==="you"?(
        <React.Fragment key={i}>
          <div style={{alignSelf:"flex-end",maxWidth:"84%",padding:"var(--space-3) var(--space-5)",
            borderRadius:"var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)",
            background:"var(--blue-50)",border:"1px solid var(--blue-100)",color:"var(--ink-950)",
            font:"var(--weight-regular) 15px/1.45 var(--font-core)"}}>
            {t.voice?<SentVoice secs={t.voice.secs} bars={t.voice.bars}/>:t.text}
            {(t.photos||[]).map((f,j)=><SentPhoto key={j} name={f}/>)}</div>
          {/* The mark used to hang off this bubble's corner, 10px up and 6px into it, which
              is why it could never grow a chip: a row starting there runs back under the
              bubble it is tucked inside. It is in the footer now, on offload's side. */}
          {TurnFooter?<TurnFooter state={t.status} refs={t.refs} sources={t.sources} onOpenRef={(r)=>onOpenThread(r.id)}/>:null}
        </React.Fragment>
      ):(
        <React.Fragment key={i}>
        <div style={{alignSelf:"flex-start",maxWidth:"92%",padding:"var(--space-4) var(--space-5)",
          borderRadius:"var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",background:"var(--ink-50)"}}>
          <div style={{font:"var(--text-quiet-role)",fontSize:16,lineHeight:1.5}}>{t.text}</div>
          {/* A question offload asked, answered with a tap. Inside the bubble, like 012's
              calendar control: it acts on the sentence directly above it. One open question
              at a time, so picking closes it. */}
          {AnswerResult&&t.options&&t.options.length&&!answered[i]?(
            <QuickReplies options={t.options} note={t.note} label={t.text}
              onPick={(o)=>{setAnswered(a=>({...a,[i]:true}));onPick&&onPick(o)}}/>
          ):null}
        </div>
        {/* One card per read, below the bubble and never inside it: a row's fill bleeds to
            the padded edge, and inside a turn the two cancel and it runs out under the
            corner. Five rows before Show more on the phones. */}
        {(AnswerResult?(t.results||[]):[]).map((r,j)=>(
          <AnswerResult key={j} thread={r.thread} count={r.count} shown={5}
            truncated={r.truncated} threadTotal={r.threadTotal} style={{alignSelf:"stretch"}}
            rows={(r.rows||[]).map(x=>({...x,done:ticked[x.id]!==undefined?ticked[x.id]:x.done}))}
            onToggle={r.tickable===false?undefined:(row)=>{const next=!(ticked[row.id]!==undefined?ticked[row.id]:row.done);
              setTicked(v=>({...v,[row.id]:next}));onTick&&onTick(row,next)}}
            onOpenThread={()=>onOpenThread&&onOpenThread(r.thread.id)}/>
        ))}
        {/* One footer per turn, under everything else it drew. An answering turn files
            nothing and did nothing, so it passes no state and no refs and the row is
            whatever it read. */}
        {TurnFooter?<TurnFooter state={t.results?null:t.status}
          refs={t.results?[]:t.refs} sources={t.sources}
          onOpenRef={(r)=>onOpenThread(r.id)}/>:null}
        </React.Fragment>
      ))}
      {writing?(
        <div aria-label="offload is writing" style={{alignSelf:"flex-start",display:"flex",alignItems:"center",gap:5,
          padding:"var(--space-4) var(--space-5)",borderRadius:"var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",background:"var(--ink-50)"}}>
          {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:"var(--radius-pill)",background:"var(--ink-300)",
            animation:"offload-pulse 1.2s var(--ease-in-out) infinite",animationDelay:(i*0.16)+"s"}}/>)}
        </div>
      ):null}
      <div ref={endRef}/>
    </div>
  );
}

/* Folded: the conversation shrinks to a grabber and a title row that live at the top
   of the footer plate, separated by a hairline rather than by a different colour. */
function FoldedHeader({title,onRaise,onClose}){
  return (
    <div style={{boxShadow:"inset 0 -1px 0 var(--border-hairline)"}}>
      <button type="button" aria-label="Raise conversation" onClick={onRaise}
        style={{width:"100%",display:"flex",justifyContent:"center",padding:"7px 0 4px",border:"none",background:"none",cursor:"grab"}}>
        <span style={{width:34,height:4,borderRadius:2,background:"var(--ink-200)"}}/>
      </button>
      <div onClick={onRaise} style={{display:"flex",alignItems:"center",gap:"var(--space-3)",cursor:"pointer",
        padding:"2px var(--gutter-screen) var(--space-4)"}}>
        <span style={{flex:1,minWidth:0,font:"var(--weight-regular) 13.5px/1.35 var(--font-core)",
          color:"var(--text-secondary)",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>
        <button type="button" aria-label="Close" onClick={(e)=>{e.stopPropagation();onClose()}}
          style={{width:22,height:22,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
            border:"none",borderRadius:"var(--radius-pill)",cursor:"pointer",
            background:"var(--surface-fill)",color:"var(--text-secondary)"}}><Icon name="x" size={11}/></button>
      </div>
    </div>
  );
}

/* Two ways the same conversation can sit over a page.
   sheet: a layer over the page, dimmed behind, dragged from a grabber.
   grow:  the composer itself extending upward, attached to where you typed. */
function LiveConversation({variant,live,turns,writing,onFold,onFull,onClose,onOpenThread,onTick,onPick,children}){
  const isSheet=variant==="sheet";
  return (
    <>
      <style>{"@keyframes offload-pulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes offload-rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}"}</style>
      {/* bottom:0 already lands on the plate's top edge: this sheet's containing
          block is the content column above the plate, not the whole screen. */}
      {isSheet?<div onClick={onClose} style={{position:"absolute",inset:0,zIndex:8,background:"rgba(11,11,11,0.45)"}}/>:null}
      <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:9,top:isSheet?54:undefined,height:isSheet?undefined:"58%",
        display:"flex",flexDirection:"column",background:"var(--surface-plate)",
        borderRadius:"var(--radius-xl) var(--radius-xl) 0 0",
        boxShadow:"var(--shadow-sheet)",
        animation:"offload-rise var(--duration-slow) var(--ease-out)"}}>
        {isSheet?(
          /* 30 September, as built: no header and no fold. The grabber is the Close button
             to a screen reader; a drag past a quarter of the travel or a flick closes. */
          <button type="button" aria-label="Close" onClick={onClose}
            style={{height:22,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
              border:"none",background:"none",cursor:"grab",padding:0,marginBottom:"var(--space-3)"}}>
            <span style={{width:36,height:4,borderRadius:2,background:"var(--border-strong)"}}/>
          </button>
        ):(
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",flex:"0 0 auto",
          padding:"0 var(--gutter-screen) var(--space-5)"}}>
          <span style={{flex:1,minWidth:0,font:"var(--weight-medium) 16px/1.3 var(--font-core)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{live.title}</span>
          <button type="button" aria-label="Close" onClick={onClose}
            style={{width:24,height:24,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
              border:"none",borderRadius:"var(--radius-pill)",cursor:"pointer",
              background:"var(--surface-fill)",color:"var(--text-secondary)"}}><Icon name="x" size={12}/></button>
        </div>)}
        <Turns turns={turns} writing={writing} onOpenThread={onOpenThread} onTick={onTick} onPick={onPick}/>
        {children}
      </div>
    </>
  );
}

Object.assign(window,{LiveConversation,FoldedHeader,Turns,SentVoice,SentPhoto,StatusChip});
