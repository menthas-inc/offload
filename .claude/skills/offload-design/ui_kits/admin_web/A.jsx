const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, IconButton, Button, Chip, Badge, Logo, Toast, Switch, Checkbox } = OFFLOAD_DS;
const AD=(typeof window!=="undefined"&&window.ADMIN_DATA)||{};

/* The admin panel's own vocabulary. Same tokens, same type, same hairlines as the app; the
   two differences are deliberate:
   - the nav is moss, not ink, so nobody confuses this with the product
   - content is a table, not a list of rows, because admin work is comparing columns */
const NAV_BG="var(--moss-700)";
const NAV_FG="var(--paper)";
const NAV_QUIET="var(--moss-200)";

/* Two blocks (034), with a gap and no labels: what support does, then what only an owner sees.
   Owners open on Health, which carries a count only when something is wrong.
   A page a role cannot open is not in the nav at all, and answers as not found. */
const NAV_SUPPORT=[["inbox","Waitlist","waitlist","waiting"],["users","People","people",null]];
const NAV_OWNER=[["monitor","Health","health","wrong"],["blend","Costs","costs",null],["lock","Limits","limits",null],
  ["group","Staff","staff",null],["list","Audit","audit",null]];
function ASideNav({page,onPage,role="owner"}){
  const blocks=role==="owner"?[NAV_SUPPORT,NAV_OWNER]:[NAV_SUPPORT];
  const counts={waiting:(AD.waitlist||{}).waiting,wrong:(AD.health||{}).stuck?AD.health.stuck.length:0};
  return (
    <div style={{width:232,flex:"0 0 auto",background:NAV_BG,color:NAV_FG,display:"flex",flexDirection:"column",
      padding:"var(--space-6) var(--space-4)"}}>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",padding:"0 var(--space-3) var(--space-3)"}}>
        <Logo variant="mark" size={19} tone="inverse"/>
        <span style={{font:"var(--weight-semibold) 16px/1 var(--font-core)",letterSpacing:"-0.03em"}}>offload</span>
        <span style={{font:"var(--weight-medium) 10.5px/1 var(--font-core)",padding:"4px 6px",borderRadius:"var(--radius-xs)",
          background:"rgba(255,255,255,0.16)",color:NAV_FG}}>admin</span>
      </div>
      {blocks.map((items,bi)=>(
      <div key={bi} style={{display:"flex",flexDirection:"column",gap:2,marginTop:bi?"var(--space-7)":"var(--space-5)"}}>
        {items.map(([icon,label,id,ck])=>{
          const count=ck?counts[ck]:null;
          const on=page===id||(id==="people"&&(page==="person"||page==="deleted"));
          return (
            <button key={id} type="button" onClick={()=>onPage(id)}
              style={{display:"flex",alignItems:"center",gap:11,height:38,padding:"0 var(--space-4)",border:"none",
                cursor:"pointer",textAlign:"left",borderRadius:"var(--radius-sm)",
                font:"var(--weight-medium) 14.5px/1 var(--font-core)",
                background:on?"rgba(255,255,255,0.16)":"transparent",color:on?NAV_FG:NAV_QUIET}}>
              <Icon name={icon} size={17}/><span style={{flex:1}}>{label}</span>
              {count?<em style={{fontStyle:"normal",fontSize:12.5,fontVariantNumeric:"tabular-nums",opacity:.9}}>{count}</em>:null}
            </button>
          );
        })}
      </div>))}
      <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:"var(--space-3)"}}>
        <span style={{font:"var(--text-caption-role)",color:NAV_QUIET,padding:"0 var(--space-4)",lineHeight:1.5}}>
          Signed in as {(AD.me||{}).email}</span>
        <a href="../web_app/index.html" style={{display:"flex",alignItems:"center",gap:9,height:34,padding:"0 var(--space-4)",
          borderRadius:"var(--radius-sm)",textDecoration:"none",font:"var(--weight-medium) 13.5px/1 var(--font-core)",
          color:NAV_QUIET}}>
          <Icon name="chevron-left" size={15}/>Back to the app</a>
      </div>
    </div>
  );
}

