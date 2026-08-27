const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, Logo, Badge } = OFFLOAD_DS;

/* The Android platform layer. Everything offload-specific still comes from the design
   system; these five pieces are the Material 3 chrome the iOS kit expresses differently:
   a 64dp start-aligned top app bar, an 80dp navigation bar with the active pill, section
   labels with no rule, tonal containers, and 56dp list rows that wrap to two lines. */

function ABar({title,wordmark,left,right,solid}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-2)",height:64,flex:"0 0 auto",
      padding:"0 var(--space-2) 0 var(--space-5)",
      background:"var(--surface-raised)"}}>
      {left||null}
      {wordmark
        ?<span style={{flex:1,minWidth:0,display:"flex",alignItems:"center"}}><Logo size={21}/></span>
        :<span style={{flex:1,minWidth:0,font:"var(--weight-regular) 22px/28px var(--font-core)",
          color:"var(--a-on)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>}
      {right||null}
    </div>
  );
}

/* The active item is the deeper blue with a white glyph, not Material's usual
   secondary-container tint, so the selected tab reads at a glance. */
function ANav({items=[],value,onChange}){
  const idx=Math.max(0,items.findIndex(it=>it.value===value));
  const n=items.length||1;
  return (
    <nav style={{display:"flex",height:80,flex:"0 0 auto",alignItems:"flex-start",paddingTop:"var(--space-4)",
      background:"transparent",position:"relative"}}>
      {/* One indicator for the whole bar, so switching destination slides it rather than
         painting a new pill and dropping the old one. */}
      <span aria-hidden="true" style={{position:"absolute",top:"var(--space-4)",height:32,width:56,
        left:"calc("+(idx*100/n)+"% + "+(50/n)+"% - 28px)",borderRadius:"var(--radius-pill)",
        background:"var(--blue-600)",transition:"left 250ms cubic-bezier(.2,0,0,1)"}}/>
      {items.map(it=>{
        const on=it.value===value;
        return (
          <button key={it.value} type="button" aria-current={on?"page":undefined} onClick={()=>onChange&&onChange(it.value)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"var(--space-2)",
              border:"none",background:"none",cursor:"pointer",padding:0,position:"relative",
              font:"var(--weight-medium) 12px/16px var(--font-core)",
              color:on?"var(--blue-700)":"var(--a-on-var)",transition:"color 160ms linear"}}>
            <span style={{width:56,height:32,display:"flex",alignItems:"center",
              justifyContent:"center",color:on?"var(--text-on-solid)":"inherit",transition:"color 160ms linear"}}>
              <Icon name={it.icon} size={21}/></span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

const A_COUNT={
  neutral:{bg:"var(--a-c-high)",fg:"var(--a-on-var)"},
  accent:{bg:"var(--surface-accent-soft)",fg:"var(--text-accent)"},
  attention:{bg:"var(--surface-attention)",fg:"var(--text-on-solid)"}
};

function ASection({children,count,tone="neutral",action,onAction,style}){
  const c=A_COUNT[tone]||A_COUNT.neutral;
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",
      padding:"var(--space-6) 0 var(--space-3)",
      margin:"0 var(--gutter-screen) var(--space-5)",boxShadow:"inset 0 -1px 0 var(--a-outline)",...style}}>
      <span style={{font:"var(--weight-regular) 22px/28px var(--font-core)",color:"var(--a-on)"}}>{children}</span>
      {count!==undefined&&count!==null?(
        <span style={{font:"var(--weight-medium) 11px/16px var(--font-core)",fontVariantNumeric:"tabular-nums",
          padding:"1px 7px",borderRadius:"var(--radius-pill)",background:c.bg,color:c.fg}}>{count}</span>
      ):null}
      <span style={{flex:1}}/>
      {/* An action that is already an element renders bare; a string becomes the button. */}
      {action?(typeof action==="string"
        ?<button type="button" onClick={onAction} style={{border:"none",background:"none",cursor:"pointer",padding:0,
          font:"var(--weight-medium) 14px/20px var(--font-core)",color:"var(--blue-700)"}}>{action}</button>
        :action):null}
    </div>
  );
}

/* Tonal containment: a group sits in its own container and the container edge does the
   separating, so no section needs a rule. `white` is for content iOS already cards. */
function ACard({children,white=false,padded=true,style}){
  return (
    <div style={{background:white?"var(--surface-raised)":"transparent",
      border:white?"1px solid var(--a-outline)":"none",
      borderRadius:white?"var(--radius-md)":0,overflow:"hidden",
      padding:white&&padded?"0 var(--space-5)":0,...style}}>{children}</div>
  );
}

function ARow({leading,leadingTone,title,meta,trailing,chevron=false,selected=false,quietMeta=false,onClick,border=true,bleed=false,style}){
  const [h,setH]=React.useState(false);
  const clamp={display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"};
  return (
    <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"center",gap:"var(--space-5)",minHeight:56,
        padding:"var(--space-4) var(--gutter-screen)",
        cursor:onClick?"pointer":undefined,
        background:selected?"var(--state-selected)":h&&onClick?"var(--state-hover)":"transparent",
        boxShadow:border?"inset 0 -1px 0 var(--a-outline)":"none",
        transition:"background var(--transition-ui)",...style}}>
      {leading?(
        <span style={{width:40,height:40,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
          display:"flex",alignItems:"center",justifyContent:"center",
          background:leadingTone==="attention"?"var(--surface-attention)":"var(--a-c-high)",
          color:leadingTone==="attention"?"var(--text-on-solid)":"var(--a-on-var)"}}>
          {typeof leading==="string"?<Icon name={leading} size={19}/>:leading}</span>
      ):null}
      <span style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:2}}>
        <span style={{...clamp,font:"var(--weight-"+(meta?"medium":"regular")+") 16px/24px var(--font-core)",
          letterSpacing:"0.005em",color:"var(--a-on)"}}>{title}</span>
        {meta?<span style={{...clamp,...(quietMeta
          ?{font:"var(--weight-regular) 12.5px/17px var(--font-core)",color:"var(--a-on-quiet)"}
          :{font:"var(--weight-regular) 14px/20px var(--font-core)",letterSpacing:"0.015em",color:"var(--a-on-var)"})}}>{meta}</span>:null}
      </span>
      {trailing?<span style={{flex:"0 0 auto"}}>{trailing}</span>:null}
      {chevron?<span style={{flex:"0 0 auto",display:"flex",color:"var(--a-on-var)"}}><Icon name="chevron-right" size={16}/></span>:null}
    </div>
  );
}

/* Group a list of rows into one container, wiring the hairlines between them. */
function AList({rows,white,padded}){
  return (
    <ACard white={white} padded={padded}>
      {rows.map((r,i)=>React.cloneElement(r,{key:r.key||i,border:i<rows.length-1}))}
    </ACard>
  );
}

/* The shared Badge paints an iOS grey when neutral, so Android wraps it once here rather
   than every call site passing a style. */
function ABadge({children,tone,variant}){
  const neutral=!tone||tone==="neutral";
  return <Badge tone={tone} variant={variant}
    style={neutral?{background:"var(--a-c-high)",color:"var(--a-on-var)"}:null}>{children}</Badge>;
}

Object.assign(window,{ABar,ANav,ASection,ACard,ARow,AList,ABadge});
