const { Icon, IconButton, Button, Checkbox, Chip } = OFFLOAD_DS;

/* Sharing on web. Same mechanism and the same copy as the phones: search, your common
   connections, and a last row that makes a new connection rather than sending an invite.
   It is a modal, not a pane, because sharing is not a place you navigate to. Connections
   only, so there is no public link anywhere. */
const W_PERM="They can add to it, and they can never delete what is yours.";
function wConnections(){
  const people=D.people||{};
  return Object.keys(people).map(k=>people[k]);
}
function WAvatar({initials,size=34,tone}){
  return (
    <span style={{width:size,height:size,flex:"0 0 auto",borderRadius:"var(--radius-pill)",display:"flex",
      alignItems:"center",justifyContent:"center",font:"var(--weight-medium) "+Math.round(size*0.36)+"px/1 var(--font-core)",
      background:tone==="accent"?"var(--moss-600)":"var(--surface-fill)",
      color:tone==="accent"?"var(--text-on-solid)":"var(--text-secondary)"}}>{initials}</span>
  );
}
function WFaces({people=[],onShare,onOpenPerson}){
  const map={Ana:"AD",Tom:"TR",Sam:"SO"};
  return (
    <span style={{display:"flex",alignItems:"center",gap:"var(--space-4)"}}>
      {people.length?<span style={{display:"flex"}}>
        {people.map((p,i)=><span key={p} title={p} onClick={()=>onOpenPerson&&onOpenPerson(p)}
          style={{marginLeft:i?-8:0,boxShadow:"0 0 0 2px var(--surface-page)",borderRadius:99,cursor:onOpenPerson?"pointer":"default"}}>
          <WAvatar initials={map[p]||p.slice(0,2).toUpperCase()}/></span>)}
      </span>:null}
      <Button variant="secondary" size="sm" icon="share-2" onClick={onShare}>Share</Button>
    </span>
  );
}
function WModal({children,onClose,width=460}){
  return (
    <>
      <div onClick={onClose} style={{position:"absolute",inset:0,zIndex:40,background:"var(--surface-scrim)"}}/>
      <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width,zIndex:41,
        boxSizing:"border-box",padding:"var(--space-7)",borderRadius:"var(--radius-xl)",
        background:"var(--surface-raised)",boxShadow:"var(--shadow-sheet)",
        animation:"w-rise 220ms var(--ease-out) both"}}>{children}</div>
    </>
  );
}
function WFind({value,onChange}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",height:42,padding:"0 var(--space-5)",
      borderRadius:"var(--radius-pill)",background:"var(--surface-fill)",marginTop:"var(--space-6)"}}>
      <Icon name="search" size={15} style={{color:"var(--text-tertiary)"}}/>
      <input autoFocus value={value} onChange={(e)=>onChange(e.target.value)} placeholder="Search your connections"
        style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",
          font:"var(--text-body-sm-role)",fontSize:14.5,color:"var(--text-primary)"}}/>
    </div>
  );
}
function WPickRow({initials,title,meta,trailing,onClick,last}){
  const [h,setH]=React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-3) var(--space-3)",
        margin:"0 calc(var(--space-3) * -1)",borderRadius:"var(--radius-sm)",cursor:onClick?"pointer":"default",
        background:h&&onClick?"var(--state-hover)":"transparent",
        boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
      <WAvatar initials={initials}/>
      <span style={{flex:1,minWidth:0}}>
        <b style={{display:"block",font:"var(--weight-medium) 14.5px/1.3 var(--font-core)"}}>{title}</b>
        {meta?<span style={{display:"block",fontSize:12.5,color:"var(--text-tertiary)",marginTop:2}}>{meta}</span>:null}
      </span>
      {trailing}
    </div>
  );
}

