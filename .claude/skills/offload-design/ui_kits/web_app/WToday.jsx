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

/* Bands (11 October 2026, readme: Today): the pane's sections alternate by position between the
   page and a --surface-fill band that runs to the measure's edges with the pane's own padding inside,
   radius-lg since it stops short of the pane. Inside a band, cards step up to raised. */
function WBand({i,children}){
  const b=i%2===1;
  return <section style={{margin:"0 calc(var(--space-8) * -1)",padding:"20px var(--space-8) 24px",borderRadius:"var(--radius-lg)",background:b?"var(--surface-fill)":"transparent",
    "--tp-card":b?"var(--surface-raised)":"var(--surface-fill)","--tp-on-card":b?"var(--surface-fill)":"var(--surface-raised)"}}>{children}</section>;
}

/* Open in your threads (7 October 2026): the phones' thread pages, two side by side, stepped by the
   arrows in the section head. */
function WThreadPages({open,inBand}){
  const P=D.open_threads||[];
  const [at,setAt]=React.useState(0);const [done,setDone]=React.useState([]);
  if(!P.length)return null;
  const total=P.reduce((n,p)=>n+p.todos.length,0);
  const go=p=>p.loose?open({kind:"things"}):open({kind:"thread",id:p.id});
  const line="inset 0 1px 0 var(--border-hairline)";
  const arrow=(dir,off)=><button type="button" aria-label={dir<0?"Previous threads":"Next threads"} disabled={off} onClick={()=>setAt(a=>a+dir*2)} style={{width:32,height:32,borderRadius:8,border:"none",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:off?"default":"pointer",opacity:off?.35:1,color:"var(--icon-on-well, var(--text-secondary))"}}><Icon name={dir<0?"chevron-left":"chevron-right"} size={17}/></button>;
  return <>
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 0 var(--space-3)"}}>
      <b style={{font:"var(--weight-semibold) 20px/1.2 var(--font-core)",letterSpacing:"-.01em"}}>Open in your threads</b>
      <em style={{fontStyle:"normal",font:"var(--weight-regular) 13px/1 var(--font-core)",color:"var(--text-tertiary)"}}>{total}</em>
      <span style={{marginLeft:"auto",display:"flex"}}>{arrow(-1,at===0)}{arrow(1,at+2>=P.length)}</span></div>
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"var(--space-3)"}}>
      {P.slice(at,at+2).map(p=><div key={p.name} style={{borderRadius:"var(--radius-lg)",background:"var(--tp-card, var(--surface-fill))",boxShadow:"inset 0 0 0 1px var(--edge-well)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div onClick={()=>go(p)} style={{padding:"14px 16px 10px",cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,font:"var(--weight-semibold) 16px/1.2 var(--font-core)"}}>
            <span style={{display:"flex",color:p.loose?"var(--text-secondary)":"var(--text-accent)"}}><Icon name={p.loose?"inbox":"lasso"} size={15}/></span>{p.name}
            {p.people.length?<span style={{marginLeft:"auto",display:"flex"}}>{p.people.map((x,i)=><span key={x} style={{width:22,height:22,borderRadius:99,marginLeft:i?-5:0,background:"var(--blue-100)",color:"var(--blue-700)",display:"inline-flex",alignItems:"center",justifyContent:"center",font:"var(--weight-semibold) 10px/1 var(--font-core)",boxShadow:"0 0 0 2px var(--tp-card, var(--surface-fill))"}}>{x}</span>)}</span>:null}</div>
          <p style={{margin:"4px 0 0",font:"var(--weight-regular) 14.5px/1.45 var(--font-quiet)",color:"var(--text-secondary)"}}>{p.read}</p></div>
        {p.todos.slice(0,4).map(it=>{const k=p.name+it.title;const on=done.includes(k);
          return <div key={k} style={{display:"grid",gridTemplateColumns:"22px minmax(0,1fr) auto",columnGap:8,padding:"9px 16px",boxShadow:line}}>
            <button type="button" role="checkbox" aria-checked={on} aria-label={it.title} onClick={()=>setDone(x=>on?x.filter(y=>y!==k):x.concat(k))} style={{height:20,padding:0,border:"none",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <i style={{width:15,height:15,borderRadius:4,boxSizing:"border-box",border:"1.5px solid "+(on?"var(--text-primary)":"var(--text-secondary)"),background:on?"var(--text-primary)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-inverse)"}}>{on?<Icon name="check" size={11}/>:null}</i></button>
            <b style={{font:"var(--weight-medium) 14.5px/20px var(--font-core)",textDecoration:on?"line-through":"none",color:on?"var(--text-tertiary)":"var(--text-primary)"}}>{it.title}</b>
            <span style={{font:"var(--weight-regular) 12px/20px var(--font-core)",color:"var(--text-tertiary)",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{it.age}</span></div>;})}
        <div style={{marginTop:"auto",display:"flex",justifyContent:"space-between",padding:"10px 16px",boxShadow:line,font:"var(--weight-regular) 13px/20px var(--font-core)",color:"var(--text-tertiary)"}}>
          <span>{p.todos.length>4?(p.todos.length-4)+" more":(p.more||"")}</span>
          <span onClick={()=>go(p)} style={{color:"var(--text-accent)",fontWeight:500,cursor:"pointer"}}>{p.loose?"Sort them":"Open thread"}</span></div>
      </div>)}</div></>;
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
        {[
          <>{pri.map((p,i)=>(
            <WRow key={p.id} icon={p.icon} tone={p.tone} title={p.title} meta={p.thread+" \u00b7 "+p.meta}
              selected={selectedId===p.id} tools={["archive","trash-2"]}
              trailing={p.due?<Badge tone={p.tone==="attention"?"attention":"neutral"}
                variant={p.tone==="attention"?"solid":"soft"}>{p.due}</Badge>:null}
              onClick={()=>open(p.person?{kind:"person",id:p.person}:{kind:"task",id:p.id,thread:p.thread})}/>
          ))}
          {hidden>0?<div style={{padding:"var(--space-4) 0 0"}}>
            <Button variant="ghost" size="sm" iconAfter="chevron-down" onClick={()=>setAll(true)}>{hidden} more</Button></div>:null}</>,
          <><div style={{display:"flex",alignItems:"center",paddingBottom:"var(--space-2)"}}><b style={{font:"var(--weight-semibold) 20px/1.2 var(--font-core)",letterSpacing:"-.01em"}}>This week</b>
            <span style={{marginLeft:"auto"}}><Button variant="ghost" size="sm" onClick={()=>open({kind:"calendar"})}>Open calendar</Button></span></div>
            <WWeekStrip onOpen={()=>open({kind:"calendar"})}/></>,
          <Reminders web onThread={n=>open({kind:"thread",id:(D.spaces.find(s=>s.name===n)||{}).id})}/>,
          <WThreadPages open={open}/>,
          <><WSection count={TV.threads.length} tone="accent">What moved</WSection>
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
          ))}</>
        ].map((el,i)=><WBand key={i} i={i}>{el}</WBand>)}
      </WBody>
    </>
  );
}

Object.assign(window,{WBand,WThreadPages,WToday,WWeekStrip,weekDays,freeWords});