function APaneHead({title,sub,tools,back,onBack}){
  return (
    <div style={{flex:"0 0 auto",display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:"var(--space-6)",
      padding:"var(--space-7) var(--space-8) var(--space-5)"}}>
      <span>
        {back?<button type="button" onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,border:"none",background:"none",
          padding:0,marginBottom:"var(--space-3)",cursor:"pointer",font:"var(--weight-medium) 13.5px/1 var(--font-core)",
          color:"var(--text-secondary)"}}><Icon name="chevron-left" size={15}/>{back}</button>:null}
        <span style={{display:"block",font:"var(--weight-semibold) 30px/1.1 var(--font-core)",letterSpacing:"-0.018em"}}>{title}</span>
        {sub?<span style={{display:"block",font:"var(--text-body-sm-role)",color:"var(--text-secondary)",marginTop:6}}>{sub}</span>:null}
      </span>
      {tools?<span style={{display:"flex",alignItems:"center",gap:"var(--space-3)",flex:"0 0 auto"}}>{tools}</span>:null}
    </div>
  );
}
function ABody({children,pad=true}){
  return <div style={{flex:1,minHeight:0,overflowY:"auto",padding:pad?"0 var(--space-8) var(--space-8)":0}}>{children}</div>;
}

/* One table shape for every page: hairlines only, no zebra, numbers right and tabular.
   A row has a least width, its fixed columns plus 140px for each open one; below that the
   table scrolls sideways rather than crushing the open column (034). */
const A_OPEN=140,A_GAP=16;
const aLeast=(cols)=>cols.reduce((s,c)=>s+(c.w||A_OPEN),0)+A_GAP*(cols.length+1);
function ATable({cols,children}){
  return (
    <div style={{border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-md)",overflowX:"auto",
      background:"var(--surface-raised)"}}>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-5)",padding:"var(--space-4) var(--space-5)",minWidth:aLeast(cols),
        boxShadow:"inset 0 -1px 0 var(--border-hairline)",background:"var(--surface-page)"}}>
        {cols.map((c,i)=>(
          <span key={i} style={{width:c.w,flex:c.w?"0 0 auto":1,minWidth:0,textAlign:c.right?"right":"left",
            font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-secondary)"}}>{c.label}</span>
        ))}
      </div>
      {children}
    </div>
  );
}
/* href: the whole row opens a page; its buttons act without opening it. */
function ARow({cols,cells,last,onClick,href,muted}){
  const [h,setH]=React.useState(false);
  const go=href||onClick;
  return (
    <div onClick={(e)=>{if(e.target.closest("button"))return;go&&go()}} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"center",gap:"var(--space-5)",padding:"var(--space-4) var(--space-5)",minHeight:52,minWidth:aLeast(cols),
        boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)",cursor:go?"pointer":"default",
        background:h&&go?"var(--state-hover)":"transparent",opacity:muted?0.55:1}}>
      {cells.map((cell,i)=>(
        <span key={i} style={{width:cols[i].w,flex:cols[i].w?"0 0 auto":1,minWidth:0,
          textAlign:cols[i].right?"right":"left",fontVariantNumeric:"tabular-nums",
          font:"var(--weight-regular) 14px/1.4 var(--font-core)",color:"var(--text-primary)"}}>{cell}</span>
      ))}
    </div>
  );
}
function AMono({children,bold}){
  return <span style={{fontVariantNumeric:"tabular-nums",fontWeight:bold?500:400}}>{children}</span>;
}
function AQuiet({children}){
  return <span style={{color:"var(--text-secondary)"}}>{children}</span>;
}

