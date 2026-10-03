const OFFLOAD_DS_P=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Button:PButton, SegmentedControl:PSeg, Checkbox:PCheck } = OFFLOAD_DS_P;

const money=(n)=>"$"+n.toFixed(2);
const money0=(n)=>"$"+Math.round(n).toLocaleString("en-US");

/* Waitlist. Invite one, a selection (the floating pill, the only place it appears), the
   weekly batch, or an address that never joined the list. Remove is clay at rest. */
function WaitlistPage({say}){
  const W=AD.waitlist;
  const [rows,setRows]=React.useState(W.rows);
  const [q,setQ]=React.useState("");
  const [addr,setAddr]=React.useState("");
  const [picked,setPicked]=React.useState([]);
  const [ask,setAsk]=React.useState(null);
  const list=q?rows.filter(r=>r.email.toLowerCase().indexOf(q.toLowerCase())>-1):rows;
  const waiting=rows.filter(r=>r.status==="waiting");
  const cols=[{label:"",w:24},{label:"Email"},{label:"Joined",w:80},{label:"Came from",w:140},{label:"State",w:100},{label:"",w:180,right:true}];
  function invite(ids){
    setRows(rs=>rs.map(r=>ids.indexOf(r.id)>-1?{...r,status:"invited",note:"invited today, not accepted"}:r));
    setPicked([]);say(ids.length===1?"Invite sent":"Invited "+ids.length+" people");
  }
  return (
    <>
      <APaneHead title="Waitlist" sub={W.waiting.toLocaleString("en-US")+" waiting · letting "+W.batch+" in a week"}
        tools={<><ASearch value={q} onChange={setQ} placeholder="Search by email"/>
          <PButton variant="secondary" size="sm" onClick={()=>invite(waiting.slice(0,W.batch).map(r=>r.id))}>{"Invite the next "+W.batch}</PButton></>}/>
      <ABody>
        <AStats>
          <AStat label="Waiting" value={W.waiting.toLocaleString("en-US")}/>
          <AStat label="Invited this week" value={W.invitedThisWeek}/>
          <AStat label="Signed up" value={W.accepted}/>
          <AStat label="Weekly batch" value={W.batch} note="set on Limits"/>
        </AStats>
        <div style={{display:"flex",alignItems:"flex-end",gap:"var(--space-3)",marginBottom:"var(--space-6)"}}>
          <AField label="Invite somebody" value={addr} onChange={setAddr} width={340} placeholder="name@example.com"
            hint="For an address that is not on the list"/>
          <span style={{marginBottom:24}}><PButton variant="primary" size="sm" onClick={()=>{if(addr.indexOf("@")<1){say("That address does not look right");return}
            setRows(rs=>[{id:"n"+Date.now(),email:addr,joined:"today",source:"invited by address",status:"invited",note:"invited today, not accepted"}].concat(rs));setAddr("");say("Invite sent")}}>Invite</PButton></span>
        </div>
        <ATable cols={cols}>
          {list.map((r,i)=>{
            const on=picked.indexOf(r.id)>-1;
            return <ARow key={r.id} cols={cols} last={i===list.length-1} muted={r.status==="accepted"} cells={[
              r.status==="waiting"?<PCheck checked={on} onChange={()=>setPicked(v=>on?v.filter(x=>x!==r.id):v.concat(r.id))}/>:null,
              <span><b style={{display:"block",fontWeight:500}}>{r.email}</b>
                {r.note?<AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{r.note}</span></AQuiet>:null}</span>,
              <AQuiet>{r.joined}</AQuiet>,<AQuiet>{r.source}</AQuiet>,<AStatus value={r.status}/>,
              <span style={{display:"flex",gap:"var(--space-2)",justifyContent:"flex-end"}}>
                {r.status==="waiting"?<PButton variant="secondary" size="sm" onClick={()=>invite([r.id])}>Invite</PButton>
                  :r.status==="invited"?<PButton variant="ghost" size="sm" onClick={()=>say("Invite sent again")}>Resend</PButton>
                  :<AQuiet><span style={{fontSize:12.5}}>in the app</span></AQuiet>}
                {r.status==="waiting"?<ADanger onClick={()=>setAsk(r)}>Remove</ADanger>:null}
              </span>]}/>;
          })}
        </ATable>
        <ASection>Notes</ASection>
        <ANotes items={["Inviting sends the one transactional email and creates nothing: the account exists when they sign in on that address.",
          "An invite is single use and expires in 14 days. Resend issues a new link and voids the old one.",
          "Someone who came from a shared thread is already vouched for by a member.",
          "Remove takes the address off the list. Nothing is sent to it."]}/>
      </ABody>
      {picked.length?(
        <div style={{position:"absolute",left:"calc(50% + 116px)",bottom:28,transform:"translateX(-50%)",zIndex:20,display:"flex",alignItems:"center",
          gap:"var(--space-4)",padding:"8px 8px 8px 20px",borderRadius:"var(--radius-pill)",background:"var(--surface-inverse)",color:"var(--text-inverse)",boxShadow:"var(--shadow-3)"}}>
          <b style={{font:"var(--weight-medium) 14px/1 var(--font-core)"}}>{picked.length+" selected"}</b>
          <button type="button" onClick={()=>setPicked([])} style={{border:"none",background:"none",color:"inherit",cursor:"pointer",font:"var(--weight-medium) 14px/1 var(--font-core)",opacity:.75}}>Clear</button>
          <PButton variant="primary" size="sm" onClick={()=>invite(picked)}>{"Invite "+picked.length}</PButton>
        </div>):null}
      {ask?<AConfirm danger title={"Remove "+ask.email+"?"} confirmLabel="Remove"
        body="It comes off the waitlist. Nothing is sent to the address, and it can join again." onClose={()=>setAsk(null)}
        onConfirm={()=>{setRows(rs=>rs.filter(x=>x.id!==ask.id));say("Removed from the waitlist")}}/>:null}
    </>
  );
}

