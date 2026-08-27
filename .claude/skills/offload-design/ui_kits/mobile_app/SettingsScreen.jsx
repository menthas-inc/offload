const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { AppBar, IconButton, Icon, Button } = OFFLOAD_DS;

/* Cards from option 2, icons from option 1, search from option 3: the categories
   group visually, but each row still says what it is at a glance. */
const SETTINGS=[
  {label:"You",rows:[
    {id:"account",icon:"circle-dot",title:"My account",value:"jo@hey.com"},
    {id:"people",icon:"users",title:"My people",value:"3"},
    {id:"privacy",icon:"lock",title:"Privacy"}
  ]},
  {label:"Reaching you",rows:[
    {id:"comms",icon:"bell",title:"Communication",value:"Quiet 22:00"},
    {id:"apps",icon:"link",title:"Connected apps",value:"2 of 4"}
  ]},
  {label:"What offload keeps",rows:[
    {id:"memory",icon:"archive",title:"Memory and data",value:"34"},
    {id:"retention",icon:"clock-fading",title:"Conversations kept",value:"60 days"}
  ]},
  {label:"The app",rows:[
    {id:"appearance",icon:"blend",title:"Appearance",value:"System"},
    {id:"language",icon:"orbit",title:"Language and region",value:"EN, metric"},
    {id:"help",icon:"compass",title:"Help and about",value:"2.1.0"}
  ]}
];

function SettingsRow({row,first,last,onOpen}){
  const [h,setH]=React.useState(false);
  return (
    <div role="button" tabIndex={0} onClick={()=>onOpen(row)}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"center",gap:"var(--space-4)",cursor:"pointer",
        padding:"var(--space-3) var(--space-4)",margin:"0 calc(-1 * var(--space-4))",
        borderRadius:(first?"var(--radius-lg) var(--radius-lg)":"0 0")+" "+(last?"var(--radius-lg) var(--radius-lg)":"0 0"),
        background:h?"var(--state-hover)":"transparent",
        boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)",transition:"background var(--transition-ui)"}}>
      <span style={{width:30,height:30,flex:"0 0 auto",borderRadius:"var(--radius-sm)",background:"var(--paper)",
        display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}>
        <Icon name={row.icon} size={15}/></span>
      <span style={{flex:1,minWidth:0,font:"var(--weight-regular) 15px/1.35 var(--font-core)"}}>{row.title}</span>
      {row.value?<span style={{flex:"0 0 auto",fontSize:"var(--size-body-sm)",color:"var(--text-secondary)"}}>{row.value}</span>:null}
      <span style={{flex:"0 0 auto",display:"flex",color:"var(--ink-300)"}}><Icon name="chevron-right" size={14}/></span>
    </div>
  );
}

function SettingsScreen({onBack,onOpen}){
  const [q,setQ]=React.useState("");
  const groups=SETTINGS.map(g=>({...g,rows:g.rows.filter(r=>r.title.toLowerCase().includes(q.trim().toLowerCase()))}))
    .filter(g=>g.rows.length);
  return (
    <>
      <AppBar border={false} left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>} title="Settings"/>
      <div style={{flex:1,overflowY:"auto",padding:"var(--space-6) var(--gutter-screen) var(--space-9)"}}>
        {/* Sign out sits with the name, because that is what it acts on. */}
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-2) 0 var(--space-5)"}}>
          <span style={{width:52,height:52,flex:"0 0 auto",borderRadius:"var(--radius-pill)",background:"var(--surface-fill)",
            display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)",
            font:"var(--weight-medium) 17px/1 var(--font-core)"}}>JM</span>
          <span style={{flex:1,minWidth:0}}>
            <span style={{display:"block",font:"var(--text-title-1)",fontSize:21,letterSpacing:"-0.01em"}}>Jo Martins</span>
            <span style={{display:"block",fontSize:"var(--size-body-sm)",color:"var(--text-secondary)",marginTop:2}}>jo@hey.com &middot; free plan</span>
          </span>
          <Button variant="secondary" size="sm" onClick={()=>{}}>Sign out</Button>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:"var(--space-3)",height:38,padding:"0 var(--space-5)",
          borderRadius:"var(--radius-pill)",background:"var(--surface-fill)",marginBottom:"var(--space-2)",
          border:"1px solid var(--border-focus)"}}>
          <span style={{display:"flex",color:"var(--text-tertiary)"}}><Icon name="search" size={15}/></span>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search settings"
            style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",
              font:"var(--weight-regular) 14px/1 var(--font-core)",color:"var(--text-primary)"}}/>
          {q?<button type="button" aria-label="Clear" onClick={()=>setQ("")}
            style={{border:"none",background:"none",padding:0,cursor:"pointer",display:"flex",color:"var(--text-tertiary)"}}>
            <Icon name="x" size={13}/></button>:null}
        </label>
        {groups.map(g=>(
          <React.Fragment key={g.label}>
            <div style={{font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-tertiary)",
              margin:"var(--space-5) 0 var(--space-3) 2px"}}>{g.label}</div>
            <div style={{background:"var(--surface-fill)",borderRadius:"var(--radius-lg)",padding:"0 var(--space-4)"}}>
              {g.rows.map((r,i)=><SettingsRow key={r.id} row={r} first={i===0} last={i===g.rows.length-1} onOpen={onOpen}/>)}
            </div>
          </React.Fragment>
        ))}
        {!groups.length?<div style={{padding:"var(--space-8) 0",textAlign:"center",color:"var(--text-tertiary)",
          fontSize:"var(--size-body-sm)"}}>Nothing matches &ldquo;{q}&rdquo;.</div>:null}
      </div>
    </>
  );
}

Object.assign(window,{SettingsScreen,SettingsRow,SETTINGS});