/* Numbers that matter, three or four across, never a grid of twelve. */
function AStat({label,value,note,tone}){
  return (
    <div style={{flex:1,minWidth:0,padding:"var(--space-5) var(--space-6)",border:"1px solid var(--border-hairline)",
      borderRadius:"var(--radius-md)",background:"var(--surface-raised)"}}>
      <div style={{font:"var(--text-body-sm-role)",color:"var(--text-secondary)"}}>{label}</div>
      <div style={{font:"var(--weight-semibold) 28px/1.1 var(--font-core)",letterSpacing:"-0.018em",marginTop:6,
        fontVariantNumeric:"tabular-nums",color:tone==="attention"?"var(--text-attention)":"var(--text-primary)"}}>{value}</div>
      {note?<div style={{font:"var(--text-caption-role)",color:"var(--text-tertiary)",marginTop:6,lineHeight:1.45}}>{note}</div>:null}
    </div>
  );
}
function AStats({children}){
  return <div style={{display:"flex",gap:"var(--space-4)",marginBottom:"var(--space-6)"}}>{children}</div>;
}
function ASection({children,note}){
  return (
    <div style={{display:"flex",alignItems:"baseline",gap:"var(--space-4)",padding:"var(--space-7) 0 var(--space-4)"}}>
      <span style={{font:"var(--weight-semibold) 17px/1.2 var(--font-core)"}}>{children}</span>
      {note?<span style={{font:"var(--text-body-sm-role)",color:"var(--text-tertiary)"}}>{note}</span>:null}
    </div>
  );
}
/* A plot (034): one series in the text colour on the page surface, bars or a line, at
   --plot-height. The attention colour only for the state that needs somebody. No legend. */
function APlot({title,points,labels,kind="bars",caption,format=(v)=>String(v),max,tones}){
  const [at,setAt]=React.useState(null);
  const top=Math.max(max||0,...points)||1,W=600,H=96,step=W/points.length,gap=Math.min(4,step*.2);
  const y=(v)=>H-(v/top)*H;
  return (
    <div style={{padding:"var(--space-5) var(--space-6)",border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-md)",
      background:"var(--surface-page)"}}>
      {title?<b style={{display:"block",font:"var(--weight-medium) 14px/1 var(--font-core)",marginBottom:"var(--space-5)"}}>{title}</b>:null}
      <svg viewBox={"0 0 "+W+" "+H} preserveAspectRatio="none" style={{display:"block",width:"100%",height:"var(--plot-height)",overflow:"visible"}}>
        {kind==="line"?<polyline points={points.map((v,i)=>(i*step+step/2)+","+y(v)).join(" ")}
          style={{fill:"none",stroke:"var(--text-primary)",strokeWidth:1.5,vectorEffect:"non-scaling-stroke"}}/>:null}
        {points.map((v,i)=>(
          <g key={i} onMouseEnter={()=>setAt(i)} onMouseLeave={()=>setAt(null)}>
            <rect x={i*step} y={0} width={step} height={H} style={{fill:at===i?"var(--state-hover)":"transparent"}}/>
            {kind==="line"?<circle cx={i*step+step/2} cy={y(v)} r={3} style={{fill:"var(--text-primary)"}}/>
              :<rect x={i*step+gap/2} y={y(v)} width={Math.max(1,step-gap)} height={H-y(v)}
                style={{fill:tones&&tones[i]?"var(--surface-attention)":"var(--text-primary)"}}/>}
          </g>
        ))}
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,marginTop:8,font:"var(--text-caption-role)",
        color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums"}}>
        <span>{labels[0]}</span><span>{at===null?caption:(labels[2]?labels[2](at):"")+": "+format(points[at])}</span><span>{labels[1]}</span>
      </div>
    </div>
  );
}
function APlots({children}){return <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"var(--space-4)"}}>{children}</div>}
/* The range picker. 24 hours, 7, 30 and 90 days, kept in the address. */
function ARange({value,onChange}){
  return <SegmentedControlA options={["24 hours","7 days","30 days","90 days"]} value={value} onChange={onChange}/>;
}
function SegmentedControlA(p){const S=OFFLOAD_DS.SegmentedControl;return S?<S {...p}/>:null}

