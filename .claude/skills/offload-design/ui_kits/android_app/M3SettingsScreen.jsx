const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { IconButton, Icon, Button } = OFFLOAD_DS;

/* Cards from option 2, icons from option 1, search from option 3: the categories
   group visually, but each row still says what it is at a glance. */
const SETTINGS=[
  {label:"You",rows:[
    {id:"account",icon:"circle-dot",title:"My account",value:"jo@hey.com"},
    {id:"people",icon:"users",title:"My people",value:"3"},
    {id:"privacy",icon:"lock",title:"Privacy"}
  ]},
  {label:"Reaching you",rows:[
    {id:"comms",icon:"bell",title:"Notifications",value:"8:00"},
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
        minHeight:56,boxSizing:"border-box",padding:"var(--space-4)",margin:"0 calc(-1 * var(--space-4))",
        borderRadius:(first?"var(--radius-lg) var(--radius-lg)":"0 0")+" "+(last?"var(--radius-lg) var(--radius-lg)":"0 0"),
        background:h?"var(--state-hover)":"transparent",
        boxShadow:last?"none":"inset 0 -1px 0 var(--a-outline)",transition:"background var(--transition-ui)"}}>
      <span style={{width:40,height:40,flex:"0 0 auto",borderRadius:"var(--radius-pill)",background:"var(--a-c-high)",
        display:"flex",alignItems:"center",justifyContent:"center",color:"var(--a-on-var)"}}>
        <Icon name={row.icon} size={15}/></span>
      <span style={{flex:1,minWidth:0,font:"var(--weight-regular) 15px/1.35 var(--font-core)"}}>{row.title}</span>
      {row.value?<span style={{flex:"0 0 auto",fontSize:"var(--size-body-sm)",color:"var(--a-on-var)"}}>{row.value}</span>:null}
      <span style={{flex:"0 0 auto",display:"flex",color:"var(--a-on-var)"}}><Icon name="chevron-right" size={14}/></span>
    </div>
  );
}

function SettingsScreen({onBack,onOpen}){
  const [q,setQ]=React.useState("");
  const groups=SETTINGS.map(g=>({...g,rows:g.rows.filter(r=>r.title.toLowerCase().includes(q.trim().toLowerCase()))}))
    .filter(g=>g.rows.length);
  return (
    <>
      <ABar left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>} title="Settings"/>
      <div style={{flex:1,overflowY:"auto",padding:"var(--space-6) var(--gutter-screen) var(--space-9)"}}>
        {/* Sign out sits with the name, because that is what it acts on. */}
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-2) 0 var(--space-5)"}}>
          <span style={{width:52,height:52,flex:"0 0 auto",borderRadius:"var(--radius-pill)",background:"var(--a-c-high)",
            display:"flex",alignItems:"center",justifyContent:"center",color:"var(--a-on-var)",
            font:"var(--weight-medium) 17px/1 var(--font-core)"}}>JM</span>
          <span style={{flex:1,minWidth:0}}>
            <span style={{display:"block",font:"var(--text-title-1)",fontSize:21,letterSpacing:"-0.01em"}}>Jo Martins</span>
            <span style={{display:"block",fontSize:"var(--size-body-sm)",color:"var(--a-on-var)",marginTop:2}}>jo@hey.com &middot; free plan</span>
          </span>
          <Button variant="secondary" size="sm" onClick={()=>{}}>Sign out</Button>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:"var(--space-4)",height:52,padding:"0 var(--space-5)",
          borderRadius:"var(--radius-pill)",background:"var(--a-c-high)",marginBottom:"var(--space-2)",
          border:"1px solid var(--border-focus)"}}>
          <span style={{display:"flex",color:"var(--a-on-var)"}}><Icon name="search" size={15}/></span>
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search settings"
            style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",
              font:"var(--weight-regular) 14px/1 var(--font-core)",color:"var(--a-on)"}}/>
          {q?<button type="button" aria-label="Clear" onClick={()=>setQ("")}
            style={{border:"none",background:"none",padding:0,cursor:"pointer",display:"flex",color:"var(--a-on-var)"}}>
            <Icon name="x" size={13}/></button>:null}
        </label>
        {groups.map(g=>(
          <React.Fragment key={g.label}>
            <div style={{font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--a-on-var)",
              margin:"var(--space-5) 0 var(--space-3) 2px"}}>{g.label}</div>
            <div style={{background:"var(--surface-raised)",borderRadius:"var(--radius-md)",padding:"0 var(--space-4)"}}>
              {g.rows.map((r,i)=><SettingsRow key={r.id} row={r} first={i===0} last={i===g.rows.length-1} onOpen={onOpen}/>)}
            </div>
          </React.Fragment>
        ))}
        {!groups.length?<div style={{padding:"var(--space-8) 0",textAlign:"center",color:"var(--a-on-var)",
          fontSize:"var(--size-body-sm)"}}>Nothing matches &ldquo;{q}&rdquo;.</div>:null}
      </div>
    </>
  );
}

Object.assign(window,{SettingsScreen,SettingsRow,SETTINGS});
