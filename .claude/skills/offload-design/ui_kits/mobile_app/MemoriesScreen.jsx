const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { AppBar, Chip, ListRow, Icon, SectionHeader, IconButton, Logo, Card, Button } = OFFLOAD_DS;
const Swipe=OFFLOAD_DS.SwipeRow||(({children})=>children);

/* One memory, as a chip. Every surface that shows memories uses this, so a chip
   means the same thing on Memories and on a person. */
/* Blue for what is live, moss for how you like things, amber for what offload worked
   out on its own, outline for people. The colour is the legend. */
const MEMORY_TONE={"Going on":"attention","How you like things":"accent","Noticed":"warning","People":"outline"};

function MemoryChip({item,onOpen}){
  const tone=MEMORY_TONE[item.group]||"neutral";
  return <Chip tone={tone} onClick={()=>onOpen(item.id)}>{item.person?<span style={{display:"inline-flex",alignItems:"center",gap:7}}>
    <span style={{width:5,height:5,borderRadius:"var(--radius-pill)",background:"currentColor",opacity:0.45}}/>{item.label}</span>:item.label}</Chip>;
}

function MemoryGroup({label,items,action,onOpen}){
  return (
    <div style={{marginBottom:"var(--space-6)"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:"var(--space-3)"}}>
        <span style={{font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-tertiary)"}}>{label}</span>
        {action?<><span style={{flex:1}}/><button type="button" onClick={action.onClick}
          style={{border:"none",background:"none",padding:0,cursor:"pointer",font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-secondary)"}}>{action.label}</button></>:null}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-2)"}}>
        {items.map(it=><MemoryChip key={it.id} item={it} onOpen={onOpen}/>)}
      </div>
    </div>
  );
}

function MemoriesScreen({data,onOpenMemory,onOpenConversation,onOpenAll,hidden,onDelete,unread,onOpenNotifications,onOpenSettings,barSolid}){
  const M=data;const items=M.items;
  return (
    <>
      <AppBar border={false} style={barSolid?{background:"var(--surface-raised)",backdropFilter:"none",WebkitBackdropFilter:"none"}:{background:"var(--surface-chrome)"}} title={<Logo size={21}/>}
        right={<><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/><IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{padding:"var(--space-6) var(--gutter-screen) 0"}}>
          {M.groups.map((g,i)=>(
            <MemoryGroup key={g.label} label={g.label} onOpen={onOpenMemory}
              action={i===0?{label:"Edit",onClick:()=>{}}:null}
              items={g.items.map(id=>({id,...items[id]}))}/>
          ))}
        </div>
        <SectionHeader>Past conversations</SectionHeader>
        {M.conversations.map(g=>(
          <React.Fragment key={g.label}>
            <div style={{padding:"var(--space-4) var(--gutter-screen) var(--space-2)",
              font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-tertiary)"}}>{g.label}</div>
            {g.rows.filter(r=>!(hidden||[]).includes(r.id)).map((r,i)=><Swipe key={r.id} background="var(--surface-page)" onDelete={()=>onDelete&&onDelete(r.id,"Conversation deleted")}><ListRow border={i<g.rows.length-1} onClick={()=>onOpenConversation(r)}
              title={r.title} meta={r.meta} trailing={<span style={{fontVariantNumeric:"tabular-nums"}}>{r.when}</span>}/></Swipe>)}
          </React.Fragment>
        ))}
        <ListRow border={false} onClick={onOpenAll} chevron title="All conversations"/>
        <div style={{height:"var(--space-8)"}}/>
      </div>
    </>
  );
}

/* A memory opened: what offload holds, then where it got it. The sources are the
   point, so they are rows you can open, not a footnote. */
function MemoryScreen({id,data,onBack,onOpenMemory,onOpenThread,onOpenPerson}){
  const m=data.items[id];if(!m)return null;
  return (
    <>
      <AppBar border={false} left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>}
        right={<IconButton icon="ellipsis" label="More"/>}/>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{padding:"var(--space-4) var(--gutter-screen) var(--space-6)"}}>
          <h1 style={{margin:0,font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)"}}>{m.label}</h1>
          <p style={{margin:"var(--space-4) 0 0",font:"var(--text-quiet-role)",fontSize:17,lineHeight:1.5,color:"var(--text-primary)"}}>{m.blurb}</p>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:"var(--space-4)",
            fontSize:"var(--size-caption)",color:"var(--text-tertiary)"}}>
            <Icon name={m.inferred?"sparkles":"cloudy"} size={13}/>
            <span>{m.inferred?"offload noticed this":"offload holds this"}, updated {m.updated}</span>
          </div>
          {m.person?<div style={{marginTop:"var(--space-5)"}}>
            <Button variant="secondary" size="sm" onClick={()=>onOpenPerson(m.person)}>Open {m.person}</Button></div>:null}
        </div>
        <SectionHeader count={m.sources.length}>Where this came from</SectionHeader>
        {m.sources.map((s,i)=><ListRow key={i} border={i<m.sources.length-1} onClick={()=>{}}
          leading={<span style={{width:36,height:36,borderRadius:"var(--radius-sm)",background:"var(--surface-fill)",
            display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}><Icon name={s.icon} size={17}/></span>}
          title={s.title} meta={s.meta}/>)}
        {m.threads&&m.threads.length?<>
          <SectionHeader>In</SectionHeader>
          {m.threads.map((t,i)=><ListRow key={t.id} border={i<m.threads.length-1} chevron onClick={()=>onOpenThread(t.id)}
            leading={<span style={{color:"var(--text-secondary)",display:"flex"}}><Icon name="lasso" size={18}/></span>}
            title={t.name} meta={t.meta}/>)}
        </>:null}
        {m.related&&m.related.length?<>
          <SectionHeader>Connected to</SectionHeader>
          <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-2)",padding:"0 var(--gutter-screen)"}}>
            {m.related.map(rid=>data.items[rid]?<MemoryChip key={rid} item={{id:rid,...data.items[rid]}} onOpen={onOpenMemory}/>:null)}
          </div>
        </>:null}
        <div style={{height:"var(--space-9)"}}/>
      </div>
    </>
  );
}