/* A share of a total, drawn as one bar. No axes, no legend, no chart library. */
function ABar({value,total,tone}){
  const pct=Math.max(2,Math.round((value/total)*100));
  return (
    <span style={{display:"block",height:6,borderRadius:"var(--radius-pill)",background:"var(--surface-fill)",overflow:"hidden"}}>
      <span style={{display:"block",width:pct+"%",height:"100%",borderRadius:"var(--radius-pill)",
        background:tone==="attention"?"var(--surface-attention)":"var(--text-primary)"}}/>
    </span>
  );
}
function AStatus({value}){
  if(value==="disabled")return <Badge>disabled</Badge>;
  if(value==="invited")return <Badge tone="attention" variant="soft">invited</Badge>;
  if(value==="accepted")return <Badge tone="accent" variant="soft">signed up</Badge>;
  if(value==="waiting")return <Badge>waiting</Badge>;
  if(value==="deleting"||value==="late"||value==="stuck"||value==="running")return <Badge tone="attention" variant="soft">{value}</Badge>;
  if(value==="down"||value==="dead"||value==="failed")return <Badge tone="danger" variant="soft">{value}</Badge>;
  if(value==="up"||value==="done"||value==="billed")return <Badge tone="accent" variant="soft">{value}</Badge>;
  if(value==="typed")return <Badge>typed</Badge>;
  return <Badge tone="accent" variant="soft">active</Badge>;
}

/* Clay is only ever on a destructive control. In the panel it is clay at rest (034, the
   owner's ask): an outline clay button for the row's action, and --surface-danger, the one
   solid clay, for the confirmation itself. */
function ADanger({onClick,children,solid}){
  const [h,setH]=React.useState(false);
  const base={height:solid?40:32,padding:solid?"0 var(--space-6)":"0 var(--space-4)",border:"none",cursor:"pointer",
    borderRadius:solid?"var(--radius-pill)":"var(--radius-sm)",
    font:"var(--weight-medium) "+(solid?"15px":"var(--size-label)")+"/1 var(--font-core)",
    transition:"background var(--transition-ui),color var(--transition-ui)"};
  return solid
    ?<button type="button" onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{...base,color:"var(--text-on-solid)",background:h?"var(--surface-danger-hover)":"var(--surface-danger)"}}>{children}</button>
    :<button type="button" onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{...base,borderRadius:"var(--radius-pill)",boxShadow:"inset 0 0 0 1px var(--border-danger)",
        background:h?"var(--surface-danger-soft)":"transparent",color:"var(--text-danger)"}}>{children}</button>;
}

/* prefix or suffix: the affix a field is typed in ($, MB, min). */
function AField({label,value,onChange,prefix,suffix,hint,width=140,placeholder}){
  return (
    <label style={{display:"flex",flexDirection:"column",gap:6,width}}>
      <span style={{font:"var(--text-label-role)",color:"var(--text-secondary)"}}>{label}</span>
      <span style={{display:"flex",alignItems:"center",gap:6,height:42,padding:"0 var(--space-4)",
        borderRadius:"var(--radius-md)",border:"1px solid var(--border-strong)",background:"var(--surface-raised)"}}>
        {prefix?<span style={{color:"var(--text-tertiary)"}}>{prefix}</span>:null}
        <input value={value} placeholder={placeholder} onChange={(e)=>onChange(e.target.value)}
          style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",fontVariantNumeric:"tabular-nums",
            font:"var(--text-body-role)",color:"var(--text-primary)"}}/>
        {suffix?<span style={{color:"var(--text-tertiary)"}}>{suffix}</span>:null}
      </span>
      {hint?<span style={{font:"var(--text-caption-role)",color:"var(--text-tertiary)",lineHeight:1.45}}>{hint}</span>:null}
    </label>
  );
}
function ASearch({value,onChange,placeholder}){
  return (
    <span style={{display:"flex",alignItems:"center",gap:"var(--space-3)",height:38,width:280,
      padding:"0 var(--space-5)",borderRadius:"var(--radius-pill)",background:"var(--surface-fill)"}}>
      <Icon name="search" size={15} style={{color:"var(--text-tertiary)"}}/>
      <input value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder}
        style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",
          font:"var(--text-body-sm-role)",fontSize:14,color:"var(--text-primary)"}}/>
    </span>
  );
}