/* People. Rows open a person's page; their buttons act without opening it. Delete is an
   owner's, held for 24 hours, and can be cancelled. */
function PeoplePage({say,open,role}){
  const [users,setUsers]=React.useState(AD.users);
  const [q,setQ]=React.useState("");
  const [filter,setFilter]=React.useState("Everyone");
  const [sort,setSort]=React.useState("Joined");
  const [ask,setAsk]=React.useState(null);
  const owner=role==="owner";
  let list=users.filter(u=>filter==="Everyone"||(filter==="Active"?u.status==="active":u.status!=="active"))
    .filter(u=>!q||(u.name+" "+u.email).toLowerCase().indexOf(q.toLowerCase())>-1);
  if(sort==="Spend")list=list.slice().sort((a,b)=>b.spend-a.spend);
  const cols=[{label:"Person"},{label:"Joined",w:76},{label:"Signed in with",w:110},{label:"Threads",w:70,right:true},
    {label:"Last active",w:96,right:true},{label:"Spend, 30d",w:92,right:true},{label:"State",w:92},{label:"",w:owner?190:100,right:true}];
  const set=(id,patch)=>setUsers(us=>us.map(u=>u.id===id?{...u,...patch}:u));
  return (
    <>
      <APaneHead title="People" sub={users.length.toLocaleString("en-US")+" accounts"}
        tools={<><PSeg options={["Everyone","Active","Disabled"]} value={filter} onChange={setFilter}/>
          <ASearch value={q} onChange={setQ} placeholder="Search name or email"/></>}/>
      <ABody>
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",marginBottom:"var(--space-4)"}}>
          <span style={{font:"var(--text-label-role)",color:"var(--text-secondary)"}}>Sort</span>
          <PSeg options={["Joined","Last active","Spend"]} value={sort} onChange={setSort}/>
          {sort!=="Joined"?<AQuiet><span style={{fontSize:13}}>The top 200</span></AQuiet>:null}
        </div>
        <ATable cols={cols}>
          {list.map((u,i)=>(
            <ARow key={u.id} cols={cols} last={i===list.length-1} muted={u.status==="disabled"} href={()=>open(u)}
              cells={[
                <span><b style={{display:"block",fontWeight:500}}>{u.name}</b>
                  <AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{u.status==="deleting"?"To be deleted "+u.deleteAt:u.email}</span></AQuiet></span>,
                <AQuiet>{u.joined}</AQuiet>,<AQuiet>{u.provider}</AQuiet>,<AMono>{u.threads}</AMono>,<AQuiet>{u.active}</AQuiet>,
                <AMono bold={u.spend>10}>{money(u.spend)}</AMono>,<AStatus value={u.status}/>,
                <span style={{display:"flex",gap:"var(--space-2)",justifyContent:"flex-end"}}>
                  {u.status==="deleting"
                    ?(owner?<PButton variant="secondary" size="sm" onClick={()=>{set(u.id,{status:"disabled"});say("Deletion cancelled. "+u.name.split(" ")[0]+" stays disabled")}}>Cancel deletion</PButton>:null)
                    :<>{u.status==="active"
                      ?<PButton variant="ghost" size="sm" onClick={()=>setAsk({kind:"disable",u})}>Disable</PButton>
                      :<PButton variant="secondary" size="sm" onClick={()=>{set(u.id,{status:"active"});say(u.name+" is active again")}}>Enable</PButton>}
                    {owner?<ADanger onClick={()=>setAsk({kind:"delete",u})}>Delete</ADanger>:null}</>}
                </span>]}/>
          ))}
        </ATable>
        <ASection>What these do</ASection>
        <ANotes items={["Disable signs the account out everywhere and refuses new sign-ins. Nothing is deleted. Reversible from the row.",
          "Delete, an owner's only, signs them out now and destroys the account, its threads, its notes and every conversation in 24 hours. Until then an owner can cancel it, which leaves the account disabled.",
          "What the person added to someone else's shared thread stays with that thread.",
          "The address gets one email, once the account is destroyed."]}/>
      </ABody>
      {ask&&ask.kind==="disable"?<AConfirm title={"Disable "+ask.u.name+"?"} confirmLabel="Disable"
        body="They are signed out everywhere and cannot sign in again until you enable them. Nothing is deleted." onClose={()=>setAsk(null)}
        onConfirm={()=>{set(ask.u.id,{status:"disabled"});say(ask.u.name+" is disabled")}}/>:null}
      {ask&&ask.kind==="delete"?<DeleteConfirm u={ask.u} onClose={()=>setAsk(null)}
        onConfirm={()=>{set(ask.u.id,{status:"deleting",deleteAt:"4 Oct, 21:05"});say(ask.u.name.split(" ")[0]+" will be deleted in 24 hours")}}/>:null}
    </>
  );
}
function DeleteConfirm({u,onClose,onConfirm}){
  return <AConfirm danger title={"Delete "+u.name+"?"} confirmWord={u.email} confirmLabel="Delete account" onClose={onClose} onConfirm={onConfirm}
    body={"Its threads, its notes and every conversation. They are signed out now, and the account is destroyed in 24 hours. Until then an owner can cancel."}/>;
}

