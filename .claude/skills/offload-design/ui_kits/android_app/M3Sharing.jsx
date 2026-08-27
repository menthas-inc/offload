const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Sheet, Button, ListRow, Icon, IconButton, Checkbox, TextField } = OFFLOAD_DS;

/* Android sharing. Same mechanism and the same copy as iOS: the search field is 52dp,
   rows are 56dp with circular avatars, the picker card takes Material's 12px radius, and
   the primary is filled blue.

   Sharing. Two ways in, one mechanism: this sheet, or saying it in the composer. You can
   only share with a connection, so the last row makes one rather than sending an invite,
   and there is no public link anywhere in the product. */
function connections(){
  const people=(window.OFFLOAD_DATA&&window.OFFLOAD_DATA.people)||{};
  return Object.keys(people).map(k=>people[k]);
}
const PERM="They can add to it, and they can never delete what is yours.";

function FindField({value,onChange,placeholder="Search your connections"}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",height:52,padding:"0 var(--space-5)",
      borderRadius:"var(--radius-pill)",background:"var(--a-c-high)",marginBottom:"var(--space-2)"}}>
      <Icon name="search" size={15} style={{color:"var(--text-tertiary)"}}/>
      <input value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder}
        style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",
          font:"var(--text-body-sm-role)",fontSize:14.5,letterSpacing:"var(--tracking-body)",color:"var(--text-primary)"}}/>
      {value?<IconButton icon="x" label="Clear" size="sm" variant="quiet" onClick={()=>onChange("")}/>:null}
    </div>
  );
}
function Avatar({initials,size=36,tone}){
  return (
    <span style={{width:size,height:size,flex:"0 0 auto",borderRadius:"var(--radius-pill)",display:"flex",
      alignItems:"center",justifyContent:"center",font:"var(--weight-medium) "+Math.round(size*0.36)+"px/1 var(--font-core)",
      background:tone==="accent"?"var(--moss-600)":"var(--surface-fill)",
      color:tone==="accent"?"var(--text-on-solid)":"var(--text-secondary)"}}>{initials}</span>
  );
}

function ShareSheet({thingName="Lisbon trip",already=["Ana","Tom"],onClose,onShared}){
  const [q,setQ]=React.useState("");
  const [picked,setPicked]=React.useState(already);
  const [step,setStep]=React.useState("list");
  const [handle,setHandle]=React.useState("");
  const all=connections();
  const list=q?all.filter(p=>p.name.toLowerCase().indexOf(q.toLowerCase())>-1):all;
  const added=picked.filter(id=>already.indexOf(id)<0);
  const names=added.map(id=>(all.find(p=>p.id===id)||{}).name||id).map(n=>n.split(" ")[0]);
  if(step==="new")return (
    <Sheet title="New connection" onClose={onClose}
      footer={<><Button variant="secondary" block onClick={()=>setStep("list")}>Back</Button>
        <Button variant="primary" block disabled={!handle.trim()} onClick={()=>setStep("list")}>Add connection</Button></>}>
      <div style={{font:"var(--text-body-sm-role)",color:"var(--text-secondary)",lineHeight:1.45,paddingBottom:"var(--space-5)"}}>
        They need an offload account already. Sharing does not invite anyone in.</div>
      <TextField label="Email or username" value={handle} onChange={setHandle} placeholder="ana@duarte.pt"/>
      <div style={{font:"var(--text-caption-role)",color:"var(--text-tertiary)",lineHeight:1.45,paddingTop:"var(--space-4)"}}>
        A connection is mutual once they accept, and it outlives the thing you made it for.</div>
    </Sheet>
  );
  return (
    <Sheet title={"Share "+thingName} onClose={onClose}
      footer={added.length
        ?<Button variant="primary" block onClick={()=>{onShared&&onShared(names);onClose&&onClose()}}>{"Share with "+names.join(" and ")}</Button>
        :<Button variant="secondary" block onClick={onClose}>Done</Button>}>
      <div style={{font:"var(--text-body-sm-role)",color:"var(--text-secondary)",paddingBottom:"var(--space-4)"}}>
        Everyone in here sees everything in it.</div>
      <FindField value={q} onChange={setQ}/>
      {list.map((p,i)=>{
        const on=picked.indexOf(p.id)>-1;
        const locked=already.indexOf(p.id)>-1;
        return (
          <ListRow key={p.id} border={i<list.length-1} onClick={locked?undefined:()=>setPicked(v=>on?v.filter(x=>x!==p.id):v.concat(p.id))}
            leading={<Avatar initials={p.initials}/>} title={p.name} meta={locked?"already in":p.meta}
            trailing={<Checkbox checked={on} disabled={locked} onChange={()=>{}}/>}/>
        );
      })}
      {q?null:(
        <ListRow border={false} onClick={()=>setStep("new")} chevron
          leading={<Avatar initials={<Icon name="plus" size={17}/>}/>} title="New connection"/>
      )}
      <div style={{display:"flex",gap:"var(--space-3)",alignItems:"flex-start",padding:"var(--space-4) 0 0",
        font:"var(--text-caption-role)",fontSize:12.5,lineHeight:1.45,color:"var(--text-secondary)"}}>{PERM}</div>
    </Sheet>
  );
}