/* A past conversation, reopened. Option E: both sides are bubbles, but offload's is
   warm grey with one squared corner, so it reads as the app rather than a second person.
   Chips inside a reply are coloured by what they point at, never neutral, so they can
   never be mistaken for something you said. */
const REF_TONE={thread:"accent",time:"attention",money:"warning",person:"outline"};
const REF_ICON={thread:"lasso",time:"clock",money:null,person:null};

/* Two marks under your own message: seen, and done. Writing is not a mark, it is
   offload's own bubble arriving early. */
function Status({state}){return <StatusChip state={state}/>;}

/* offload's bubble, before it has anything to say. Same shape and fill as a reply,
   so the dots become the words rather than being replaced by them. */
function Writing(){
  return (
    <div style={{alignSelf:"flex-start",display:"flex",alignItems:"center",gap:5,
      padding:"var(--space-4) var(--space-5)",borderRadius:"var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",
      background:"var(--ink-50)"}} aria-label="offload is writing">
      {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:"var(--radius-pill)",background:"var(--ink-300)",
        animation:"offload-pulse 1.2s var(--ease-in-out) infinite",animationDelay:(i*0.16)+"s"}}/>)}
    </div>
  );
}

function ConversationScreen({conversation,turns,writing,onBack,onOpenThread,barSolid}){
  const endRef=React.useRef(null);
  React.useEffect(()=>{if(endRef.current)endRef.current.parentElement.scrollTop=endRef.current.parentElement.scrollHeight;},[turns.length,writing,turns.map(t=>t.status).join("")]);
  return (
    <>
      <style>{"@keyframes offload-pulse{0%,100%{opacity:.35}50%{opacity:1}}"}</style>
      <AppBar border={false} style={barSolid?{background:"var(--surface-raised)",backdropFilter:"none",WebkitBackdropFilter:"none"}:{background:"var(--surface-chrome)"}}
        left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>}
        title={<span style={{display:"block",maxWidth:210,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          font:"var(--weight-medium) 15px/1.2 var(--font-core)"}}>{conversation.title}</span>}
        right={<IconButton icon="ellipsis" label="More"/>}/>
      <div style={{flex:1,overflowY:"auto",padding:"var(--space-4) var(--gutter-screen) var(--space-6)",
        display:"flex",flexDirection:"column",gap:"var(--space-5)"}}>
        <div style={{alignSelf:"center",fontSize:"var(--size-caption)",color:"var(--text-tertiary)"}}>{conversation.when}</div>
        {turns.map((t,i)=>t.from==="you"?(
          <React.Fragment key={i}>
            <div style={{alignSelf:"flex-end",maxWidth:"84%",position:"relative",padding:"var(--space-3) var(--space-5)",
              marginBottom:t.status?"var(--space-4)":0,
              borderRadius:"var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)",
              background:"var(--blue-50)",border:"1px solid var(--blue-100)",color:"var(--ink-950)",
              font:"var(--weight-regular) 15px/1.45 var(--font-core)"}}>
              {t.voice?<SentVoice secs={t.voice.secs} bars={t.voice.bars}/>:t.text}
              {(t.photos||[]).map((f,j)=><SentPhoto key={j} name={f}/>)}
              <Status state={t.status}/></div>
          </React.Fragment>
        ):(
          <div key={i} style={{alignSelf:"flex-start",maxWidth:"92%",padding:"var(--space-4) var(--space-5)",
            borderRadius:"var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px",background:"var(--ink-50)"}}>
            <div style={{font:"var(--text-quiet-role)",fontSize:16,lineHeight:1.5,color:"var(--text-primary)"}}>{t.text}</div>
            {t.refs&&t.refs.length?(
              <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-2)",marginTop:"var(--space-3)"}}>
                {t.refs.map((r,j)=>{const kind=r.kind||"thread";
                  return <Chip key={r.id||j} tone={REF_TONE[kind]} icon={REF_ICON[kind]}
                    onClick={kind==="thread"?()=>onOpenThread(r.id):undefined}>{r.name}</Chip>;})}
              </div>
            ):null}
          </div>
        ))}
        {writing?<Writing/>:null}
        <div ref={endRef}/>
      </div>
    </>
  );
}

