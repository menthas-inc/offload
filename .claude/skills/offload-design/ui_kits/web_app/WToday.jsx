const { Icon, IconButton, Badge, Button, Chip } = OFFLOAD_DS;
const TV=D.today_view;

/* k1: the week as five cards. Free time is measured from the events themselves, the same
   way the phone's agenda names the longest gap. */
const DAY_NAMES=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function weekDays(){
  const t=new Date(D.todayIso+"T12:00:00");
  const monday=new Date(t);monday.setDate(t.getDate()-((t.getDay()+6)%7));
  return [0,1,2,3,4].map(i=>{
    const d=new Date(monday);d.setDate(monday.getDate()+i);
    const offset=Math.round((d-t)/86400000);
    const src=TV.days.find(x=>x.offset===offset)||(offset===0?TV.days[0]:offset===1?TV.days[1]:null);
    return {name:DAY_NAMES[d.getDay()],num:d.getDate(),today:offset===0,events:(src&&src.events)||[]};
  });
}
function freeWords(events){
  if(!events.length)return "nothing on";
  const busy=[...events].sort((a,b)=>a.start-b.start);
  let cursor=8,best=0;
  busy.forEach(e=>{if(e.start-cursor>best)best=e.start-cursor;cursor=Math.max(cursor,e.end);});
  if(20-cursor>best)best=20-cursor;
  const m=Math.round(best*60);
  if(m<60)return m+"mins free";
  const H=Math.floor(m/60),M=m%60;
  return (M?H+":"+String(M).padStart(2,"0"):H)+"hrs free";
}
function WWeekStrip({onOpen}){
  return (
    <div style={{display:"flex",gap:"var(--space-3)",padding:"var(--space-3) 0 var(--space-2)"}}>
      {weekDays().map(d=>(
        <div key={d.num} onClick={onOpen} style={{flex:1,minWidth:0,cursor:"pointer",
          padding:"var(--space-3) var(--space-4) var(--space-4)",borderRadius:"var(--radius-md)",
          background:"var(--surface-raised)",
          border:"1px solid "+(d.today?"var(--blue-500)":"var(--border-hairline)"),
          boxShadow:d.today?"0 0 0 2px var(--blue-50)":"none"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:"var(--space-3)"}}>
            <b style={{font:"var(--weight-semibold) 14px/1 var(--font-core)",fontVariantNumeric:"tabular-nums"}}>{d.num}</b>
            <span style={{font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-secondary)"}}>{d.name}</span>
          </div>
          {d.events.slice(0,2).map((e,i)=>(
            <div key={i} style={{padding:"var(--space-2) var(--space-3)",borderRadius:"var(--radius-xs)",
              marginBottom:"var(--space-2)",
              background:e.tone==="attention"?"var(--blue-50)":e.tone==="accent"?"var(--surface-accent-soft)":"var(--surface-fill)",
              color:e.tone==="attention"?"var(--blue-700)":e.tone==="accent"?"var(--text-accent)":"var(--text-primary)"}}>
              <u style={{display:"block",font:"var(--weight-medium) 10px/1.2 var(--font-core)",textDecoration:"none",
                opacity:0.72,fontVariantNumeric:"tabular-nums"}}>{clock(e.start,true)}</u>
              <i style={{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",
                font:"var(--weight-regular) 11.5px/1.3 var(--font-core)",fontStyle:"normal",marginTop:1}}>{e.title}</i>
            </div>
          ))}
          <div style={{font:"var(--weight-medium) 11px/1 var(--font-core)",color:"var(--text-accent)",paddingTop:"var(--space-2)"}}>
            {freeWords(d.events)}
          </div>
        </div>
      ))}
    </div>
  );
}

function WToday({open,selectedId,now}){
  const [all,setAll]=React.useState(false);
  const pri=all?TV.priority:TV.priority.slice(0,5);
  const hidden=TV.priority.length-pri.length;
  const evening=now&&now.evening;
  return (
    <>
      <WPaneHead big title={evening?"Tonight":"Today"}
        sub={(now?now.dateLabel:"")+" \u00b7 sunset "+(now?now.sunset:"")}/>
      <WBody>
        {pri.map((p,i)=>(
          <WRow key={p.id} icon={p.icon} tone={p.tone} title={p.title} meta={p.thread+" \u00b7 "+p.meta}
            selected={selectedId===p.id} tools={["archive","trash-2"]}
            trailing={p.due?<Badge tone={p.tone==="attention"?"attention":"neutral"}
              variant={p.tone==="attention"?"solid":"soft"}>{p.due}</Badge>:null}
            onClick={()=>open(p.person?{kind:"person",id:p.person}:{kind:"task",id:p.id,thread:p.thread})}/>
        ))}
        {hidden>0?<div style={{padding:"var(--space-4) 0 0"}}>
          <Button variant="ghost" size="sm" iconAfter="chevron-down" onClick={()=>setAll(true)}>{hidden} more</Button></div>:null}
        <WSection action="Open calendar" onAction={()=>open({kind:"calendar"})}>This week</WSection>
        <WWeekStrip onOpen={()=>open({kind:"calendar"})}/>
        <WSection count={TV.threads.length} tone="accent">What moved</WSection>
        {TV.threads.map(t=>{
          const l=t.lines&&t.lines[0];
          return <WRow key={t.name} icon={l?l.icon:"lasso"} title={t.name} meta={l?l.text+" \u00b7 "+l.time:null}
            trailing={<Badge tone="accent" variant="soft">{"+"+t.added}</Badge>}
            onClick={()=>open({kind:"thread",id:(D.spaces.find(s=>s.name===t.name)||{}).id})}/>;
        })}
        <WSection count={TV.other.length}>Other things</WSection>
        {TV.other.map((o,i)=>(
          <WRow key={o.id||i} icon={o.icon} title={o.title} meta={o.meta} tools={["archive","trash-2"]}
            last={i===TV.other.length-1}
            onClick={()=>open({kind:"task",id:o.id,thread:o.thread})}/>
        ))}
      </WBody>
    </>
  );
}

Object.assign(window,{WToday,WWeekStrip,weekDays,freeWords});
