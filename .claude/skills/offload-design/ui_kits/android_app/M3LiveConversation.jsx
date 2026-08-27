const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, Chip } = OFFLOAD_DS;

const LIVE_REF_TONE={thread:"accent",time:"attention",money:"warning"};
const LIVE_REF_ICON={thread:"lasso",time:"clock",money:null};

function SentVoice({secs,bars}){
  const wave=bars&&bars.length?bars:Array.from({length:26},(_,i)=>0.25+0.6*Math.abs(Math.sin(i*1.7)));
  const mmss=Math.floor(secs/60)+":"+String(Math.round(secs%60)).padStart(2,"0");
  return (
    <span style={{display:"flex",alignItems:"center",gap:"var(--space-3)",minWidth:150}}>
      <Icon name="mic" size={14} style={{color:"var(--a-on-var)",flex:"0 0 auto"}}/>
      <span style={{flex:1,display:"flex",alignItems:"center",gap:2,height:20,overflow:"hidden"}}>
        {wave.map((h,i)=><span key={i} style={{width:3,flex:"0 0 auto",borderRadius:2,height:Math.max(3,Math.round(h*20)),
          background:"var(--a-on)",opacity:0.3+0.6*(i/wave.length)}}/>)}
      </span>
      <span style={{flex:"0 0 auto",font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",
        fontSize:"var(--size-caption)",color:"var(--a-on-var)"}}>{mmss}</span>
    </span>
  );
}

/* The mark hangs off the bubble's bottom-left in its own chip, so it never crowds
   the text and reads the same on one line or five. */
function StatusChip({state}){
  if(state!=="seen"&&state!=="done")return null;
  return (
    <span aria-label={state==="seen"?"Seen":"Done"} style={{position:"absolute",left:-15,bottom:-16,
      display:"inline-flex",alignItems:"center",gap:4,padding:state==="done"?"0 10px 0 8px":"0 6px",
      height:state==="done"?24:26,borderRadius:"var(--radius-pill)",background:state==="done"?"var(--moss-600)":"var(--paper)",
      border:"1px solid "+(state==="done"?"var(--moss-600)":"var(--a-outline)"),
      color:state==="done"?"var(--paper)":"inherit",boxShadow:"var(--shadow-1)"}}>
      {state==="seen"
        ?<span role="img" aria-hidden="true" style={{fontSize:17,lineHeight:1}}>{"\uD83D\uDC40"}</span>
        :<><Icon name="check" size={11}/><span style={{font:"var(--weight-medium) 11px/1 var(--font-core)"}}>Done</span></>}
    </span>
  );
}

