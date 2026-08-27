const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon } = OFFLOAD_DS;

/* Who caused it decides the mark: a person keeps their initials, everything else
   gets its glyph on a rounded square. */
function NotifMark({n}){
  if(n.kind==="person")return (
    <span style={{width:34,height:34,flex:"0 0 auto",borderRadius:"var(--radius-pill)",background:"var(--surface-fill)",
      color:"var(--text-secondary)",display:"flex",alignItems:"center",justifyContent:"center",
      font:"var(--weight-medium) 12px/1 var(--font-core)"}}>{n.initials}</span>
  );
  return (
    <span style={{width:34,height:34,flex:"0 0 auto",borderRadius:"var(--radius-sm)",background:"var(--surface-fill)",
      color:"var(--text-secondary)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <Icon name={n.icon} size={16}/></span>
  );
}

/* Read rows stay where they are and go quiet: the whole row drops to the secondary
   ramp rather than disappearing, so the list does not reshuffle under you. */
function NotifRow({n,last,onOpen}){
  const [h,setH]=React.useState(false);
  return (
    <div role="button" tabIndex={0} onClick={()=>onOpen(n)}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",gap:"var(--space-4)",alignItems:"flex-start",cursor:"pointer",
        padding:"var(--space-4) var(--gutter-screen)",
        background:h?"var(--state-hover)":"transparent",
        boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)",
        opacity:n.unread?1:0.55,transition:"background var(--transition-ui)"}}>
      <NotifMark n={n}/>
      <span style={{flex:1,minWidth:0}}>
        <span style={{display:"block",font:"var(--weight-medium) 15px/1.35 var(--font-core)",
          color:"var(--text-primary)"}}>{n.title}</span>
        {n.body?<span style={{display:"block",font:"var(--text-quiet-role)",fontSize:14,lineHeight:1.4,
          color:"var(--text-secondary)",marginTop:2}}>{n.body}</span>:null}
        {n.thread?<span style={{display:"block",fontSize:"var(--size-caption)",color:"var(--text-tertiary)",marginTop:4}}>{n.thread}</span>:null}
      </span>
      <span style={{flex:"0 0 auto",display:"flex",alignItems:"center",gap:"var(--space-3)",paddingTop:2,
        fontSize:"var(--size-caption)",color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums"}}>
        {n.when}
        {n.unread?<span aria-label="Unread" style={{width:7,height:7,borderRadius:"var(--radius-pill)",background:"var(--blue-500)"}}/>
          :<span style={{width:7}}/>}
      </span>
    </div>
  );
}

/* Notifications arrive from above, so the list does too: the sheet brings the app
   bar down with it and folds back up into the bell. */
const ROLL_MS=260;

function NotificationSheet({items,unread,closing,onClose,onOpen}){
  const dismiss=(then)=>onClose(then);
  const [top,setTop]=React.useState(82);
  const ref=React.useRef(null);
  React.useLayoutEffect(()=>{
    const host=ref.current&&ref.current.parentElement;
    const bar=host&&host.querySelector("header");
    if(bar)setTop(bar.getBoundingClientRect().bottom-host.getBoundingClientRect().top);
  },[]);
  return (
    <>
      <style>{"@keyframes offload-unroll{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}@keyframes offload-rollup{from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 0 100% 0)}}@keyframes offload-fade{from{opacity:0}to{opacity:1}}@keyframes offload-unfade{from{opacity:1}to{opacity:0}}"}</style>
      <span ref={ref} aria-hidden="true"/>
      <div onClick={()=>dismiss()} style={{position:"absolute",left:0,right:0,top,bottom:0,zIndex:20,
        background:"var(--surface-scrim-soft)",
        animation:closing?"offload-unfade "+ROLL_MS+"ms var(--ease-in-out) forwards":"offload-fade var(--duration-base) var(--ease-out)"}}/>
      {/* The app bar is the page's, not the sheet's: the list unrolls from under it,
          so the header never doubles or shifts colour. */}
      <div style={{position:"absolute",left:0,right:0,top,zIndex:21,maxHeight:"72%",
        display:"flex",flexDirection:"column",
        background:"var(--paper)",borderRadius:"0 0 var(--radius-xl) var(--radius-xl)",
        boxShadow:"0 18px 40px -12px rgba(11,11,11,0.20)",
        animation:closing?"offload-rollup "+ROLL_MS+"ms var(--ease-in-out) forwards":"offload-unroll var(--duration-slow) var(--ease-out)"}}>
        <div style={{flex:1,minHeight:0,overflowY:"auto"}}>
          <div style={{height:"var(--space-3)"}}/>
          {items.map((n,i)=><NotifRow key={n.id} n={n} last={i===items.length-1} onOpen={(x)=>dismiss(()=>onOpen(x))}/>)}
          <div style={{height:"var(--space-4)"}}/>
        </div>
        <button type="button" aria-label="Close notifications" onClick={()=>dismiss()}
          style={{flex:"0 0 auto",display:"flex",justifyContent:"center",padding:"var(--space-2) 0 var(--space-4)",
            border:"none",background:"none",cursor:"grab"}}>
          <span style={{width:34,height:4,borderRadius:2,background:"var(--ink-200)"}}/>
        </button>
      </div>
    </>
  );
}

Object.assign(window,{NotificationSheet,NotifRow,NotifMark});