function WShareModal({thingName="Lisbon trip",already=["Ana","Tom"],onClose,onShared}){
  const [q,setQ]=React.useState("");
  const [picked,setPicked]=React.useState(already);
  const [step,setStep]=React.useState("list");
  const [handle,setHandle]=React.useState("");
  const all=wConnections();
  const list=q?all.filter(p=>p.name.toLowerCase().indexOf(q.toLowerCase())>-1):all;
  const added=picked.filter(id=>already.indexOf(id)<0).map(id=>((all.find(p=>p.id===id)||{}).name||id).split(" ")[0]);
  if(step==="new")return (
    <WModal onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",marginBottom:"var(--space-3)"}}>
        <IconButton icon="chevron-left" label="Back" size="sm" variant="quiet" onClick={()=>setStep("list")}/>
        <b style={{font:"var(--weight-semibold) 21px/1.2 var(--font-core)",letterSpacing:"-0.012em"}}>New connection</b>
      </div>
      <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",lineHeight:1.5}}>
        They need an offload account already. Sharing does not invite anyone in.</div>
      <input autoFocus value={handle} onChange={(e)=>setHandle(e.target.value)} placeholder="ana@duarte.pt"
        style={{width:"100%",boxSizing:"border-box",height:44,margin:"var(--space-6) 0 var(--space-4)",
          padding:"0 var(--space-5)",borderRadius:"var(--radius-md)",border:"1px solid var(--border-strong)",
          background:"var(--surface-page)",font:"var(--text-body-role)",color:"var(--text-primary)"}}/>
      <div style={{font:"var(--text-caption-role)",color:"var(--text-tertiary)",lineHeight:1.45}}>
        A connection is mutual once they accept, and it outlives the thing you made it for.</div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:"var(--space-3)",marginTop:"var(--space-6)"}}>
        <Button variant="ghost" size="md" onClick={()=>setStep("list")}>Cancel</Button>
        <Button variant="primary" size="md" disabled={!handle.trim()} onClick={()=>setStep("list")}>Add connection</Button>
      </div>
    </WModal>
  );
  return (
    <WModal onClose={onClose}>
      <b style={{display:"block",font:"var(--weight-semibold) 21px/1.2 var(--font-core)",letterSpacing:"-0.012em"}}>
        {"Share "+thingName}</b>
      <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:"var(--space-3)"}}>
        Everyone in here sees everything in it.</div>
      <WFind value={q} onChange={setQ}/>
      <div style={{marginTop:"var(--space-4)"}}>
        {list.map((p,i)=>{
          const on=picked.indexOf(p.id)>-1,locked=already.indexOf(p.id)>-1;
          return <WPickRow key={p.id} initials={p.initials} title={p.name} meta={locked?"already in":p.meta}
            onClick={locked?undefined:()=>setPicked(v=>on?v.filter(x=>x!==p.id):v.concat(p.id))}
            trailing={<Checkbox checked={on} disabled={locked} onChange={()=>{}}/>}/>;
        })}
        {q?null:<WPickRow last initials={<Icon name="plus" size={16}/>} title="New connection"
          onClick={()=>setStep("new")} trailing={<Icon name="chevron-right" size={15} style={{color:"var(--text-tertiary)"}}/>}/>}
      </div>
      <div style={{font:"var(--text-caption-role)",fontSize:12.5,color:"var(--text-secondary)",lineHeight:1.45,
        marginTop:"var(--space-5)"}}>{W_PERM}</div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:"var(--space-3)",marginTop:"var(--space-6)"}}>
        <Button variant="ghost" size="md" onClick={onClose}>{added.length?"Cancel":"Done"}</Button>
        {added.length?<Button variant="primary" size="md"
          onClick={()=>{onShared&&onShared(added);onClose&&onClose()}}>{"Share with "+added.join(" and ")}</Button>:null}
      </div>
    </WModal>
  );
}

