const OFFLOAD_DS_A=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Button, Chip, Badge, Toast, Switch, Checkbox, Icon, IconButton, SegmentedControl } = OFFLOAD_DS_A;

const money=(n)=>"£"+n.toFixed(2);
const money0=(n)=>"£"+Math.round(n).toLocaleString("en-GB");

/* 1 · Waitlist. The only queue in the product: who is waiting, who has been invited and has
   not signed in yet, and who came in through someone else's shared thread. Inviting is one
   click per row, or one for a selection, because the weekly batch is the actual job. */
function WaitlistPage({say}){
  const W=AD.waitlist;
  const [rows,setRows]=React.useState(W.rows);
  const [q,setQ]=React.useState("");
  const [picked,setPicked]=React.useState([]);
  const list=q?rows.filter(r=>r.email.toLowerCase().indexOf(q.toLowerCase())>-1):rows;
  const waiting=rows.filter(r=>r.status==="waiting");
  const cols=[{label:"",w:24},{label:"Email"},{label:"Joined",w:80},{label:"Came from",w:130},
    {label:"State",w:110},{label:"",w:96,right:true}];
  function invite(ids){
    setRows(rs=>rs.map(r=>ids.indexOf(r.id)>-1?{...r,status:"invited",note:"invited today, not accepted"}:r));
    setPicked([]);
    say(ids.length===1?"Invite sent":"Invited "+ids.length+" people");
  }
  return (
    <>
      <APaneHead title="Waitlist" sub={W.waiting.toLocaleString("en-GB")+" waiting · letting "+W.weekly+" in a week"}
        tools={<>
          <ASearch value={q} onChange={setQ} placeholder="Search by email"/>
          <Button variant="secondary" size="sm" icon="inbox"
            onClick={()=>invite(waiting.slice(0,W.weekly).map(r=>r.id))}>{"Invite the next "+W.weekly}</Button>
        </>}/>
      <ABody>
        <AStats>
          <AStat label="Waiting" value={W.waiting.toLocaleString("en-GB")} note="oldest joined 3 June"/>
          <AStat label="Invited this week" value={W.invitedThisWeek}/>
          <AStat label="Signed up" value={W.accepted} note="of 40 invited, 9 have not opened it"/>
          <AStat label="Weekly batch" value={W.weekly} note="set on the Limits page"/>
        </AStats>
        {picked.length?(
          <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-4) var(--space-5)",
            marginBottom:"var(--space-4)",borderRadius:"var(--radius-md)",background:"var(--surface-accent-soft)"}}>
            <b style={{flex:1,font:"var(--weight-medium) 14px/1 var(--font-core)"}}>{picked.length+" selected"}</b>
            <Button variant="ghost" size="sm" onClick={()=>setPicked([])}>Clear</Button>
            <Button variant="primary" size="sm" onClick={()=>invite(picked)}>{"Invite "+picked.length}</Button>
          </div>
        ):null}
        <ATable cols={cols}>
          {list.map((r,i)=>{
            const on=picked.indexOf(r.id)>-1;
            return (
              <ARow key={r.id} cols={cols} last={i===list.length-1} muted={r.status==="accepted"}
                cells={[
                  <Checkbox checked={on} onChange={()=>setPicked(v=>on?v.filter(x=>x!==r.id):v.concat(r.id))}/>,
                  <span>
                    <b style={{display:"block",fontWeight:500}}>{r.email}</b>
                    {r.note?<AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{r.note}</span></AQuiet>:null}
                  </span>,
                  <AQuiet>{r.joined}</AQuiet>,
                  <AQuiet>{r.source}</AQuiet>,
                  <AStatus value={r.status}/>,
                  r.status==="waiting"
                    ?<Button variant="secondary" size="sm" onClick={()=>invite([r.id])}>Invite</Button>
                    :r.status==="invited"
                      ?<Button variant="ghost" size="sm" onClick={()=>say("Invite sent again")}>Resend</Button>
                      :<AQuiet><span style={{fontSize:12.5}}>in the app</span></AQuiet>
                ]}/>
            );
          })}
        </ATable>
        <ASection note="what an invite does">Notes</ASection>
        <ul style={{margin:0,padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:8,maxWidth:"78ch"}}>
          {["Inviting sends the one transactional email and creates nothing: the account exists when they sign in with Apple or Google on that address.",
            "An invite is single use and expires in 14 days. Resend issues a new link and voids the old one.",
            "Someone who came from a shared thread is already vouched for by a member, so those usually go in the next batch.",
            "Removing an address from the waitlist is not here on purpose. Support does it from People once the account exists."]
            .map(t=><li key={t} style={{display:"flex",gap:10,font:"var(--text-body-sm-role)",lineHeight:1.55,color:"var(--text-secondary)"}}>
              <span style={{color:"var(--text-tertiary)"}}>·</span>{t}</li>)}
        </ul>
      </ABody>
    </>
  );
}

