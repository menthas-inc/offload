const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, IconButton, Badge, Button, Chip, Logo, AnswerResult, QuickReplies } = OFFLOAD_DS;
const D=window.OFFLOAD_DATA;

/* Web-only layout vocabulary. The rule everything follows: the rightmost pane is the one
   you are in, so it is white, the sidebar marks it and the breadcrumb ends on it. */
const SIDE_W=248, LEFT_W=520;

function clock(h,mer){const H=Math.floor(h),M=Math.round((h-H)*60);const h12=H%12===0?12:H%12;
  return h12+(M?":"+String(M).padStart(2,"0"):"")+(mer?(H<12?"am":"pm"):"");}

function WTile({icon,tone,size=32}){
  const hot=tone==="attention";
  return <span style={{width:size,height:size,flex:"0 0 auto",borderRadius:"var(--radius-sm)",marginTop:1,
    display:"flex",alignItems:"center",justifyContent:"center",
    background:hot?"var(--surface-attention)":"var(--surface-fill)",
    color:hot?"var(--text-on-solid)":"var(--text-secondary)"}}><Icon name={icon||"bookmark"} size={Math.round(size*0.47)}/></span>;
}

/* A row is the whole width of its pane; the pane supplies the gutter. Hover is a fill,
   never a colour change, so a row never looks disabled. Deleting asks in the row's own
   place, then the row collapses and the undo lives in a toast. */
function WRow({icon,tone,title,meta,trailing,tools,selected,onClick,check,done,onToggle,noTile,last,gone,onDelete,children}){
  const [h,setH]=React.useState(false);
  const [ask,setAsk]=React.useState(false);
  const box=React.useRef(null);
  const [box_h,setBoxH]=React.useState(null);
  React.useLayoutEffect(()=>{if(box.current&&box_h===null)setBoxH(box.current.offsetHeight)},[box_h]);
  React.useEffect(()=>{if(gone)setAsk(false)},[gone]);
  /* Clicking anywhere else is a cancel: the question should never trap the page. */
  React.useEffect(()=>{
    if(!ask)return;
    const away=(e)=>{if(box.current&&!box.current.contains(e.target))setAsk(false)};
    document.addEventListener("mousedown",away,true);
    return ()=>document.removeEventListener("mousedown",away,true);
  },[ask]);
  const shell={maxHeight:box_h===null?undefined:(gone?0:box_h),opacity:gone?0:1,overflow:"hidden",
    transition:"max-height 220ms var(--ease-out),opacity 140ms var(--ease-out)"};
  if(ask)return (
    <div style={shell}><div ref={box} style={{display:"flex",alignItems:"center",gap:"var(--space-5)",
      padding:"var(--space-4) var(--space-6)",margin:"0 calc(-1 * var(--space-5))",minHeight:box_h||undefined,
      borderRadius:"var(--radius-sm)",background:"var(--clay-100)",
      animation:"w-fade 140ms var(--ease-out) both"}}>
      <span style={{width:32,height:32,flex:"0 0 auto",borderRadius:"var(--radius-sm)",display:"flex",
        alignItems:"center",justifyContent:"center",background:"var(--surface-raised)",color:"var(--text-danger)"}}>
        <Icon name="trash-2" size={15}/></span>
      <span style={{flex:1,minWidth:0,font:"var(--weight-medium) 14.5px/1.35 var(--font-core)",color:"var(--text-danger)"}}>
        Delete {title}?</span>
      <Button variant="ghost" size="sm" onClick={(e)=>{e.stopPropagation();setAsk(false)}}>Cancel</Button>
      <WDanger onClick={(e)=>{e.stopPropagation();onDelete&&onDelete()}}>Delete</WDanger>
    </div></div>
  );
  return (
    <div style={shell}>
    <div ref={box} onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)",padding:"var(--space-4) var(--space-5)",
        margin:"0 calc(-1 * var(--space-5))",borderRadius:"var(--radius-sm)",cursor:onClick?"pointer":"default",
        background:selected?"var(--surface-fill)":(h&&onClick?"var(--state-hover)":"transparent"),
        boxShadow:last||selected?"none":"inset 0 -1px 0 var(--border-hairline)",
        transition:"background var(--transition-ui)"}}>
      {/* The tick is a control, not a mark: 17px drawn inside a 44px target, and its name
          carries what it belongs to. --ink-300 was 2.5:1 and never reached the floor. */}
      {check?<span role={onToggle?"checkbox":undefined} aria-checked={onToggle?Boolean(done):undefined}
        aria-label={onToggle?title:undefined} tabIndex={onToggle?0:undefined}
        onClick={onToggle?(e)=>{e.stopPropagation();onToggle()}:undefined}
        style={{width:17,height:17,flex:"0 0 auto",marginTop:6,borderRadius:5,display:"flex",alignItems:"center",
          justifyContent:"center",cursor:onToggle?"pointer":undefined,color:"var(--text-on-solid)",
          border:"1.5px solid "+(done?"var(--moss-600)":"var(--border-strong)"),
          background:done?"var(--moss-600)":"transparent",
          transition:"background var(--transition-ui),border-color var(--transition-ui)"}}>
        {done?<Icon name="check" size={11}/>:null}</span>:null}
      {noTile?null:<WTile icon={icon} tone={tone}/>}
      <span style={{flex:1,minWidth:0}}>
        <b style={{display:"block",font:"var(--weight-medium) 15.5px/1.35 var(--font-core)",
          color:done?"var(--text-tertiary)":undefined,textDecoration:done?"line-through":"none",
          textDecorationThickness:"1px"}}>{title}</b>
        {meta?<span style={{display:"block",fontSize:13,color:"var(--text-secondary)",marginTop:2}}>{meta}</span>:null}
        {children}
      </span>
      {tools&&h?<span style={{display:"flex",gap:"var(--space-2)",flex:"0 0 auto",
        animation:"w-fade 120ms var(--ease-out) both"}}>
        {tools.map(t=>t==="trash-2"&&onDelete
          ?<WTrash key={t} label={"Delete "+title} onClick={(e)=>{e.stopPropagation();setAsk(true)}}/>
          :<IconButton key={t} icon={t} label={t} size="sm" variant="quiet"/>)}</span>:null}
      {trailing?<span style={{flex:"0 0 auto",marginTop:3}}>{trailing}</span>:null}
    </div>
    </div>
  );
}

