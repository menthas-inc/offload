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

function ASideNav({page,onPage}){
  const items=[["inbox","Waitlist","waitlist",(AD.waitlist||{}).waiting],
    ["users","People","people",null],["group","Staff","staff",null],
    ["blend","Costs","costs",null],["lock","Limits","limits",null]];
  return (
    <div style={{width:232,flex:"0 0 auto",background:NAV_BG,color:NAV_FG,display:"flex",flexDirection:"column",
      padding:"var(--space-6) var(--space-4)"}}>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",padding:"0 var(--space-3) var(--space-3)"}}>
        <Logo variant="mark" size={19} tone="inverse"/>
        <span style={{font:"var(--weight-semibold) 16px/1 var(--font-core)",letterSpacing:"-0.03em"}}>offload</span>
        <span style={{font:"var(--weight-medium) 10.5px/1 var(--font-core)",padding:"4px 6px",borderRadius:"var(--radius-xs)",
          background:"rgba(255,255,255,0.16)",color:NAV_FG}}>admin</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:"var(--space-5)"}}>
        {items.map(([icon,label,id,count])=>{
          const on=page===id;
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
      </div>
      <div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:"var(--space-3)"}}>
        <span style={{font:"var(--text-caption-role)",color:NAV_QUIET,padding:"0 var(--space-4)",lineHeight:1.5}}>
          Signed in as admin@offload.club</span>
        <a href="../web_app/index.html" style={{display:"flex",alignItems:"center",gap:9,height:34,padding:"0 var(--space-4)",
          borderRadius:"var(--radius-sm)",textDecoration:"none",font:"var(--weight-medium) 13.5px/1 var(--font-core)",
          color:NAV_QUIET}}>
          <Icon name="chevron-left" size={15}/>Back to the app</a>
      </div>
    </div>
  );
}

function APaneHead({title,sub,tools}){
  return (
    <div style={{flex:"0 0 auto",display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:"var(--space-6)",
      padding:"var(--space-7) var(--space-8) var(--space-5)"}}>
      <span>
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

/* One table shape for every page: hairlines only, no zebra, numbers right and tabular. */
function ATable({cols,children}){
  return (
    <div style={{border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-md)",overflow:"hidden",
      background:"var(--surface-raised)"}}>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-5)",padding:"var(--space-4) var(--space-5)",
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
function ARow({cols,cells,last,onClick,muted}){
  const [h,setH]=React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"center",gap:"var(--space-5)",padding:"var(--space-4) var(--space-5)",minHeight:52,
        boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)",cursor:onClick?"pointer":"default",
        background:h&&onClick?"var(--state-hover)":"transparent",opacity:muted?0.55:1}}>
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
/* A share of a total, drawn as one bar. No axes, no legend, no chart library. */
function ABar({value,total,tone}){
  const pct=Math.max(2,Math.round((value/total)*100));
  return (
    <span style={{display:"block",height:6,borderRadius:"var(--radius-pill)",background:"var(--surface-fill)",overflow:"hidden"}}>
      <span style={{display:"block",width:pct+"%",height:"100%",borderRadius:"var(--radius-pill)",
        background:tone==="attention"?"var(--blue-600)":"var(--moss-600)"}}/>
    </span>
  );
}
function AStatus({value}){
  if(value==="disabled")return <Badge>disabled</Badge>;
  if(value==="invited")return <Badge tone="attention" variant="soft">invited</Badge>;
  if(value==="accepted")return <Badge tone="accent" variant="soft">signed up</Badge>;
  if(value==="waiting")return <Badge>waiting</Badge>;
  return <Badge tone="accent" variant="soft">active</Badge>;
}

/* Clay is only ever on a destructive control, and on the phones and the web app it only
   turns red once the pointer is on it. Same here: a quiet row action that colours on hover,
   and a solid clay button for the confirmation itself. */
function ADanger({onClick,children,solid}){
  const [h,setH]=React.useState(false);
  const base={height:solid?40:32,padding:solid?"0 var(--space-6)":"0 var(--space-4)",border:"none",cursor:"pointer",
    borderRadius:solid?"var(--radius-pill)":"var(--radius-sm)",
    font:"var(--weight-medium) "+(solid?"15px":"var(--size-label)")+"/1 var(--font-core)",
    transition:"background var(--transition-ui),color var(--transition-ui)"};
  return solid
    ?<button type="button" onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{...base,color:"var(--text-on-solid)",background:h?"var(--clay-700)":"var(--clay-600)"}}>{children}</button>
    :<button type="button" onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{...base,background:h?"var(--clay-100)":"transparent",color:h?"var(--text-danger)":"var(--text-secondary)"}}>{children}</button>;
}

function AField({label,value,onChange,prefix,hint,width=140}){
  return (
    <label style={{display:"flex",flexDirection:"column",gap:6,width}}>
      <span style={{font:"var(--text-label-role)",color:"var(--text-secondary)"}}>{label}</span>
      <span style={{display:"flex",alignItems:"center",gap:6,height:42,padding:"0 var(--space-4)",
        borderRadius:"var(--radius-md)",border:"1px solid var(--border-strong)",background:"var(--surface-raised)"}}>
        {prefix?<span style={{color:"var(--text-tertiary)"}}>{prefix}</span>:null}
        <input value={value} onChange={(e)=>onChange(e.target.value)}
          style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",fontVariantNumeric:"tabular-nums",
            font:"var(--text-body-role)",color:"var(--text-primary)"}}/>
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

/* Anything irreversible asks in a dialog and says what it takes with it. Deleting an
   account needs the email typed, because a support person doing ten of these in a row will
   otherwise delete the eleventh by muscle memory. */
function AConfirm({title,body,confirmWord,danger,confirmLabel="Confirm",onConfirm,onClose}){
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

Object.assign(window,{ASideNav,APaneHead,ABody,ATable,ARow,AMono,AQuiet,AStat,AStats,ASection,ABar,AStatus,
  AField,ASearch,AConfirm,ADanger,AD});