/* 2 · People. Support's page. Everything reversible sits on the row; the two irreversible
   things ask first, and deleting needs the email typed. */
function PeoplePage({say}){
  const [users,setUsers]=React.useState(AD.users);
  const [q,setQ]=React.useState("");
  const [filter,setFilter]=React.useState("Everyone");
  const [ask,setAsk]=React.useState(null);
  const list=users
    .filter(u=>filter==="Everyone"||(filter==="Active"?u.status==="active":u.status==="disabled"))
    .filter(u=>!q||(u.name+" "+u.email).toLowerCase().indexOf(q.toLowerCase())>-1);
  const cols=[{label:"Person"},{label:"Signed in with",w:120},{label:"Threads",w:76,right:true},
    {label:"Last active",w:100,right:true},{label:"Spend, 30d",w:96,right:true},{label:"State",w:92},
    {label:"",w:170,right:true}];
  const set=(id,patch)=>setUsers(us=>us.map(u=>u.id===id?{...u,...patch}:u));
  return (
    <>
      <APaneHead title="People" sub={users.length.toLocaleString("en-GB")+" accounts · "+users.filter(u=>u.status==="disabled").length+" disabled"}
        tools={<>
          <SegmentedControl options={["Everyone","Active","Disabled"]} value={filter} onChange={setFilter}/>
          <ASearch value={q} onChange={setQ} placeholder="Search name or email"/>
        </>}/>
      <ABody>
        <AStats>
          <AStat label="Accounts" value={(AD.costs.accounts).toLocaleString("en-GB")}/>
          <AStat label="Used it this week" value={(AD.costs.activeAccounts).toLocaleString("en-GB")} note="69% of accounts"/>
          <AStat label="Disabled" value={users.filter(u=>u.status==="disabled").length}/>
          <AStat label="Average spend" value={money(AD.costs.perUserAvg)} note="per account, last 30 days"/>
        </AStats>
        <ATable cols={cols}>
          {list.map((u,i)=>(
            <ARow key={u.id} cols={cols} last={i===list.length-1} muted={u.status==="disabled"}
              cells={[
                <span>
                  <b style={{display:"block",fontWeight:500}}>{u.name}</b>
                  <AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{u.email}</span></AQuiet>
                </span>,
                <AQuiet>{u.provider}</AQuiet>,
                <AMono>{u.threads}</AMono>,
                <AQuiet>{u.active}</AQuiet>,
                <AMono bold={u.spend>10}>{money(u.spend)}</AMono>,
                <AStatus value={u.status}/>,
                <span style={{display:"flex",gap:"var(--space-2)",justifyContent:"flex-end"}}>
                  {u.status==="active"
                    ?<Button variant="ghost" size="sm" onClick={()=>setAsk({kind:"disable",u})}>Disable</Button>
                    :<Button variant="secondary" size="sm" onClick={()=>{set(u.id,{status:"active"});say(u.name+" is active again")}}>Enable</Button>}
                  <ADanger onClick={()=>setAsk({kind:"delete",u})}>Delete</ADanger>
                </span>
              ]}/>
          ))}
        </ATable>
        <ASection note="the two that cannot be undone from here">What these do</ASection>
        <ul style={{margin:0,padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:8,maxWidth:"78ch"}}>
          {["Disable signs the account out everywhere and refuses new sign-ins. Nothing is deleted and threads shared with other people stay readable for them. Reversible from this row.",
            "Delete removes the account, its threads, its memories and its conversations inside 24 hours, and cannot be undone. Anything the person shared into someone else's thread stays with that thread.",
            "Neither action emails the person. If they should be told, support writes to them."]
            .map(t=><li key={t} style={{display:"flex",gap:10,font:"var(--text-body-sm-role)",lineHeight:1.55,color:"var(--text-secondary)"}}>
              <span style={{color:"var(--text-tertiary)"}}>·</span>{t}</li>)}
        </ul>
      </ABody>
      {ask&&ask.kind==="disable"?(
        <AConfirm title={"Disable "+ask.u.name+"?"}
          body="They are signed out everywhere and cannot sign in again until you enable them. Nothing is deleted."
          confirmLabel="Disable" onClose={()=>setAsk(null)}
          onConfirm={()=>{set(ask.u.id,{status:"disabled"});say(ask.u.name+" is disabled")}}/>
      ):null}
      {ask&&ask.kind==="delete"?(
        <AConfirm danger title={"Delete "+ask.u.name+"?"} confirmWord={ask.u.email} confirmLabel="Delete account"
          body={"This removes the account and everything in it: "+ask.u.threads+" threads, their memories and every conversation. It happens inside 24 hours and cannot be undone."}
          onClose={()=>setAsk(null)}
          onConfirm={()=>{setUsers(us=>us.filter(x=>x.id!==ask.u.id));say(ask.u.name+" will be deleted within 24 hours")}}/>
      ):null}
    </>
  );
}