/* The one red control in the kit: a trash that only turns red once you are on it. */
function WTrash({onClick,label}){
  const [h,setH]=React.useState(false);
  return (
    <button type="button" aria-label={label} onClick={onClick}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:"pointer",
        borderRadius:"var(--radius-sm)",background:h?"var(--clay-100)":"var(--surface-fill)",
        color:h?"var(--text-danger)":"var(--text-secondary)",
        transition:"background var(--transition-ui),color var(--transition-ui)"}}>
      <Icon name="trash-2" size={16}/>
    </button>
  );
}
function WDanger({onClick,children}){
  const [h,setH]=React.useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{height:32,padding:"0 var(--space-5)",border:"none",cursor:"pointer",borderRadius:"var(--radius-sm)",
        font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",color:"var(--text-on-solid)",
        background:h?"var(--clay-700)":"var(--clay-600)",transition:"background var(--transition-ui)"}}>{children}</button>
  );
}

function WSection({children,count,tone,action,onAction}){
  const rule=tone==="accent"?"var(--moss-600)":"var(--ink-950)";
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",paddingBottom:"var(--space-3)",
      margin:"var(--space-7) 0 var(--space-2)",borderBottom:"1px solid "+rule}}>
      <b style={{font:"var(--weight-semibold) 18px/1.2 var(--font-core)",letterSpacing:"-0.012em"}}>{children}</b>
      {count!==undefined&&count!==null?<Badge tone={tone==="accent"?"accent":"attention"}
        variant={tone==="accent"?"soft":"solid"}>{count}</Badge>:null}
      {action?<span style={{marginLeft:"auto"}}>
        <Button variant="ghost" size="sm" onClick={onAction}>{action}</Button></span>:null}
    </div>
  );
}

/* c1: one bar above the panes, in the same place however many panes are open. The whole
   path shows, however deep it goes, so a fourth pane is still findable. */
