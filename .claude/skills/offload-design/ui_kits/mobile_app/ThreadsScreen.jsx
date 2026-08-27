const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { AppBar, SectionHeader, ListRow, Icon, IconButton, Badge, Button, Logo } = OFFLOAD_DS;
const Swipe=OFFLOAD_DS.SwipeRow||(({children})=>children);

const OLDER_SHOWN=3;

function Tile({icon,tone}){
  return <span style={{width:36,height:36,borderRadius:"var(--radius-sm)",
    background:tone==="accent"?"var(--surface-accent-soft)":"var(--surface-fill)",
    color:tone==="accent"?"var(--text-accent)":"var(--text-secondary)",
    display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name={icon} size={18}/></span>;
}

function ThreadRow({thread,onOpen,border,onDelete}){
  return (
    <Swipe onDelete={()=>onDelete&&onDelete(thread.id,thread.name+" deleted")}>
    <ListRow onClick={()=>onOpen(thread.id)} border={border} chevron
      leading={<Tile icon={thread.icon}/>}
      title={thread.name} meta={thread.meta}
      trailing={thread.people.length?<Badge>{thread.people.length+1}</Badge>:null}/>
    </Swipe>
  );
}

function ThreadsScreen({spaces,onOpen,onNew,unread,onOpenNotifications,onOpenSettings,barSolid,hidden,onDelete,pending,onOpenInvite}){
  const [allOlder,setAllOlder]=React.useState(false);
  const rest=React.useRef(null);
  const [restH,setRestH]=React.useState(0);
  const live=spaces.filter(s=>(hidden||[]).indexOf(s.id)<0);
  const now=live.filter(s=>s.kind==="now");
  const always=live.filter(s=>s.kind==="always");
  const older=live.filter(s=>s.kind==="older");
  const shownOlder=older.slice(0,OLDER_SHOWN);
  const restOlder=older.slice(OLDER_SHOWN);
  React.useLayoutEffect(()=>{if(rest.current)setRestH(rest.current.scrollHeight)},[restOlder.length]);
  return (
    <>
      <AppBar border={false} style={barSolid?{background:"var(--surface-raised)",backdropFilter:"none",WebkitBackdropFilter:"none"}:{background:"var(--surface-chrome)"}} title={<Logo size={21}/>}
        right={<><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/><IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
      <div style={{flex:1,overflowY:"auto",paddingTop:"var(--space-5)"}}>
        {/* One invitation waits here until it is dealt with. It never becomes an inbox:
            no badge on the tab, no counter, no second notification. */}
        {pending?<div style={{padding:"0 var(--gutter-screen)"}}>
          <PendingInvite from={pending.from} thing={pending.thing} initials={pending.initials} onOpen={onOpenInvite}/>
        </div>:null}
        {now.map((s,i)=><ThreadRow key={s.id} thread={s} onOpen={onOpen} onDelete={onDelete} border={i<now.length-1}/>)}

        <SectionHeader tone="accent" count={always.length}>Always on</SectionHeader>
        {always.map((s,i)=><ThreadRow key={s.id} thread={s} onOpen={onOpen} onDelete={onDelete} border={i<always.length-1}/>)}

        <SectionHeader count={older.length}>Older threads</SectionHeader>
        {shownOlder.map((s,i)=><ThreadRow key={s.id} thread={s} onOpen={onOpen} onDelete={onDelete}
          border={i<shownOlder.length-1||allOlder}/>)}
        {/* Height only, as on Android, on the iOS curve. The rows are always here. */}
        <div style={{maxHeight:allOlder?restH:0,overflow:"hidden",
          transition:"max-height 300ms cubic-bezier(.32,.72,0,1)"}}>
          <div ref={rest}>
            {restOlder.map((s,i)=><ThreadRow key={s.id} thread={s} onOpen={onOpen} onDelete={onDelete}
              border={i<restOlder.length-1}/>)}
          </div>
        </div>
        {allOlder||!restOlder.length?null:(
          <div style={{padding:"var(--space-6) var(--gutter-screen) 0"}}>
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