/* @ opens the same list, in the composer and in any other field. */
function WMentions({query="",onPick}){
  const all=wConnections();
  const list=(query?all.filter(p=>p.name.toLowerCase().indexOf(query.toLowerCase())>-1):all).slice(0,3);
  if(!list.length)return null;
  return (
    <div style={{flex:"0 0 auto",margin:"0 var(--space-3) var(--space-3)",padding:"var(--space-2) var(--space-5)",
      borderRadius:"var(--radius-lg)",background:"var(--surface-page)",border:"1px solid var(--border-hairline)"}}>
      {list.map((p,i)=><WPickRow key={p.id} last={i===list.length-1} initials={p.initials} title={p.name} meta={p.meta}
        onClick={()=>onPick&&onPick(p)}/>)}
    </div>
  );
}

/* Receiving. Ask me first is the default, so an invitation is a decision with a preview,
   and one left alone waits at the top of My threads. */
function WPendingInvite({from="Ana",thing="Lisbon trip",initials="AD",onOpen}){
  return (
    <div onClick={onOpen} style={{display:"flex",alignItems:"center",gap:"var(--space-4)",cursor:"pointer",
      padding:"var(--space-4) var(--space-5)",borderRadius:"var(--radius-lg)",background:"var(--surface-accent-soft)",
      marginTop:"var(--space-5)",maxWidth:"60ch"}}>
      <WAvatar initials={initials} size={28} tone="accent"/>
      <b style={{flex:1,minWidth:0,font:"var(--weight-medium) 15px/1.3 var(--font-core)"}}>{from+" shared "+thing+" with you"}</b>
      <span style={{font:"var(--weight-medium) 14px/1 var(--font-core)",color:"var(--text-accent)"}}>Look</span>
    </div>
  );
}
function WInviteModal({from="Ana",thing="Lisbon trip",initials="AD",onAccept,onLater}){
  const preview=[["Book the Alfama flat","Ana is on it"],["Flights, 14th to 17th","€214 each"]];
  return (
    <WModal onClose={onLater} width={520}>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)"}}>
        <WAvatar initials={initials} size={40}/>
        <b style={{flex:1,font:"var(--weight-semibold) 21px/1.25 var(--font-core)",letterSpacing:"-0.012em"}}>
          {from+" shared "+thing+" with you"}</b>
      </div>
      <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:"var(--space-4)",lineHeight:1.5}}>
        14 things, four of them still to book. You can add to it, and you cannot delete anything of {from}'s.</div>
      <div style={{marginTop:"var(--space-5)",padding:"0 var(--space-5)",borderRadius:"var(--radius-md)",
        background:"var(--surface-fill)"}}>
        {preview.map(([t,m],i)=>(
          <div key={t} style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-4) 0",
            boxShadow:i?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
            <Icon name="square-check-big" size={16} style={{color:"var(--text-secondary)"}}/>
            <span style={{flex:1,font:"var(--weight-medium) 14.5px/1.3 var(--font-core)"}}>{t}</span>
            <span style={{fontSize:12.5,color:"var(--text-tertiary)"}}>{m}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:"var(--space-3)",marginTop:"var(--space-6)"}}>
        <Button variant="ghost" size="md" onClick={onLater}>Not now</Button>
        <Button variant="primary" size="md" onClick={onAccept}>Add it to my threads</Button>
      </div>
    </WModal>
  );
}

/* Day one on web: Today shows what a dump looks like (WFirstRun in WMisc), and the other
   two destinations stay quiet, one sentence and no button. */
function WQuietEmpty({title,line}){
  return (
    <>
      <WPaneHead big title={title} sub="Nothing in here yet"/>
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",textAlign:"center",padding:"0 var(--space-8)"}}>
        <span style={{opacity:.22}}><OFFLOAD_DS.Logo variant="mark" size={34}/></span>
        <div style={{font:"var(--text-quiet-role)",fontSize:19,lineHeight:1.5,marginTop:"var(--space-6)",maxWidth:"30ch"}}>{line}</div>
      </div>
    </>
  );
}

Object.assign(window,{WShareModal,WMentions,WPendingInvite,WInviteModal,WQuietEmpty,WFaces,WAvatar,WModal,W_PERM});