/* 4: a photo sent with a message is shown, not named. */
function SentPhoto({name}){
  return (
    <span style={{display:"flex",alignItems:"center",gap:"var(--space-3)",marginBottom:"var(--space-3)",
      padding:"var(--space-2) var(--space-3)",borderRadius:"var(--radius-sm)",background:"var(--a-c)",
      marginTop:"var(--space-3)",
      border:"1px solid var(--blue-100)"}}>
      <span style={{width:34,height:34,flex:"0 0 auto",borderRadius:"var(--radius-xs)",background:"var(--a-c-high)",
        display:"flex",alignItems:"center",justifyContent:"center",color:"var(--a-on-var)"}}><Icon name="image" size={15}/></span>
      <span style={{minWidth:0,flex:1,fontSize:"var(--size-caption)",color:"var(--a-on-var)",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
    </span>
  );
}

function Turns({turns,writing,onOpenThread}){
  const endRef=React.useRef(null);
  React.useEffect(()=>{const el=endRef.current&&endRef.current.parentElement;if(el)el.scrollTop=el.scrollHeight;},[turns.length,writing]);
  return (
    <div style={{flex:1,minHeight:0,overflowY:"auto",display:"flex",flexDirection:"column",gap:"var(--space-4)",
      padding:"0 var(--gutter-screen) var(--space-4)"}}>
      {turns.map((t,i)=>t.from==="you"?(
        <React.Fragment key={i}>
          <div style={{alignSelf:"flex-end",maxWidth:"84%",position:"relative",padding:"var(--space-3) var(--space-5)",
            marginBottom:t.status?"var(--space-4)":0,
            borderRadius:"var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)",
            background:"var(--blue-50)",border:"1px solid var(--blue-100)",color:"var(--a-on)",
            font:"var(--weight-regular) 15px/1.45 var(--font-core)"}}>
            {t.voice?<SentVoice secs={t.voice.secs} bars={t.voice.bars}/>:t.text}
            {(t.photos||[]).map((f,j)=><SentPhoto key={j} name={f}/>)}
            <StatusChip state={t.status}/></div>
        </React.Fragment>
      ):(
        <div key={i} style={{alignSelf:"flex-start",maxWidth:"92%",padding:"var(--space-4) var(--space-5)",
          borderRadius:"var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",background:"var(--a-c)"}}>
          <div style={{font:"var(--text-quiet-role)",fontSize:16,lineHeight:1.5}}>{t.text}</div>
          {t.refs&&t.refs.length?(
            <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-2)",marginTop:"var(--space-3)"}}>
              {t.refs.map((r,j)=>{const k=r.kind||"thread";
                return <Chip key={j} tone={LIVE_REF_TONE[k]} icon={LIVE_REF_ICON[k]}
                  onClick={k==="thread"?()=>onOpenThread(r.id):undefined}>{r.name}</Chip>;})}
            </div>
          ):null}
        </div>
      ))}
      {writing?(
        <div aria-label="offload is writing" style={{alignSelf:"flex-start",display:"flex",alignItems:"center",gap:5,
          padding:"var(--space-4) var(--space-5)",borderRadius:"var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",background:"var(--a-c)"}}>
          {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:"var(--radius-pill)",background:"var(--a-on-var)",
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
    <div style={{boxShadow:"inset 0 -1px 0 var(--a-outline)"}}>
      <button type="button" aria-label="Raise conversation" onClick={onRaise}
        style={{width:"100%",display:"flex",justifyContent:"center",padding:"7px 0 4px",border:"none",background:"none",cursor:"grab"}}>
        <span style={{width:34,height:4,borderRadius:2,background:"var(--a-c-high)"}}/>
      </button>
      <div onClick={onRaise} style={{display:"flex",alignItems:"center",gap:"var(--space-3)",cursor:"pointer",
        padding:"2px var(--gutter-screen) var(--space-4)"}}>
        <span style={{flex:1,minWidth:0,font:"var(--weight-regular) 13.5px/1.35 var(--font-core)",
          color:"var(--a-on-var)",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>
        <button type="button" aria-label="Close" onClick={(e)=>{e.stopPropagation();onClose()}}
          style={{width:22,height:22,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
            border:"none",borderRadius:"var(--radius-pill)",cursor:"pointer",
            background:"var(--a-c-high)",color:"var(--a-on-var)"}}><Icon name="x" size={11}/></button>
      </div>
    </div>
  );
}

/* Two ways the same conversation can sit over a page.
   sheet: a layer over the page, dimmed behind, dragged from a grabber.
   grow:  the composer itself extending upward, attached to where you typed. */
function LiveConversation({variant,live,turns,writing,onFold,onFull,onClose,onOpenThread,children}){
  const isSheet=variant==="sheet";
  return (
    <>
      <style>{"@keyframes offload-pulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes offload-rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}"}</style>
      <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:9,height:isSheet?"65%":"58%",
        display:"flex",flexDirection:"column",background:"var(--surface-raised)",
        borderRadius:"var(--radius-xl) var(--radius-xl) 0 0",
        boxShadow:"0 -6px 12px -6px rgba(0,0,0,0.22)",
        animation:"offload-rise var(--duration-slow) var(--ease-out)"}}>
        {isSheet?(
          <button type="button" aria-label="Fold down" onClick={onFold}
            style={{height:22,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
              border:"none",background:"none",cursor:"grab",padding:0}}>
            <span style={{width:34,height:4,borderRadius:2,background:"var(--a-c-high)"}}/>
          </button>
        ):null}
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",flex:"0 0 auto",
          padding:"0 var(--gutter-screen) var(--space-5)"}}>
          <span style={{flex:1,minWidth:0,font:"var(--weight-medium) 16px/1.3 var(--font-core)",
            letterSpacing:"-0.008em",color:"var(--a-on)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{live.title}</span>
          <button type="button" aria-label="Close" onClick={onClose}
            style={{width:24,height:24,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
              border:"none",borderRadius:"var(--radius-pill)",cursor:"pointer",
              background:"var(--a-c-high)",color:"var(--a-on-var)"}}><Icon name="x" size={12}/></button>
        </div>
        <Turns turns={turns} writing={writing} onOpenThread={onOpenThread}/>
        {children}
      </div>
    </>
  );
}

Object.assign(window,{LiveConversation,FoldedHeader,Turns,SentVoice,SentPhoto,StatusChip});
