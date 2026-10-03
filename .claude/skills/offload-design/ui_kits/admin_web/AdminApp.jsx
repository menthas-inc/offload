const OFFLOAD_DS_A=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Toast } = OFFLOAD_DS_A;

/* The shell. Pinned light whatever the system says. The toast is four seconds and never
   carries Undo: anything that cannot be quietly reversed asks first (034). */
function AdminApp({role:initialRole="owner"}){
  const [role,setRole]=React.useState(initialRole);
  const [page,setPage]=React.useState(initialRole==="owner"?"health":"waitlist");
  const [person,setPerson]=React.useState(null);
  const [toast,setToast]=React.useState(null);
  const timer=React.useRef(null);
  function say(message){clearTimeout(timer.current);setToast(message);timer.current=setTimeout(()=>setToast(null),4000)}
  const go=(p)=>{setPage(p);setToast(null)};
  const back=()=>go("people");
  const body=page==="waitlist"?<WaitlistPage say={say}/>
    :page==="people"?<PeoplePage say={say} role={role} open={(u)=>{setPerson(u);go("person")}}/>
    :page==="person"?<PersonPage u={person||AD.users[0]} say={say} back={back} role={role}/>
    :page==="deleted"?<DeletedPage back={back} role={role}/>
    :page==="health"?<HealthPage say={say}/>
    :page==="costs"?<CostsPage/>
    :page==="limits"?<LimitsPage say={say}/>
    :page==="staff"?<StaffPage say={say}/>
    :<AuditPage/>;
  React.useEffect(()=>{window.__admin={go,setRole:(r)=>{setRole(r);go(r==="owner"?"health":"waitlist")},open:(u)=>{setPerson(u);go("person")}}});
  return (
    <div data-theme="light" style={{width:1440,height:900,display:"flex",overflow:"hidden",position:"relative",
      borderRadius:"var(--radius-lg)",background:"var(--surface-page)",color:"var(--text-primary)",
      border:"1px solid var(--border-hairline)",boxShadow:"var(--shadow-3)"}}>
      <ASideNav page={page} onPage={go} role={role}/>
      <div key={page} style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",animation:"a-fade 200ms var(--ease-out) both"}}>{body}</div>
      {toast?<div style={{position:"absolute",right:28,bottom:26,zIndex:30}}><Toast message={toast}/></div>:null}
    </div>
  );
}
Object.assign(window,{AdminApp});
