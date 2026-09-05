const { Icon, IconButton, Badge, Button, Chip } = OFFLOAD_DS;
const MEM=D.memories;

/* The colour is the legend: blue for what is live, moss for how you like things,
   amber for what offload learned, outline for people. */
const MEMORY_TONE={"Going on":"attention","How you like things":"accent","Noticed":"warning","People":"outline"};
const MEMORY_ORDER=["Going on","How you like things","Noticed","People"];
function memoryList(){
  return Object.keys(MEM.items).map(k=>Object.assign({key:k},MEM.items[k]));
}

function WMemories({open}){
  const all=memoryList();
  return (
    <>
      <WPaneHead big title="Memories" sub={MEM.total+" things offload knows about you"}/>
      <WBody>
        {MEMORY_ORDER.map(g=>{
          const items=all.filter(m=>m.group===g);
          if(!items.length)return null;
          return (
            <React.Fragment key={g}>
              <WSection count={items.length} tone={g==="How you like things"?"accent":null}>{g}</WSection>
              <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-3)",padding:"var(--space-3) 0 var(--space-2)"}}>
                {items.map(m=>(
                  <Chip key={m.key} tone={MEMORY_TONE[g]||"neutral"}
                    icon={m.inferred?"sparkles":null}
                    onClick={()=>open({kind:"memory",id:m.key})}>{m.label}</Chip>
                ))}
              </div>
            </React.Fragment>
          );
        })}
        <WSection action="All conversations" onAction={()=>open({kind:"conversations"})}>Past conversations</WSection>
        {MEM.conversations.slice(0,1).map(g=>g.rows.slice(0,4).map((c,i)=>(
          <WRow key={c.id} icon="message-circle" title={c.title} meta={g.label.toLowerCase()+" \u00b7 "+c.when}
            tools={["archive","trash-2"]} last={i===3}
            onClick={()=>open({kind:"conversation",id:c.id,title:c.title,when:c.when})}/>
        )))}
      </WBody>
    </>
  );
}

function WMemory({id,open,onOpenPerson}){
  const m=MEM.items[id];
  if(!m)return <WBody><div style={{padding:"var(--space-8) 0",color:"var(--text-tertiary)"}}>Nothing known here.</div></WBody>;
  const related=(m.related||[]).map(k=>MEM.items[k]&&Object.assign({key:k},MEM.items[k])).filter(Boolean);
  return (
    <>
      <WPaneHead title={m.label} sub={m.group+" \u00b7 updated "+m.updated}
        tools={[["maximize-2","Open full"],["pencil","Edit"],["trash-2","Forget"]]}/>
      <WBody>
        <div style={{font:"var(--text-quiet-role)",fontSize:15.5,lineHeight:1.5,marginTop:"var(--space-4)",maxWidth:"58ch"}}>{m.blurb}</div>
        <WWrote when={m.updated}/>
        {m.person?<div style={{marginTop:"var(--space-5)"}}>
          <Chip tone="outline" icon="users" onClick={()=>onOpenPerson(m.person)}>Open {m.person}</Chip></div>:null}
        {m.sources&&m.sources.length?<>
          <WSection count={m.sources.length}>Where this came from</WSection>
          {m.sources.map((s,i)=><WRow key={i} icon={s.icon} title={s.title} meta={s.meta} last={i===m.sources.length-1}/>)}
        </>:null}
        {m.threads&&m.threads.length?<>
          <WSection tone="accent">Lives in</WSection>
          {m.threads.map((t,i)=><WRow key={t.id} icon="lasso" title={t.name} meta={t.meta} last={i===m.threads.length-1}
            onClick={()=>open({kind:"thread",id:t.id})}/>)}
        </>:null}
        {related.length?<>
          <WSection>Related</WSection>
          <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-3)",padding:"var(--space-3) 0"}}>
            {related.map(r=><Chip key={r.key} tone={MEMORY_TONE[r.group]||"neutral"}
              onClick={()=>open({kind:"memory",id:r.key})}>{r.label}</Chip>)}
          </div>
        </>:null}
      </WBody>
    </>
  );
}

function WAllConversations({open}){
  return (
    <>
      <WPaneHead big title="All conversations"
        sub={"offload keeps conversations for 60 days, then only what became a memory"}/>
      <WBody>
        {MEM.conversations.map(g=>(
          <React.Fragment key={g.label}>
            <WSection count={g.rows.length}>{g.label}</WSection>
            {g.rows.map((c,i)=>(
              <WRow key={c.id} icon="message-circle" title={c.title} meta={c.when}
                tools={["archive","trash-2"]} last={i===g.rows.length-1}
                onClick={()=>open({kind:"conversation",id:c.id,title:c.title,when:c.when})}/>
            ))}
          </React.Fragment>
        ))}
      </WBody>
    </>
  );
}

Object.assign(window,{WMemories,WMemory,WAllConversations,MEMORY_TONE,MEMORY_ORDER,memoryList});