/* 3 · Costs. What the platform spends, by the job offload is doing rather than by model
   name, because the question is always "which feature is expensive". */
function CostsPage(){
  const C=AD.costs;
  const max=Math.max(...C.byJob.map(j=>j.spend));
  const dayMax=Math.max(...C.days);
  const pace=C.spend/25*31;
  const cols=[{label:"What it pays for"},{label:"Calls",w:90,right:true},{label:"Spend",w:100,right:true},{label:"Share",w:180}];
  return (
    <>
      <APaneHead title="Costs" sub={C.monthLabel+" · every figure is inference, not hosting"}
        tools={<Button variant="secondary" size="sm" icon="archive">Export CSV</Button>}/>
      <ABody>
        <AStats>
          <AStat label="Spent this month" value={money0(C.spend)} note={"budget "+money0(C.budget)}/>
          <AStat label="On pace for" value={money0(pace)} tone={pace>C.budget?"attention":undefined}
            note={pace>C.budget?"over budget by "+money0(pace-C.budget):"inside budget"}/>
          <AStat label="Per account" value={money(C.perUserAvg)} note="all accounts, not just active"/>
          <AStat label="Last month" value={money0(C.lastMonth)} note="+14% month on month"/>
        </AStats>
        <div style={{padding:"var(--space-5) var(--space-6)",border:"1px solid var(--border-hairline)",
          borderRadius:"var(--radius-md)",background:"var(--surface-raised)"}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between"}}>
            <b style={{font:"var(--weight-medium) 14px/1 var(--font-core)"}}>Daily spend</b>
            <AQuiet><span style={{fontSize:12.5}}>1 to 25 August · cap £120 a day</span></AQuiet>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:96,marginTop:"var(--space-5)"}}>
            {C.days.map((d,i)=>(
              <span key={i} title={"Day "+(i+1)+": £"+d} style={{flex:1,height:Math.round((d/dayMax)*96),
                borderRadius:"var(--radius-xs) var(--radius-xs) 0 0",
                background:d>=100?"var(--blue-600)":"var(--moss-500)"}}/>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8,font:"var(--text-caption-role)",
            color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums"}}>
            <span>1 Aug</span><span>Blue days went over £100</span><span>25 Aug</span>
          </div>
        </div>
        <ASection note="by the job, not the model">Where it goes</ASection>
        <ATable cols={cols}>
          {C.byJob.map((j,i)=>(
            <ARow key={j.name} cols={cols} last={i===C.byJob.length-1}
              cells={[
                <span><b style={{display:"block",fontWeight:500}}>{j.name}</b>
                  <AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{j.note}</span></AQuiet></span>,
                <AQuiet>{j.calls}</AQuiet>,
                <AMono bold>{money0(j.spend)}</AMono>,
                <span style={{display:"block",paddingRight:"var(--space-4)"}}><ABar value={j.spend} total={max}/></span>
              ]}/>
          ))}
        </ATable>
        <ASection note="last 30 days">Heaviest accounts</ASection>
        <ATable cols={[{label:"Person"},{label:"Spend",w:100,right:true},{label:"Share of the top four",w:180}]}>
          {C.topSpenders.map((t,i)=>(
            <ARow key={t.id} cols={[{},{w:100,right:true},{w:180}]} last={i===C.topSpenders.length-1}
              cells={[
                <span><b style={{display:"block",fontWeight:500}}>{t.name}</b>
                  <AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{t.note}</span></AQuiet></span>,
                <AMono bold>{money(t.spend)}</AMono>,
                <span style={{display:"block",paddingRight:"var(--space-4)"}}>
                  <ABar value={t.spend} total={C.topSpenders[0].spend} tone={t.spend>25?"attention":undefined}/></span>
              ]}/>
          ))}
        </ATable>
      </ABody>
    </>
  );
}

/* 4 · Limits. Two caps and one decision about what happens when they are hit. */
const AT_CAP=[
  ["Slow down","Requests queue and answers get slower. Nothing fails, nothing is lost."],
  ["Cheaper model","Keep answering, on the small model, until the day resets."],
  ["Stop","Refuse new calls and tell the person offload is resting. Dumps are still saved."]
];
function LimitsPage({say}){
  const L=AD.limits;
  const [platform,setPlatform]=React.useState(String(L.platformDaily));
  const [userDay,setUserDay]=React.useState(String(L.userDaily));
  const [userMonth,setUserMonth]=React.useState(String(L.userMonthly));
  const [batch,setBatch]=React.useState(String(AD.waitlist.weekly));
  const [atCap,setAtCap]=React.useState(L.atCap);
  const [alertAt,setAlertAt]=React.useState(String(L.alertAt));
  const [dirty,setDirty]=React.useState(false);
  const touch=(fn)=>(v)=>{fn(v);setDirty(true)};
  const used=Math.round((L.platformUsed/Number(platform||1))*100);
  const cols=[{label:"What happened"},{label:"Who",w:120},{label:"When",w:80},{label:"What we did",w:170}];
  return (
    <>
      <APaneHead title="Limits" sub="Caps are per day and reset at midnight UTC"
        tools={dirty?<>
          <Button variant="ghost" size="sm" onClick={()=>{setDirty(false);say("Changes discarded")}}>Discard</Button>
          <Button variant="primary" size="sm" onClick={()=>{setDirty(false);say("Limits saved")}}>Save changes</Button>
        </>:<AQuiet><span style={{fontSize:12.5}}>Saved</span></AQuiet>}/>
      <ABody>
        <AStats>
          <AStat label="Spent today" value={money(L.platformUsed)} tone={used>=L.alertAt?"attention":undefined}
            note={used+"% of the daily cap"}/>
          <AStat label="Daily cap" value={money0(Number(platform||0))}/>
          <AStat label="Per person, per day" value={money(Number(userDay||0))}/>
          <AStat label="Per person, per month" value={money0(Number(userMonth||0))}/>
        </AStats>
        <div style={{border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-md)",
          background:"var(--surface-raised)",padding:"var(--space-6)"}}>
          <div style={{display:"flex",gap:"var(--space-6)",flexWrap:"wrap"}}>
            <AField label="Platform, per day" prefix="£" value={platform} onChange={touch(setPlatform)}
              hint="Everything offload spends on inference in a day"/>
            <AField label="One person, per day" prefix="£" value={userDay} onChange={touch(setUserDay)}
              hint="Roughly 40 answers, or 900 dumps"/>
            <AField label="One person, per month" prefix="£" value={userMonth} onChange={touch(setUserMonth)}
              hint="Whichever cap is reached first applies"/>
            <AField label="Waitlist batch, per week" value={batch} onChange={touch(setBatch)}
              hint="How many invites go out on Mondays"/>
            <AField label="Warn at" prefix="%" value={alertAt} onChange={touch(setAlertAt)} width={110}
              hint="Of any cap"/>
          </div>
        </div>
        <ASection note="the same choice for both caps">When a cap is reached</ASection>
        <div style={{display:"flex",flexDirection:"column",gap:"var(--space-3)",maxWidth:"72ch"}}>
          {AT_CAP.map(([name,note])=>{
            const on=atCap===name;
            return (
              <button key={name} type="button" onClick={()=>{setAtCap(name);setDirty(true)}}
                style={{display:"flex",gap:"var(--space-4)",alignItems:"flex-start",textAlign:"left",cursor:"pointer",
                  padding:"var(--space-5)",borderRadius:"var(--radius-md)",background:"var(--surface-raised)",
                  border:"1px solid "+(on?"var(--ink-950)":"var(--border-hairline)")}}>
                <span style={{width:18,height:18,flex:"0 0 auto",marginTop:1,borderRadius:"var(--radius-pill)",
                  border:"1.5px solid "+(on?"var(--ink-950)":"var(--border-strong)"),display:"flex",
                  alignItems:"center",justifyContent:"center"}}>
                  {on?<span style={{width:9,height:9,borderRadius:"var(--radius-pill)",background:"var(--ink-950)"}}/>:null}
                </span>
                <span>
                  <b style={{display:"block",font:"var(--weight-medium) 15px/1.3 var(--font-core)"}}>{name}</b>
                  <span style={{display:"block",font:"var(--text-body-sm-role)",color:"var(--text-secondary)",
                    marginTop:4,lineHeight:1.5}}>{note}</span>
                </span>
              </button>
            );
          })}
        </div>
        <ASection note="ops gets an email and a Slack line">Who hears about it</ASection>
        <div style={{display:"flex",gap:"var(--space-2)",flexWrap:"wrap"}}>
          {L.alertWho.map(a=><Chip key={a} tone="outline" icon="bell">{a}</Chip>)}
          <Chip tone="outline" icon="plus" onClick={()=>say("Not wired in this prototype")}>Add someone</Chip>
        </div>
        <ASection note="last 30 days">What has been hit</ASection>
        <ATable cols={cols}>
          {L.breaches.map((b,i)=>(
            <ARow key={i} cols={cols} last={i===L.breaches.length-1}
              cells={[<span style={{fontWeight:500}}>{b.what}</span>,<AQuiet>{b.who}</AQuiet>,
                <AQuiet>{b.when}</AQuiet>,<AQuiet>{b.action}</AQuiet>]}/>
          ))}
        </ATable>
      </ABody>
    </>
  );
}


/* 5 · Staff. Who can get in here. Two roles, and the only difference between them is money:
   support does the day job, an owner can also see costs and change limits. Every guard is
   the same one, stated once: there has to be an owner, and you cannot edit yourself out. */
function StaffPage({say}){
  const [staff,setStaff]=React.useState(AD.admins);
  const [ask,setAsk]=React.useState(null);
  const [adding,setAdding]=React.useState(false);
  const [form,setForm]=React.useState({name:"",email:"",role:"Support"});
  const owners=staff.filter(s=>s.role==="Owner").length;
  const cols=[{label:"Person"},{label:"Role",w:170},{label:"Added",w:80},{label:"Last here",w:96,right:true},
    {label:"",w:150,right:true}];
  function setRole(s,role){
    if(s.you){say("Ask the other owner to change your role");return}
    if(s.role==="Owner"&&role==="Support"&&owners<2){say("Keep at least one owner");return}
    setStaff(v=>v.map(x=>x.id===s.id?{...x,role}:x));
    say(s.you?"You are now "+role.toLowerCase():s.name.split(" ")[0]+" is now "+role.toLowerCase());
  }
  function add(){
    const email=form.email.trim();
    if(!email||email.indexOf("@")<1){say("That email does not look right");return}
    if(staff.some(s=>s.email===email)){say("They are already staff");return}
    setStaff(v=>v.concat({id:"a"+Date.now(),name:form.name.trim()||email.split("@")[0],email,role:form.role,
      added:AD.today.replace("Tue ",""),active:"never"}));
    setAdding(false);setForm({name:"",email:"",role:"Support"});
    say("Added, and told them by email");
  }
  return (
    <>
      <APaneHead title="Staff" sub={staff.length+" people can open this panel · "+owners+" owner"+(owners===1?"":"s")}
        tools={<Button variant="primary" size="sm" icon="plus" onClick={()=>setAdding(true)}>Add someone</Button>}/>
      <ABody>
        <ATable cols={cols}>
          {staff.map((s,i)=>(
            <ARow key={s.id} cols={cols} last={i===staff.length-1}
              cells={[
                <span>
                  <b style={{display:"block",fontWeight:500}}>{s.name}{s.you?<AQuiet><span style={{fontWeight:400}}> · you</span></AQuiet>:null}</b>
                  <AQuiet><span style={{display:"block",fontSize:12.5,marginTop:2}}>{s.email}</span></AQuiet>
                </span>,
                s.you
                  ?<span style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{height:28,padding:"0 11px",borderRadius:"var(--radius-pill)",display:"inline-flex",
                      alignItems:"center",background:"var(--ink-950)",color:"var(--text-inverse)",
                      font:"var(--weight-medium) 12.5px/1 var(--font-core)"}}>{s.role}</span>
                    <AQuiet><span style={{fontSize:12}}>fixed</span></AQuiet>
                  </span>
                  :<span style={{display:"flex",gap:6}}>
                    {["Owner","Support"].map(r=>{
                      const on=s.role===r;
                      return <button key={r} type="button" onClick={()=>on?null:setRole(s,r)}
                        style={{height:28,padding:"0 11px",borderRadius:"var(--radius-pill)",cursor:on?"default":"pointer",
                          border:"1px solid "+(on?"var(--ink-950)":"var(--border-hairline)"),
                          background:on?"var(--ink-950)":"transparent",
                          color:on?"var(--text-inverse)":"var(--text-secondary)",
                          font:"var(--weight-medium) 12.5px/1 var(--font-core)"}}>{r}</button>;
                    })}
                  </span>,
                <AQuiet>{s.added}</AQuiet>,
                <AQuiet>{s.active}</AQuiet>,
                s.you
                  ?<AQuiet><span style={{fontSize:12.5}}>you cannot remove yourself</span></AQuiet>
                  :<ADanger onClick={()=>setAsk(s)}>Remove</ADanger>
              ]}/>
          ))}
        </ATable>
        <ASection note="the difference is money">What the two roles can do</ASection>
        <ATable cols={[{label:"Role",w:120},{label:"Can"}]}>
          {AD.roles.map((r,i)=>(
            <ARow key={r.name} cols={[{w:120},{}]} last={i===AD.roles.length-1}
              cells={[<span style={{fontWeight:500}}>{r.name}</span>,<AQuiet>{r.can}</AQuiet>]}/>
          ))}
        </ATable>
        <ASection>Rules</ASection>
        <ul style={{margin:0,padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:8,maxWidth:"78ch"}}>
          {["Staff sign in with Apple or Google on an offload.app address, like everyone else. Adding someone here does not create a password.",
            "There is always at least one owner. The last one cannot be demoted or removed.",
            "You cannot remove or demote yourself: your own role is fixed here and the remove is not offered. Ask the other owner.",
            "Removing someone signs them out of this panel immediately. Their own offload account, if they have one, is untouched.",
            "Support never sees Costs or Limits: those two pages are not in their nav at all, rather than shown and refused."]
            .map(t=><li key={t} style={{display:"flex",gap:10,font:"var(--text-body-sm-role)",lineHeight:1.55,color:"var(--text-secondary)"}}>
              <span style={{color:"var(--text-tertiary)"}}>·</span>{t}</li>)}
        </ul>
      </ABody>
      {adding?(
        <>
          <div onClick={()=>setAdding(false)} style={{position:"absolute",inset:0,zIndex:40,background:"var(--surface-scrim)"}}/>
          <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:460,zIndex:41,
            boxSizing:"border-box",padding:"var(--space-7)",borderRadius:"var(--radius-xl)",
            background:"var(--surface-raised)",boxShadow:"var(--shadow-sheet)"}}>
            <div style={{font:"var(--weight-semibold) 21px/1.2 var(--font-core)",letterSpacing:"-0.012em"}}>Add someone to staff</div>
            <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:"var(--space-3)",lineHeight:1.5}}>
              They sign in with the provider on this address. We email them a note saying they have access.</div>
            <div style={{display:"flex",flexDirection:"column",gap:"var(--space-4)",marginTop:"var(--space-6)"}}>
              <AField label="Email" value={form.email} onChange={(v)=>setForm(f=>({...f,email:v}))} width="100%"
                hint="An offload.app address"/>
              <AField label="Name" value={form.name} onChange={(v)=>setForm(f=>({...f,name:v}))} width="100%"
                hint="Optional, we use the address if you leave it"/>
              <span style={{display:"flex",flexDirection:"column",gap:6}}>
                <span style={{font:"var(--text-label-role)",color:"var(--text-secondary)"}}>Role</span>
                <SegmentedControl options={["Support","Owner"]} value={form.role}
                  onChange={(v)=>setForm(f=>({...f,role:v}))}/>
              </span>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:"var(--space-3)",marginTop:"var(--space-6)"}}>
              <Button variant="ghost" size="md" onClick={()=>setAdding(false)}>Cancel</Button>
              <Button variant="primary" size="md" onClick={add}>Add to staff</Button>
            </div>
          </div>
        </>
      ):null}
      {ask?(
        <AConfirm danger title={"Remove "+ask.name+"?"} confirmLabel="Remove"
          body={"They lose this panel straight away. Their own offload account is untouched, and nothing they did here is undone."}
          onClose={()=>setAsk(null)}
          onConfirm={()=>{
            if(ask.role==="Owner"&&owners<2){say("Keep at least one owner");return}
            setStaff(v=>v.filter(x=>x.id!==ask.id));say(ask.name.split(" ")[0]+" no longer has access");
          }}/>
      ):null}
    </>
  );
}

