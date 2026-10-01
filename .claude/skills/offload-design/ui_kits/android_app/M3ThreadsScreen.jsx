const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { IconButton, Badge, Button } = OFFLOAD_DS;
const Swipe=OFFLOAD_DS.SwipeRow||(({children})=>children);

const OLDER_SHOWN=3;

/* Who is in a thread, named: two at most, then a count, so the row says who without
   growing. */
function withWhom(people){
  if(!people||!people.length)return "just you";
  if(people.length<=2)return "with "+people.join(", ");
  return "with "+people.slice(0,2).join(", ")+", "+(people.length-2)+" more";
}

function threadMeta(thread){
  const rest=(thread.meta||"").replace(/^\s*\d+\s+things\s*\u00b7\s*/,"").trim();
  const people=(thread.people||[]).join(", ");
  if(!rest||rest==="just you"||rest===people)return withWhom(thread.people);
  return rest;
}

function ThreadRow({thread,onOpen,border,onDelete}){
  const n=(thread.count!==undefined?thread.count:parseInt(thread.meta,10))||null;
  return (
    <Swipe background="var(--a-surface)"
      onDelete={()=>onDelete&&onDelete(thread.id,thread.name+" deleted")}>
      <ARow onClick={()=>onOpen(thread.id)} border={border} leading={thread.icon}
        title={thread.name} meta={threadMeta(thread)}
        trailing={n?<span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",
          fontSize:15,color:"var(--a-on-var)"}}>{n}</span>:null}/>
    </Swipe>
  );
}

function ThreadsScreen({onToast,spaces,onOpen,onNew,unread,onOpenNotifications,onOpenSettings,barSolid,hidden,onDelete,pending,onOpenInvite}){
  const [allOlder,setAllOlder]=React.useState(false);
  const rest=React.useRef(null);
  const [restH,setRestH]=React.useState(0);
  const live=spaces.filter(s=>(hidden||[]).indexOf(s.id)<0);
  const now=live.filter(s=>s.kind==="now");
  const older=live.filter(s=>s.kind==="older");
  const shownOlder=older.slice(0,OLDER_SHOWN);
  const restOlder=older.slice(OLDER_SHOWN);
  React.useLayoutEffect(()=>{if(rest.current)setRestH(rest.current.scrollHeight)},[restOlder.length]);
  return (
    <>
      <ABar wordmark
        right={<><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/><IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
      <div style={{flex:1,overflowY:"auto",padding:"var(--space-5) 0 0"}}>
        {/* One invitation waits here until it is dealt with, and never becomes an inbox. */}
        {pending?<div style={{padding:"0 var(--space-4)"}}>
          <PendingInvite from={pending.from} thing={pending.thing} initials={pending.initials} onOpen={onOpenInvite}/>
        </div>:null}
        <>{now.map((s,i)=><ThreadRow key={s.id} thread={s} onOpen={onOpen} onDelete={onDelete} border={i<now.length-1}/>)}</>

        {/* Always on retired 1 October 2026. Things without a thread sit here as their own group. */}
        <LooseGroup and items={(window.OFFLOAD_DATA||{}).loose||[]} threads={spaces} Section={ASection} onToast={onToast}/>

        <ASection count={older.length}>Older threads</ASection>
        <>{shownOlder.map((s,i)=><ThreadRow key={s.id} thread={s} onOpen={onOpen} onDelete={onDelete}
          border={i<shownOlder.length-1||allOlder}/>)}</>
        {/* Height only: the rows are always here, the box lets them through. */}
        <div style={{maxHeight:allOlder?restH:0,overflow:"hidden",
          transition:"max-height 320ms cubic-bezier(.05,.7,.1,1)"}}>
          <div ref={rest}>
            {restOlder.map((s,i)=><ThreadRow key={s.id} thread={s} onOpen={onOpen} onDelete={onDelete}
              border={i<restOlder.length-1}/>)}
          </div>
        </div>
        {allOlder||!restOlder.length?null:(
          <div style={{padding:"var(--space-5) var(--gutter-screen) 0"}}>
            <Button variant="ghost" size="sm" iconAfter="chevron-right" onClick={()=>setAllOlder(true)}>
              {"All " + older.length + " older threads"}
            </Button>
          </div>
        )}

        <div style={{height:"var(--space-9)"}}/>
      </div>
    </>
  );
}

Object.assign(window,{ThreadsScreen});