/* A person's page. One account's story, with nothing the person wrote on it. */
function PersonPage({u,say,back,role}){
  const P=AD.person;const owner=role==="owner";
  const [range,setRange]=React.useState("30 days");
  const [ask,setAsk]=React.useState(null);
  const capCols=[{label:"Cap"},{label:"Used",w:90,right:true},{label:"Of",w:90,right:true},{label:"",w:200}];
  const jobCols=[{label:"When",w:64},{label:"Kind"},{label:"Model",w:170},{label:"Took",w:64,right:true},{label:"Cost",w:72,right:true},{label:"State",w:84}];
  const days=(i)=>(i+20)+" Sep";
  return (
    <>
      <APaneHead back="People" onBack={back} title={u.name} sub={u.email+" · joined "+u.joined+" · "+u.provider}
        tools={owner?<ADanger onClick={()=>setAsk("delete")}>Delete</ADanger>:null}/>
      <ABody>
        <AStats>
          <AStat label="State" value={<span style={{fontSize:22}}>{u.status}</span>}/>
          <AStat label="Threads" value={u.threads}/>
          <AStat label="Spend, 30 days" value={money(u.spend)}/>
          <AStat label="Last active" value={<span style={{fontSize:22}}>{u.active}</span>}/>
        </AStats>
        <ASection note="the last 24 hours, rolling">Today</ASection>
        <ATable cols={capCols}>
          {P.caps.map(([c,used,of],i)=><ARow key={c} cols={capCols} last={i===P.caps.length-1} cells={[<span style={{fontWeight:500}}>{c}</span>,
            <AMono>{used}</AMono>,<AQuiet>{of}</AQuiet>,<span style={{display:"block",paddingRight:12}}><ABar value={parseFloat(used.replace("$",""))} total={parseFloat(of.replace("$",""))}/></span>]}/>)}
        </ATable>
        {owner?<div style={{marginTop:"var(--space-4)"}}><PButton variant="secondary" size="sm" onClick={()=>setAsk("override")}>Override a limit</PButton></div>:null}
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",padding:"var(--space-7) 0 var(--space-4)"}}>
          <span style={{font:"var(--weight-semibold) 17px/1.2 var(--font-core)"}}>Activity</span>
          <ARange value={range} onChange={setRange}/></div>
        <APlots>
          <APlot title="Cost per day" points={P.spend} labels={["20 Sep","3 Oct",days]} format={money} caption="Dollars"/>
          <APlot title="Turns per day" points={P.turns} labels={["20 Sep","3 Oct",days]} caption="Turns" kind="line"/>
        </APlots>
        <ASection>What they have</ASection>
        <AStats>{P.has.map(([l,v])=><AStat key={l} label={l} value={v}/>)}</AStats>
        <ASection note="newest first">What happened</ASection>
        <ATable cols={jobCols}>
          {P.jobs.map((j,i)=><ARow key={i} cols={jobCols} last={i===P.jobs.length-1} cells={[<AQuiet>{j.when}</AQuiet>,
            <span><b style={{display:"block",fontWeight:500}}>{j.kind}</b>{j.code?<AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{j.code}</span></AQuiet>:null}</span>,
            <span>{j.model?<><span style={{display:"block"}}>{j.model}</span><AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{j.tokens} tokens</span></AQuiet></>:<AQuiet>none</AQuiet>}</span>,
            <AQuiet>{j.ms}</AQuiet>,<AMono>{j.cost}</AMono>,<AStatus value={j.state}/>]}/>)}
        </ATable>
        <ASection note="last 30 days">Limits hit</ASection>
        <HitsTable rows={P.hits}/>
      </ABody>
      {ask==="delete"?<DeleteConfirm u={u} onClose={()=>setAsk(null)} onConfirm={()=>say(u.name.split(" ")[0]+" will be deleted in 24 hours")}/>:null}
      {ask==="override"?<AConfirm title={"Override a limit for "+u.name.split(" ")[0]} confirmLabel="Save override" onClose={()=>setAsk(null)}
        onConfirm={()=>say("Override saved")} body="Replaces the cap for this account only, until you clear it.">
        <div style={{display:"flex",gap:"var(--space-4)",marginTop:"var(--space-5)"}}>
          <AField label="Cap" value="Turns" onChange={()=>{}} width={180}/><AField label="Per 24 hours" value="200" onChange={()=>{}} width={140}/></div>
        <ADiff rows={[["Turns, per 24 hours","100","200"]]}/>
      </AConfirm>:null}
    </>
  );
}
function HitsTable({rows}){
  const cols=[{label:"Day",w:80},{label:"Cap"},{label:"Whose",w:160},{label:"Times",w:70,right:true}];
  return <ATable cols={cols}>{rows.map((h,i)=><ARow key={i} cols={cols} last={i===rows.length-1}
    cells={[<AQuiet>{h.day}</AQuiet>,<span style={{fontWeight:500}}>{h.cap}</span>,<AQuiet>{h.whose}</AQuiet>,<AMono>{h.n}</AMono>]}/>)}</ATable>;
}