/* @ anywhere you can type. Same list as the sheet, filtered as you keep typing, three rows
   at a time so it never covers what you wrote. */
function MentionList({query="",onPick}){
  const all=connections();
  const list=(query?all.filter(p=>p.name.toLowerCase().indexOf(query.toLowerCase())>-1):all).slice(0,3);
  if(!list.length)return null;
  return (
    <div style={{background:"var(--surface-raised)",borderRadius:12,boxShadow:"0 2px 6px 2px rgba(0,0,0,0.15)",
      padding:"var(--space-2) var(--space-5)",marginBottom:"var(--space-3)"}}>
      {list.map((p,i)=>(
        <ListRow key={p.id} border={i<list.length-1} onClick={()=>onPick&&onPick(p)}
          leading={<Avatar initials={p.initials} size={28}/>} title={p.name} meta={p.meta}/>
      ))}
    </div>
  );
}

/* Receiving. The setting's default is ask me first, so an invite is a decision with a
   preview, and one that is left alone waits at the top of My threads. */
function PendingInvite({from="Ana",thing="Lisbon trip",initials="AD",onOpen}){
  return (
    <button type="button" onClick={onOpen} style={{display:"flex",alignItems:"center",gap:"var(--space-4)",width:"100%",
      textAlign:"left",padding:"var(--space-4) var(--space-5)",marginBottom:"var(--space-4)",cursor:"pointer",
      border:"none",borderRadius:"var(--radius-lg)",background:"var(--surface-accent-soft)",borderRadius:12}}>
      <Avatar initials={initials} size={28} tone="accent"/>
      <span style={{flex:1,minWidth:0,font:"var(--weight-medium) 15px/1.3 var(--font-core)",color:"var(--text-primary)"}}>
        {from} shared {thing}</span>
      <span style={{font:"var(--weight-medium) 14px/1 var(--font-core)",color:"var(--text-accent)"}}>Look</span>
    </button>
  );
}
function InviteScreen({from="Ana",thing="Lisbon trip",initials="AD",onAccept,onLater}){
  const preview=[["Book the Alfama flat","Ana is on it"],["Flights, 14th to 17th","€214 each"]];
  return (
    <>
      <ABar title="Invitation" left={<IconButton icon="x" label="Close" onClick={onLater}/>}/>
      <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"0 var(--gutter-screen)"}}>
        <div style={{textAlign:"center",padding:"var(--space-4) 0 var(--space-6)"}}>
          <span style={{display:"flex",justifyContent:"center"}}><Avatar initials={initials} size={56}/></span>
          <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)",marginTop:"var(--space-5)"}}>
            {from} shared {thing} with you</div>
          <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:"var(--space-3)",lineHeight:1.45}}>
            14 things, four of them still to book. You can add to it, and you cannot delete anything of {from}'s.</div>
        </div>
        <div style={{background:"var(--surface-fill)",borderRadius:"var(--radius-lg)",padding:"0 var(--space-5)"}}>
          {preview.map(([t,m],i)=>(
            <ListRow key={t} border={i<preview.length-1} title={t} meta={m}
              leading={<span style={{width:22,height:22,borderRadius:"var(--radius-pill)",background:"var(--surface-raised)",
                display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}>
                <Icon name="square-check-big" size={13}/></span>}/>
          ))}
        </div>
      </div>
      <div style={{flex:"0 0 auto",padding:"var(--space-5) var(--gutter-screen) var(--space-6)",
        display:"flex",flexDirection:"column",gap:"var(--space-3)"}}>
        <Button variant="primary" size="lg" block onClick={onAccept}>Add it to my threads</Button>
        <Button variant="ghost" size="md" block onClick={onLater}>Not now</Button>
      </div>
    </>
  );
}

Object.assign(window,{ShareSheet,MentionList,PendingInvite,InviteScreen,ShareAvatar:Avatar,FindField,SHARE_PERM:PERM});