function WCrumbs({trail,onJump,onClose,narrow,onBack}){
  if(narrow&&trail.length>1)return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",padding:"var(--space-4) var(--space-6)",
      flex:"0 0 auto",boxShadow:"0 1px 0 var(--border-hairline)"}}>
      <Button variant="ghost" size="sm" icon="chevron-left" onClick={onBack}>{trail[trail.length-2].label}</Button>
    </div>
  );
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",padding:"var(--space-4) var(--space-6)",
      flex:"0 0 auto",boxShadow:"0 1px 0 var(--border-hairline)"}}>
      <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:"var(--space-2)",overflowX:"auto"}}>
        {trail.map((c,i)=>{
          const on=i===trail.length-1;
          return (
            <React.Fragment key={c.label+i}>
              {i?<Icon name="chevron-right" size={11} style={{color:"var(--ink-300)",flex:"0 0 auto"}}/>:null}
              <button type="button" onClick={()=>!on&&onJump(i)} data-crumb={on?"on":"off"}
                style={{display:"inline-flex",alignItems:"center",gap:6,border:"none",cursor:on?"default":"pointer",
                  font:"var(--weight-medium) 12.5px/1 var(--font-core)",padding:"var(--space-3) var(--space-4)",
                  borderRadius:"var(--radius-pill)",whiteSpace:"nowrap",maxWidth:on?260:170,overflow:"hidden",
                  flex:"0 1 auto",animation:"w-crumb 200ms var(--ease-out) both",
                  transition:"background var(--transition-ui),color var(--transition-ui)",
                  background:on?"var(--surface-inverse)":"var(--surface-fill)",
                  color:on?"var(--text-inverse)":"var(--text-secondary)"}}>
                {c.icon?<Icon name={c.icon} size={12} style={{flex:"0 0 auto"}}/>:null}
                <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{c.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      {trail.length>1?<span style={{flex:"0 0 auto"}}>
        <Button variant="ghost" size="sm" icon="x" onClick={onClose}>Close pane</Button></span>:null}
    </div>
  );
}

/* The paper alternates with depth: the top level is the page colour, the pane you open on
   it is white, the next one page colour again. Every pane but the leftmost gets an edge. */
function WPane({paper,edge,width,leaving,anim,children}){
  return (
    <div data-pane={leaving?"leaving":paper} style={{flex:width?"0 0 auto":1,width:width||undefined,minWidth:0,display:"flex",flexDirection:"column",
      position:leaving?"absolute":"relative",left:leaving?0:undefined,top:leaving?0:undefined,bottom:leaving?0:undefined,
      zIndex:leaving?0:1,opacity:leaving?0:1,transform:leaving?"translateX(-56px)":"none",
      background:paper==="raised"?"var(--surface-raised)":"var(--surface-page)",
      boxShadow:edge?"-1px 0 0 var(--border-hairline)":"none",
      animation:leaving||!anim?undefined:anim+" 260ms var(--ease-out) both",
      transition:"opacity var(--duration-base) var(--ease-out),transform var(--duration-slow) var(--ease-out)"}}>
      {children}
    </div>
  );
}

/* Header and body share one reading measure, or a lone wide pane leaves its title
   floating away from the rows beneath it. */
function WPaneHead({title,sub,tools,aside,big,wide}){
  return (
    <div style={{flex:"0 0 auto",padding:"var(--space-6) 0 0"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:"var(--space-4)",
        maxWidth:wide?"none":700,margin:"0 auto",padding:"0 var(--space-8)"}}>
        <div style={{flex:1,minWidth:0}}>
        <div style={{font:"var(--weight-semibold) "+(big?"25px":"20px")+"/1.2 var(--font-core)",letterSpacing:"-0.016em",
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        {sub?<div style={{font:"var(--weight-regular) 13.5px/1.4 var(--font-core)",color:"var(--text-secondary)",marginTop:3}}>{sub}</div>:null}
      </div>
      {aside?<span style={{display:"flex",alignItems:"center",flex:"0 0 auto",marginRight:"var(--space-4)"}}>{aside}</span>:null}
      {tools?<span style={{display:"flex",gap:"var(--space-2)",flex:"0 0 auto"}}>
        {tools.map(([i,l,fn])=><IconButton key={i} icon={i} label={l} size="sm" variant="quiet" onClick={fn}/>)}</span>:null}
      </div>
    </div>
  );
}

function WBody({children,wide}){
  return (
    <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"0 0 var(--space-7)"}}>
      <div style={{maxWidth:wide?"none":700,margin:"0 auto",padding:"0 var(--space-8)"}}>{children}</div>
    </div>
  );
}

Object.assign(window,{OFFLOAD_DS,D,SIDE_W,LEFT_W,clock,WTile,WRow,WTrash,WDanger,WSection,WCrumbs,WPane,WPaneHead,WBody});