/* A deleted account. Says what happened and nothing about who it was. */
function DeletedPage({back,role}){
  const cols=[{label:"When",w:150},{label:"Who",w:150},{label:"What"}];
  const rows=[["12 Sep, 09:14","Hana Ito","Marked for deletion"],["13 Sep, 09:14","offload","Destroyed"]];
  return (
    <>
      <APaneHead back="People" onBack={back} title="Deleted account" sub="This account was deleted on 12 September 2026."/>
      <ABody>{role==="owner"?<ATable cols={cols}>{rows.map((r,i)=><ARow key={i} cols={cols} last={i===rows.length-1}
        cells={[<AQuiet>{r[0]}</AQuiet>,<AQuiet>{r[1]}</AQuiet>,<span>{r[2]}</span>]}/>)}</ATable>:null}</ABody>
    </>
  );
}

/* Staff. Any address that has signed in once; no name field; nothing is emailed to them. */
function StaffPage({say}){
  const [staff,setStaff]=React.useState(AD.admins);
  const [ask,setAsk]=React.useState(null);
  const [adding,setAdding]=React.useState(false);
  const [form,setForm]=React.useState({email:"",role:"Support"});
  const owners=staff.filter(s=>s.role==="Owner").length;
  const cols=[{label:"Person"},{label:"Role",w:170},{label:"Added",w:80},{label:"Last here",w:96,right:true},{label:"",w:150,right:true}];
  function setRole(s,role){
    if(s.role==="Owner"&&role==="Support"&&owners<2){say("Keep at least one owner");return}
    setStaff(v=>v.map(x=>x.id===s.id?{...x,role}:x));say(s.name.split(" ")[0]+" is now "+role.toLowerCase());
  }
  return (
    <>
      <APaneHead title="Staff" sub={staff.length+" people can open this panel · "+owners+" owners"}
        tools={<PButton variant="primary" size="sm" icon="plus" onClick={()=>setAdding(true)}>Add someone</PButton>}/>
      <ABody>
        <ATable cols={cols}>
          {staff.map((s,i)=>(
            <ARow key={s.id} cols={cols} last={i===staff.length-1} cells={[
              <span><b style={{display:"block",fontWeight:500}}>{s.name}{s.you?<AQuiet><span style={{fontWeight:400}}> · you</span></AQuiet>:null}</b>
                <AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{s.email}</span></AQuiet></span>,
              s.you?<AQuiet>{s.role}, fixed</AQuiet>:<PSeg options={["Owner","Support"]} value={s.role} onChange={(r)=>setRole(s,r)}/>,
              <AQuiet>{s.added}</AQuiet>,<AQuiet>{s.active}</AQuiet>,
              s.you?null:<ADanger onClick={()=>setAsk(s)}>Remove</ADanger>]}/>
          ))}
        </ATable>
        <ASection>What the two roles can do</ASection>
        <ATable cols={[{label:"Role",w:120},{label:"Can"}]}>
          {AD.roles.map((r,i)=><ARow key={r.name} cols={[{w:120},{}]} last={i===AD.roles.length-1} cells={[<span style={{fontWeight:500}}>{r.name}</span>,<AQuiet>{r.can}</AQuiet>]}/>)}
        </ATable>
        <ASection>Rules</ASection>
        <ANotes items={["Staff is a role on an account. The address must belong to an account that has signed in at least once.",
          "Nothing is emailed to the person added. Every owner is told.",
          "There is always at least one owner. You cannot remove or demote yourself.",
          "A page a role cannot open is not in its nav, and answers as not found."]}/>
      </ABody>
      {adding?<AConfirm title="Add someone to staff" confirmLabel="Add to staff" onClose={()=>setAdding(false)}
        body="Any address that has signed in to offload once."
        onConfirm={()=>{const e=form.email.trim();if(e.indexOf("@")<1){say("That address does not look right");return}
          setStaff(v=>v.concat({id:"a"+Date.now(),name:e.split("@")[0],email:e,role:form.role,added:"today",active:"never"}));setForm({email:"",role:"Support"});say("Added. Every owner has been told")}}>
        <div style={{display:"flex",flexDirection:"column",gap:"var(--space-4)",marginTop:"var(--space-5)"}}>
          <AField label="Email" value={form.email} onChange={(v)=>setForm(f=>({...f,email:v}))} width="100%"/>
          <span style={{display:"flex",flexDirection:"column",gap:6}}><span style={{font:"var(--text-label-role)",color:"var(--text-secondary)"}}>Role</span>
            <PSeg options={["Support","Owner"]} value={form.role} onChange={(v)=>setForm(f=>({...f,role:v}))}/></span>
        </div>
      </AConfirm>:null}
      {ask?<AConfirm danger title={"Remove "+ask.name+"?"} confirmLabel="Remove" onClose={()=>setAsk(null)}
        body="They lose this panel straight away. Their own offload account is untouched."
        onConfirm={()=>{if(ask.role==="Owner"&&owners<2){say("Keep at least one owner");return}
          setStaff(v=>v.filter(x=>x.id!==ask.id));say(ask.name.split(" ")[0]+" no longer has access")}}/>:null}
    </>
  );
}
Object.assign(window,{WaitlistPage,PeoplePage,PersonPage,DeletedPage,StaffPage,HitsTable,money,money0});
