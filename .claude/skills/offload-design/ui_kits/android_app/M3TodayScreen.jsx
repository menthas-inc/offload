const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, IconButton, Badge, Button } = OFFLOAD_DS;
const Swipe=OFFLOAD_DS.SwipeRow||(({children})=>children);

/* Two states only: Today until sunset, Tonight after. Real sunset, see sun.js. */
function timeOfDay(date){
  const sun=(typeof window!=="undefined"&&window.OffloadSun)||null;
  const night=sun?sun.isNight(date||new Date()):false;
  return night?{label:"Tonight",icon:"moon"}:{label:"Today",icon:"sun"};
}

function ThreadDigest({thread,onOpen}){
  return (
    <div style={{paddingBottom:"var(--space-4)"}}>
      <ACard white padded={false} style={{cursor:"pointer"}}>
        <div onClick={onOpen} style={{display:"flex",alignItems:"center",gap:"var(--space-4)",
          padding:"var(--space-4) var(--space-5)",background:"var(--a-c)"}}>
          <span style={{color:"var(--a-on-var)",display:"flex"}}><Icon name="lasso" size={18}/></span>
          <span style={{flex:1,minWidth:0,font:"var(--weight-medium) 16px/24px var(--font-core)",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{thread.name}</span>
          <ABadge tone="accent">+{thread.added}</ABadge>
        </div>
        <div style={{padding:"var(--space-4) var(--space-5)",display:"flex",flexDirection:"column",gap:"var(--space-4)"}}>
          {thread.lines.map((l,i)=>(
            <div key={i} style={{display:"flex",gap:"var(--space-4)",alignItems:"flex-start"}}>
              <span style={{color:"var(--a-on-var)",display:"flex",paddingTop:2,flex:"0 0 auto"}}><Icon name={l.icon} size={15}/></span>
              <span style={{flex:1,minWidth:0,font:"var(--weight-regular) 14px/20px var(--font-core)"}}>{l.text}</span>
              <span style={{font:"var(--weight-regular) 12px/16px var(--font-core)",color:"var(--a-on-var)",flex:"0 0 auto"}}>{l.time}</span>
            </div>
          ))}
        </div>
      </ACard>
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
      <ABar wordmark
        right={<><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/><IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
      <div style={{flex:1,overflowY:"auto",position:"relative",padding:"var(--space-5) 0 0"}}>
        <>
          {shown.map((p,i)=>(
            <Swipe key={p.id} background="var(--a-surface)" onDelete={()=>onDelete&&onDelete(p.id,"Deleted")}>
              <ARow leading={p.icon} leadingTone={p.tone} title={p.title} meta={p.thread+" \u00b7 "+p.meta}
                border={i<shown.length-1||more>0} onClick={p.person&&onOpenPerson?()=>onOpenPerson(p.person):onOpenItem}
                trailing={p.due?<ABadge tone={p.tone==="attention"?"attention":"neutral"} variant={p.tone==="attention"?"solid":"soft"}>{p.due}</ABadge>:null}/>
            </Swipe>
          ))}
          {more>0?(
            <div style={{padding:"var(--space-4) var(--gutter-screen)"}}>
              <Button variant="ghost" size="sm" iconAfter="chevron-down" onClick={()=>setAllPriority(true)}>{more} more</Button>
            </div>
          ):null}
        </>

        <ASection tone="accent" count={data.threads.length}>What moved</ASection>
        {data.threads.map(th=><ThreadDigest key={th.id} thread={th} onOpen={()=>onOpenThread(th.id)}/>)}

        <ASection action="Open calendar">On the clock</ASection>
        <DayAgenda days={data.days} nowHour={nowHour}/>

        <ASection count={other.length}>Other things</ASection>
        <>
          {other.map((l,i)=>(
            <Swipe key={l.id} background="var(--a-surface)" onDelete={()=>onDelete&&onDelete(l.id,"Deleted")}>
              <ARow leading={l.icon} title={l.title} meta={l.meta} border={i<other.length-1}
                onClick={onOpenItem} trailing={<span style={{font:"var(--weight-regular) 14px/20px var(--font-core)",color:"var(--a-on-var)"}}>{l.time}</span>}/>
            </Swipe>
          ))}
        </>
        <div style={{padding:"var(--space-6) var(--gutter-screen) var(--space-9)"}}>
          <Button variant="secondary" size="sm" iconAfter="chevron-right">Sort these for me</Button>
        </div>
      </div>
    </>
  );
}

Object.assign(window,{TodayScreen,timeOfDay});
