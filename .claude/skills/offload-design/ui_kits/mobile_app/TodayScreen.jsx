const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { AppBar, SectionHeader, ListRow, Icon, IconButton, Badge, Card, Logo, Button } = OFFLOAD_DS;
const Swipe=OFFLOAD_DS.SwipeRow||(({children})=>children);

/* Two states only: Today until sunset, Tonight after. Real sunset, see sun.js. */
function timeOfDay(date){
  const sun=(typeof window!=="undefined"&&window.OffloadSun)||null;
  const night=sun?sun.isNight(date||new Date()):false;
  return night?{label:"Tonight",icon:"moon"}:{label:"Today",icon:"sun"};
}

function PriorityRow({item,onOpen,onOpenPerson,last}){
  /* A row about a person opens that person, not the thread: people are places. */
  const go=item.person&&onOpenPerson?()=>onOpenPerson(item.person):onOpen;
  return (
    <div onClick={go} style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)",
      padding:"var(--space-5) var(--gutter-screen)",cursor:"pointer",
      boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
      <span style={{width:22,height:22,marginTop:1,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
        background:item.tone==="attention"?"var(--surface-attention)":"var(--surface-fill)",
        color:item.tone==="attention"?"var(--text-on-solid)":"var(--text-secondary)",
        display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name={item.icon} size={13}/></span>
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:2}}>
        <div style={{font:"var(--weight-medium) var(--size-body)/1.35 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-body)"}}>{item.title}</div>
        <div style={{fontSize:"var(--size-body-sm)",lineHeight:1.4,color:"var(--text-secondary)"}}>
          {item.thread}<span style={{color:"var(--text-tertiary)"}}> · {item.meta}</span>
        </div>
      </div>
      {item.due?<span style={{flex:"0 0 auto",paddingTop:2}}><Badge tone={item.tone==="attention"?"attention":"neutral"} variant={item.tone==="attention"?"solid":"soft"}>{item.due}</Badge></span>:null}
    </div>
  );
}

function ThreadDigest({thread,onOpen}){
  return (
    <div style={{padding:"0 var(--gutter-screen) var(--space-5)"}}>
      <Card padding="0" onClick={onOpen}>
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-5) var(--space-6)",
          boxShadow:"inset 0 -1px 0 var(--border-hairline)"}}>
          <span style={{color:"var(--text-secondary)",display:"flex"}}><Icon name="lasso" size={18}/></span>
          <span style={{flex:1,minWidth:0,font:"var(--text-title-3)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{thread.name}</span>
          <Badge tone="accent">+{thread.added}</Badge>
        </div>
        <div style={{padding:"var(--space-5) var(--space-6)",display:"flex",flexDirection:"column",gap:"var(--space-4)"}}>
          {thread.lines.map((l,i)=>(
            <div key={i} style={{display:"flex",gap:"var(--space-4)",alignItems:"flex-start"}}>
              <span style={{color:"var(--text-tertiary)",display:"flex",paddingTop:2,flex:"0 0 auto"}}><Icon name={l.icon} size={15}/></span>
              <span style={{flex:1,minWidth:0,fontSize:"var(--size-body-sm)",lineHeight:1.4,color:"var(--text-primary)"}}>{l.text}</span>
              <span style={{fontSize:"var(--size-caption)",color:"var(--text-tertiary)",flex:"0 0 auto"}}>{l.time}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TodayScreen({data,now,onOpenThread,onOpenItem,onOpenPerson,unread,onOpenNotifications,onOpenSettings,barSolid,hidden,onDelete}){
  const [allPriority,setAllPriority]=React.useState(false);
  const d=now||new Date();
  const nowHour=d.getHours()+d.getMinutes()/60;
  const gone=(id)=>(hidden||[]).indexOf(id)>=0;
  const priority=data.priority.filter(p=>!gone(p.id));
  const other=data.other.filter(l=>!gone(l.id));
  const shown=allPriority?priority:priority.slice(0,5);
  const more=priority.length-shown.length;
  return (
    <>
      <AppBar border={false} style={barSolid?{background:"var(--surface-raised)",backdropFilter:"none",WebkitBackdropFilter:"none"}:{background:"var(--surface-chrome)"}}
        title={<Logo size={21}/>}
        right={<><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/><IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
      <div style={{flex:1,overflowY:"auto",position:"relative",paddingTop:"var(--space-5)"}}>
        {shown.map((p,i)=>(
          <Swipe key={p.id} onDelete={()=>onDelete&&onDelete(p.id,"Deleted")}>
            <PriorityRow item={p} onOpen={onOpenItem} onOpenPerson={onOpenPerson} last={i===shown.length-1&&!more}/>
          </Swipe>
        ))}
        {more>0?(
          <div style={{padding:"var(--space-5) var(--gutter-screen) var(--space-9)"}}>
            <Button variant="ghost" size="sm" iconAfter="chevron-down" onClick={()=>setAllPriority(true)}>{more} more</Button>
          </div>
        ):null}

        <SectionHeader tone="accent" count={data.threads.length}>What moved</SectionHeader>
        {data.threads.map(th=><ThreadDigest key={th.id} thread={th} onOpen={()=>onOpenThread(th.id)}/>)}

        <SectionHeader action="Open calendar">On the clock</SectionHeader>
        <DayAgenda days={data.days} nowHour={nowHour}/>

        <SectionHeader count={other.length}>Other things</SectionHeader>
        {other.map((l,i)=>(
          <Swipe key={l.id} onDelete={()=>onDelete&&onDelete(l.id,"Deleted")}>
          <ListRow border={i<other.length-1} onClick={onOpenItem}
            leading={<span style={{width:36,height:36,borderRadius:"var(--radius-sm)",background:"var(--surface-fill)",
              display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}><Icon name={l.icon} size={18}/></span>}
            title={l.title} meta={l.meta} trailing={<span>{l.time}</span>}/>
          </Swipe>
        ))}
        <div style={{padding:"var(--space-6) var(--gutter-screen) var(--space-9)"}}>
          <Button variant="secondary" size="sm" iconAfter="chevron-right">Sort these for me</Button>
        </div>
      </div>
    </>
  );
}

Object.assign(window,{TodayScreen,timeOfDay});