/* Every conversation offload still holds. The retention line sits at the top because
   it explains what is missing from the bottom. */
function AllConversationsScreen({data,onBack,onOpenConversation,hidden,onDelete,barSolid}){
  const groups=data.conversations;
  return (
    <>
      <AppBar border={false} style={barSolid?{background:"var(--surface-raised)",backdropFilter:"none",WebkitBackdropFilter:"none"}:{background:"var(--surface-chrome)"}}
        left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>} title="Conversations"/>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",margin:"var(--space-3) var(--gutter-screen) var(--space-2)",
          padding:"var(--space-3) var(--space-4)",borderRadius:"var(--radius-md)",background:"var(--surface-fill)",
          color:"var(--text-secondary)",fontSize:"var(--size-caption)",lineHeight:1.4}}>
          <span style={{display:"flex",flex:"0 0 auto",color:"var(--text-tertiary)"}}><Icon name="clock-fading" size={15}/></span>
          <span>offload only keeps conversations from the past 60 days.</span>
        </div>
        {groups.map(g=>(
          <React.Fragment key={g.label}>
            <div style={{padding:"var(--space-5) var(--gutter-screen) var(--space-2)",
              font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-tertiary)"}}>{g.label}</div>
            {g.rows.filter(r=>!(hidden||[]).includes(r.id)).map((r,i)=><Swipe key={r.id} background="var(--surface-page)" onDelete={()=>onDelete&&onDelete(r.id,"Conversation deleted")}><ListRow border={i<g.rows.length-1} onClick={()=>onOpenConversation(r)}
              title={r.title} meta={r.meta} trailing={<span style={{fontVariantNumeric:"tabular-nums"}}>{r.when}</span>}/></Swipe>)}
          </React.Fragment>
        ))}
        <div style={{height:"var(--space-9)"}}/>
      </div>
    </>
  );
}

Object.assign(window,{MemoriesScreen,MemoryScreen,ConversationScreen,Status,Writing,AllConversationsScreen,MemoryChip,MemoryGroup});
