const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { AppBar, SectionHeader, ListRow, Icon, IconButton, Badge, Chip } = OFFLOAD_DS;

function Avatar({initials,size=52}){
  return (
    <span style={{width:size,height:size,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
      background:"var(--surface-fill)",color:"var(--text-secondary)",display:"flex",alignItems:"center",justifyContent:"center",
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
      <AppBar border={false} left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>}
        right={<IconButton icon="ellipsis" label="More"/>}/>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-6)",
          padding:"var(--space-6) var(--gutter-screen) var(--space-8)"}}>
          <Avatar initials={person.initials}/>
          <div style={{minWidth:0}}>
            <h1 style={{margin:0,font:"var(--text-title-1)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)"}}>{person.name}</h1>
            <div style={{fontSize:"var(--size-body-sm)",color:"var(--text-secondary)",marginTop:2}}>{person.meta}</div>
          </div>
        </div>

        {waitingOnYou.length?(
          <>
            <SectionHeader count={waitingOnYou.length}>Waiting on you</SectionHeader>
            {waitingOnYou.map((p,i)=>(
              <ListRow key={p.id} border={i<waitingOnYou.length-1} onClick={()=>onOpenThread(threadId(p.thread))}
                leading={<span style={{width:22,height:22,borderRadius:"var(--radius-pill)",background:"var(--surface-attention-soft)",
                  color:"var(--text-attention)",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="clock" size={13}/></span>}
                title={p.title} meta={p.thread}
                trailing={p.due?<Badge tone="attention">{p.due}</Badge>:null}/>
            ))}
          </>
        ):null}

        {waitingOnThem.length?(
          <>
            <SectionHeader count={waitingOnThem.length}>{"Waiting on "+person.id}</SectionHeader>
            {waitingOnThem.map((p,i)=>(
              <ListRow key={p.id} border={i<waitingOnThem.length-1} onClick={()=>onOpenThread(threadId(p.thread))}
                leading={<span style={{color:"var(--text-tertiary)",display:"flex"}}><Icon name="clock" size={18}/></span>}
                title={p.title} meta={p.thread} trailing={p.due?<span>{p.due}</span>:null}/>
            ))}
          </>
        ):null}

        <SectionHeader count={person.shared.length}>{"Shared with "+person.id}</SectionHeader>
        {person.shared.map((s,i)=>(
          <ListRow key={s.id} border={i<person.shared.length-1} chevron onClick={()=>onOpenThread(s.id)}
            leading={<span style={{width:36,height:36,borderRadius:"var(--radius-sm)",background:"var(--surface-fill)",
              display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}><Icon name="lasso" size={18}/></span>}
            title={s.name} meta={s.meta}/>
        ))}
        {mem.length?(
          <>
            <SectionHeader count={mem.length} action={<button type="button" onClick={()=>{}}
              style={{border:"none",background:"none",padding:0,cursor:"pointer",
                font:"var(--weight-medium) 13px/1 var(--font-core)",color:"var(--text-secondary)"}}>Edit</button>}
              alignAction="right">What offload knows</SectionHeader>
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
