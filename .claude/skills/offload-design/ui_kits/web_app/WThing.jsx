const { Icon, IconButton, Badge, Button, Chip } = OFFLOAD_DS;

/* Lisbon is the fully written thread; the rest live in contents. A thread with no entry
   renders an honest empty state rather than borrowing another thread's rows. */
function threadContent(id){return id==="lisbon"?D.lisbon:(D.contents&&D.contents[id])||null;}
function threadStanding(id){return D.standing&&D.standing[id];}

function WWrote({when}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,color:"var(--text-tertiary)",marginTop:"var(--space-4)"}}>
      <Icon name="sparkles" size={13}/>offload wrote this, {String(when||"").replace("updated ","")}
    </div>
  );
}

function WThing({id,open,onOpenPerson,onShare}){
  const t=D.spaces.find(s=>s.id===id)||D.spaces[0];
  const c=threadContent(t.id),st=threadStanding(t.id);
  const tasks=(c&&c.tasks)||[],notes=(c&&c.notes)||[];
  const [done,setDone]=React.useState({});
  const openTasks=tasks.filter(x=>!(done[x.id]!==undefined?done[x.id]:x.done));
  return (
    <>
      {/* Who is already in, then the share control: the same order as the phones. */}
      <WPaneHead title={t.name} sub={t.meta}
        aside={<WFaces people={t.people} onShare={onShare} onOpenPerson={onOpenPerson}/>}
        tools={[["maximize-2","Open full"],["ellipsis","More"]]}/>
      <WBody>
        {st?<>
          <div style={{font:"var(--text-quiet-role)",fontSize:15.5,lineHeight:1.5,marginTop:"var(--space-4)",maxWidth:"58ch"}}>{st.text}</div>
          <WWrote when={st.updated}/>
        </>:null}
        {tasks.length?<>
          <WSection count={openTasks.length}>To do</WSection>
          {tasks.map((x,i)=>{
            const isDone=done[x.id]!==undefined?done[x.id]:x.done;
            /* A finished task keeps its place and its contrast: the tick, tertiary ink and
               a 1px strike say it. Dimming a row on a warm page reads as a rendering fault
               and takes the label under the contrast floor with it. */
            return <div key={x.id}>
              <WRow noTile check done={isDone} onToggle={()=>setDone(d=>({...d,[x.id]:!isDone}))}
                title={x.label} meta={x.meta} tools={["pencil","trash-2"]}
                last={i===tasks.length-1}
                onClick={()=>open({kind:"task",id:x.id,thread:t.name,threadId:t.id,label:x.label,meta:x.meta})}/>
            </div>;
          })}
        </>:null}
        {notes.length?<>
          <WSection count={t.count} tone="accent" action="See all">Everything in here</WSection>
          {notes.map((n,i)=>(
            <WRow key={n.id} icon={n.icon} title={n.title} meta={n.meta} tools={["archive","trash-2"]}
              last={i===notes.length-1}
              onClick={()=>open({kind:"task",id:n.id,thread:t.name,threadId:t.id,label:n.title,meta:n.meta})}/>
          ))}
        </>:(
          <div style={{padding:"var(--space-8) 0",color:"var(--text-tertiary)",fontSize:14}}>
            Nothing written up for this one yet. It has {t.count} things in it.
          </div>
        )}
      </WBody>
    </>
  );
}

/* Anything inside a thread opens as its own pane, so a task is a place too. */
function WTask({item,open}){
  const t=D.spaces.find(s=>s.id===item.threadId)||D.spaces.find(s=>s.name===item.thread);
  const c=t?threadContent(t.id):null;
  const sources=((c&&c.notes)||[]).slice(0,3);
  return (
    <>
      <WPaneHead title={item.label||item.title} sub={item.meta}
        tools={[["maximize-2","Open full"],["check","Mark done"],["ellipsis","More"]]}/>
      <WBody>
        {t?<div style={{marginTop:"var(--space-4)"}}>
          <Chip tone="accent" icon="lasso" onClick={()=>open({kind:"thread",id:t.id})}>{t.name}</Chip>
        </div>:null}
        {sources.length?<>
          <WSection count={sources.length}>Where this came from</WSection>
          {sources.map((n,i)=><WRow key={n.id} icon={n.icon} title={n.title} meta={n.meta} last={i===sources.length-1}/>)}
        </>:null}
      </WBody>
    </>
  );
}

Object.assign(window,{WThing,WTask,WWrote,threadContent,threadStanding});
