const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, IconButton, Checkbox, Chip, EmptyState } = OFFLOAD_DS;

/* Where the thread stands, in offload's own voice. Always the first thing in a
   thread, so you never have to reconstruct it from the list underneath. */
function Standing({space,standing,onOpenPerson,onInvite}){
  return (
    <div style={{padding:"var(--space-7) var(--gutter-screen) var(--space-8)"}}>
      <h1 style={{margin:0,font:"var(--text-title-1)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)"}}>{space.name}</h1>
      <div style={{display:"flex",gap:"var(--space-3)",flexWrap:"wrap",marginTop:"var(--space-5)"}}>
        {space.people.map(p=><Chip key={p} icon="users" onClick={()=>onOpenPerson(p)}>{p}</Chip>)}
        <Chip tone="outline" icon="share-2" onClick={onInvite}>Share</Chip>
      </div>
      <p style={{margin:"var(--space-7) 0 0",font:"var(--text-quiet-role)",fontVariantNumeric:"tabular-nums",fontSize:18,lineHeight:1.5,
        color:"var(--a-on)"}}>{standing.text}</p>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",marginTop:"var(--space-5)",
        color:"var(--a-on-var)"}}>
        {standing.updated==="no summary yet"?null:<Icon name="sparkles" size={13}/>}
        <span style={{fontSize:"var(--size-caption)"}}>
          {standing.updated==="no summary yet"?"offload has not summarised this one yet":"offload wrote this, "+standing.updated}
        </span>
      </div>
    </div>
  );
}

function ThreadScreen({space,notes,tasks,standing,widgets,onBack,onToggle,onMove,onOpenPerson,onShare}){
  return (
    <>
      <ABar left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>}
        right={<><IconButton icon="share-2" label="Share" onClick={onShare}/><IconButton icon="ellipsis" label="More" onClick={onMove}/></>}/>
      <div style={{flex:1,overflowY:"auto"}}>
        {standing?<Standing space={space} standing={standing} onOpenPerson={onOpenPerson} onInvite={onShare}/>:null}
        {(widgets||[]).map(w=>{
          if(w.kind==="map") return <MapWidget key="map" data={w.data}/>;
          if(w.kind==="timeline") return <TimelineWidget key="timeline" data={w.data}/>;
          if(w.kind==="files") return <FilesWidget key="files" data={w.data}/>;
          return null;
        })}
        {tasks.length?(
          <>
            <ASection count={tasks.filter(t=>!t.done).length} style={(widgets||[]).length?null:{paddingTop:0}}>To do</ASection>
            <div style={{padding:"0 var(--gutter-screen) var(--space-6)",display:"flex",flexDirection:"column",gap:"var(--space-6)"}}>
              {tasks.map(t=><Checkbox key={t.id} checked={t.done} onChange={()=>onToggle(t.id)} label={t.label} meta={t.meta}/>)}
            </div>
          </>
        ):null}
        <ASection action={notes.length>3?"See all":null} style={tasks.length||(widgets||[]).length?null:{paddingTop:0}}>Everything in here</ASection>
        {notes.length===0?<EmptyState icon="lasso" title="Not mocked in this kit"
          body="Only Lisbon trip, Bookshelf build and Read later have contents here."/>:null}
        <ACard>{notes.map((n,i)=>(
          <ARow key={n.id} border={i<notes.length-1} onClick={()=>{}}
            leading={n.icon}
            title={n.title} meta={n.meta} trailing={<Icon name="chevron-right" size={16}/>}/>
        ))}</ACard>
        <div style={{height:"var(--space-9)"}}/>
      </div>
    </>
  );
}

Object.assign(window,{ThreadScreen});