function AdminApp(){
  const [page,setPage]=React.useState("waitlist");
  const [toast,setToast]=React.useState(null);
  const timer=React.useRef(null);
  function say(message){
    clearTimeout(timer.current);
    setToast(message);
    timer.current=setTimeout(()=>setToast(null),8000);
  }
  const body=page==="waitlist"?<WaitlistPage say={say}/>
    :page==="people"?<PeoplePage say={say}/>
    :page==="staff"?<StaffPage say={say}/>
    :page==="costs"?<CostsPage/>
    :<LimitsPage say={say}/>;
  return (
    <div data-theme="light" style={{width:1440,height:900,display:"flex",overflow:"hidden",position:"relative",
      borderRadius:"var(--radius-lg)",background:"var(--surface-page)",color:"var(--text-primary)",
      border:"1px solid var(--border-hairline)",boxShadow:"var(--shadow-3)"}}>
      <ASideNav page={page} onPage={(p)=>{setPage(p);setToast(null)}}/>
      <div key={page} style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",
        animation:"a-fade 200ms var(--ease-out) both"}}>{body}</div>
      {toast?<div style={{position:"absolute",left:232,right:0,bottom:26,display:"flex",justifyContent:"center",zIndex:30}}>
        <Toast message={toast}/></div>:null}
    </div>
  );
}
Object.assign(window,{AdminApp,WaitlistPage,PeoplePage,StaffPage,CostsPage,LimitsPage});