/* A switch row: off stops a path for everyone within seconds. */
function ASwitchRow({label,note,on,onChange,last}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-5)",padding:"var(--space-4) var(--space-5)",minHeight:56,
      boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
      <span style={{flex:1}}><b style={{display:"block",font:"var(--weight-medium) 14.5px/1.3 var(--font-core)"}}>{label}</b>
        {note?<span style={{display:"block",font:"var(--text-caption-role)",color:"var(--text-secondary)",marginTop:3}}>{note}</span>:null}</span>
      {Switch?<Switch checked={on} onChange={onChange}/>:null}
    </div>
  );
}
/* Old to new, in words, inside the confirm dialog (034). */
function ADiff({rows}){
  return (
    <ul style={{margin:"var(--space-5) 0 0",padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:6}}>
      {rows.map(([label,from,to])=>(
        <li key={label} style={{display:"flex",alignItems:"baseline",gap:"var(--space-3)",font:"var(--text-body-sm-role)"}}>
          <span style={{flex:1,minWidth:0,color:"var(--text-secondary)"}}>{label}</span>
          <span style={{fontVariantNumeric:"tabular-nums",color:"var(--text-secondary)",textDecoration:"line-through"}}>{from}</span>
          <span style={{color:"var(--text-tertiary)"}}>to</span>
          <span style={{fontWeight:500,fontVariantNumeric:"tabular-nums"}}>{to}</span>
        </li>
      ))}
    </ul>
  );
}

/* Anything that cannot be quietly reversed asks in a dialog and says what it takes with it.
   The panel has no Undo, so this is the safety net; it holds the keyboard while open. Deleting
   an account needs the address typed back. */
function AConfirm({title,body,confirmWord,danger,confirmLabel="Confirm",onConfirm,onClose,children}){
  const [typed,setTyped]=React.useState("");
  const ok=!confirmWord||typed.trim()===confirmWord;
  return (
    <>
      <div onClick={onClose} style={{position:"absolute",inset:0,zIndex:40,background:"var(--surface-scrim)"}}/>
      <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:460,zIndex:41,
        boxSizing:"border-box",padding:"var(--space-7)",borderRadius:"var(--radius-xl)",background:"var(--surface-raised)",
        boxShadow:"var(--shadow-sheet)"}}>
        <div style={{font:"var(--weight-semibold) 21px/1.2 var(--font-core)",letterSpacing:"-0.012em"}}>{title}</div>
        <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:"var(--space-3)",lineHeight:1.5}}>{body}</div>
        {children}
        {confirmWord?(
          <div style={{marginTop:"var(--space-6)"}}>
            <AField label={"Type "+confirmWord+" to confirm"} value={typed} onChange={setTyped} width="100%"/>
          </div>
        ):null}
        <div style={{display:"flex",justifyContent:"flex-end",gap:"var(--space-3)",marginTop:"var(--space-6)"}}>
          <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
          {danger
            ?<span style={{opacity:ok?1:.45,pointerEvents:ok?"auto":"none"}}>
              <ADanger solid onClick={()=>{onConfirm();onClose()}}>{confirmLabel}</ADanger></span>
            :<Button variant="primary" size="md" disabled={!ok}
              onClick={()=>{onConfirm();onClose()}}>{confirmLabel}</Button>}
        </div>
      </div>
    </>
  );
}

function ANotes({items}){
  return (
    <ul style={{margin:0,padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:8,maxWidth:"78ch"}}>
      {items.map(t=><li key={t} style={{display:"flex",gap:10,font:"var(--text-body-sm-role)",lineHeight:1.55,color:"var(--text-secondary)"}}>
        <span style={{color:"var(--text-tertiary)"}}>·</span>{t}</li>)}
    </ul>
  );
}
function ACard({children}){
  return <div style={{border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-md)",background:"var(--surface-raised)",overflow:"hidden"}}>{children}</div>;
}
Object.assign(window,{ASideNav,APaneHead,ABody,ATable,ARow,AMono,AQuiet,AStat,AStats,ASection,ABar,AStatus,
  AField,ASearch,AConfirm,ADanger,APlot,APlots,ARange,ASwitchRow,ADiff,ANotes,ACard,AD});
