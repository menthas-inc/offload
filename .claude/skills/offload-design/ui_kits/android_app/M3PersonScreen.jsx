const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { IconButton, Badge } = OFFLOAD_DS;

function Avatar({initials,size=52}){
  return (
    <span style={{width:size,height:size,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
      background:"var(--a-c-high)",color:"var(--a-on-var)",display:"flex",alignItems:"center",justifyContent:"center",
      font:"var(--weight-medium) "+Math.round(size*0.34)+"px/1 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"0.01em"}}>{initials}</span>
  );
}

function PersonScreen({person,onBack,onOpenThread,memories,onOpenMemory}){
  /* What offload knows about this person: their own memory plus every memory that
     names them. Derived, so a person never shows a subject that does not mention them. */
  const mem=memories?Object.keys(memories.items).map(id=>({id,...memories.items[id]}))
    .filter(m=>m.person!==person.id&&(m.related||[]).includes(person.id.toLowerCase())):[];
  const waitingOnYou=person.pending.filter(p=>p.who==="waiting on you");
  const waitingOnThem=person.pending.filter(p=>p.who!=="waiting on you");
  return (
    <>
      <ABar left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>}
        right={<IconButton icon="ellipsis" label="More"/>}/>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-6)",
          padding:"var(--space-6) var(--gutter-screen) var(--space-8)"}}>
          <Avatar initials={person.initials}/>
          <div style={{minWidth:0}}>
            <h1 style={{margin:0,font:"var(--text-title-1)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)"}}>{person.name}</h1>
            <div style={{fontSize:"var(--size-body-sm)",color:"var(--a-on-var)",marginTop:2}}>{person.meta}</div>
          </div>
        </div>

        {waitingOnYou.length?(
          <>
            <ASection count={waitingOnYou.length}>Waiting on you</ASection>
            <ACard>{waitingOnYou.map((p,i)=>(
              <ARow key={p.id} border={i<waitingOnYou.length-1} onClick={()=>onOpenThread(threadId(p.thread))}
                leading="clock"
                title={p.title} meta={p.thread}
                trailing={p.due?<ABadge tone="attention">{p.due}</ABadge>:null}/>
            ))}</ACard>
          </>
        ):null}

        {waitingOnThem.length?(
          <>
            <ASection count={waitingOnThem.length}>{"Waiting on "+person.id}</ASection>
            <ACard>{waitingOnThem.map((p,i)=>(
              <ARow key={p.id} border={i<waitingOnThem.length-1} onClick={()=>onOpenThread(threadId(p.thread))}
                leading="clock"
                title={p.title} meta={p.thread} trailing={p.due?<span>{p.due}</span>:null}/>
            ))}</ACard>
          </>
        ):null}

        <ASection count={person.shared.length}>{"Shared with "+person.id}</ASection>
        <ACard>{person.shared.map((s,i)=>(
          <ARow key={s.id} border={i<person.shared.length-1} chevron onClick={()=>onOpenThread(s.id)}
            leading="lasso"
            title={s.name} meta={s.meta}/>
        ))}</ACard>
        {mem.length?(
          <>
            <ASection count={mem.length} action={<button type="button" onClick={()=>{}}
              style={{border:"none",background:"none",padding:0,cursor:"pointer",
                font:"var(--weight-medium) 13px/1 var(--font-core)",color:"var(--a-on-var)"}}>Edit</button>}
              >What offload knows</ASection>
            <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-2)",padding:"0 var(--gutter-screen)"}}>
              {mem.map(m=><MemoryChip key={m.id} item={m} onOpen={onOpenMemory}/>)}
            </div>
          </>
        ):null}
        <div style={{height:"var(--space-9)"}}/>
      </div>
    </>
  );
}

/* The sample data names threads in prose; map them back to ids. */
function threadId(name){
  const map={"Lisbon trip":"lisbon","Bookshelf build":"shelf","Flat admin":"home","Berlin, March":"berlin","Sam's wedding":"wedding"};
  return map[name]||"lisbon";
}

Object.assign(window,{PersonScreen,Avatar});
