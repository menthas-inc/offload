const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon } = OFFLOAD_DS;

/* The runway: one spine down the day. Events are anchors on it, the clear runs
   between them are bands that carry the weight. Both kinds of line share the
   same time column, so every title starts at the same x. */
const RANGE_W=112, MIN_GAP=0.75;

function clock(h,withMeridiem){
  const H=Math.floor(h),M=Math.round((h-H)*60);
  const h12=H%12===0?12:H%12;
  return h12+":"+String(M).padStart(2,"0")+(withMeridiem?(H>=12?"pm":"am"):"");
}
/* Meridiem on the end time only, even across noon: one am/pm per range keeps
   the time column even. */
function range(a,b){
  return clock(a,false)+" - "+clock(b,true);
}
/* Free-time label: "4:30hrs free". */
function freeLabel(h){
  const m=Math.round(h*60);
  if(m<60) return m+"mins free";
  const H=Math.floor(m/60),M=m%60;
  return H+(M?":"+String(M).padStart(2,"0"):"")+"hrs free";
}

function Time({children}){
  return <span style={{width:RANGE_W,flex:"0 0 auto",fontSize:"var(--size-body-sm)",lineHeight:"22px",
    color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{children}</span>;
}

function EventLine({ev,isNow}){
  const dots={ink:"var(--ink-900)",accent:"var(--moss-600)",attention:"var(--blue-600)"};
  return (
    <div style={{position:"relative",display:"flex",alignItems:"flex-start",gap:"var(--space-5)",padding:"var(--space-4) 0"}}>
      {/* 8px dot centred on the first line: 8px pad + half of a 22px line, less half the dot */}
      <span style={{position:"absolute",left:-19,top:"calc(var(--space-4) + 11px - 4px)",width:8,height:8,
        borderRadius:"var(--radius-pill)",background:dots[ev.tone]||dots.ink}}/>
      <Time>{range(ev.start,ev.end)}</Time>
      <span style={{flex:1,minWidth:0,font:"var(--weight-medium) var(--size-title-3)/1.3 var(--font-core)",fontVariantNumeric:"tabular-nums",
        letterSpacing:"var(--tracking-title)",paddingTop:1}}>{ev.title}</span>
      {isNow?<span style={{flex:"0 0 auto",fontSize:"var(--size-caption)",color:"var(--clay-600)"}}>now</span>:null}
    </div>
  );
}

function FreeLine({from,to}){
  return (
    <div style={{position:"relative",display:"flex",alignItems:"flex-start",gap:"var(--space-5)",
      margin:"var(--space-2) 0 var(--space-2) -19px",padding:"var(--space-5) 0 var(--space-5) 16px",
      borderLeft:"3px solid var(--moss-500)",
      background:"linear-gradient(90deg,var(--moss-50),transparent)"}}>
      <Time>{range(from,to)}</Time>
      <span style={{flex:1,minWidth:0,font:"var(--weight-medium) var(--size-body)/1.35 var(--font-core)",fontVariantNumeric:"tabular-nums",
        letterSpacing:"var(--tracking-body)",color:"var(--moss-700)"}}>
        {freeLabel(to-from)}
      </span>
    </div>
  );
}

function DayAgenda({days,nowHour}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"var(--space-8)",padding:"0 var(--gutter-screen) var(--space-8)"}}>
      {days.map(day=>{
        const evs=[...day.events].sort((a,b)=>a.start-b.start);
        const lines=[];
        evs.forEach((ev,i)=>{
          lines.push(<EventLine key={"e"+i} ev={ev} isNow={day.isToday&&nowHour>=ev.start&&nowHour<ev.end}/>);
          const next=evs[i+1];
          if(next){
            const g=next.start-ev.end;
            if(g>=MIN_GAP) lines.push(<FreeLine key={"g"+i} from={ev.end} to={next.start}/>);
          }
        });
        return (
          <div key={day.label}>
            <div style={{display:"flex",alignItems:"baseline",gap:"var(--space-4)",paddingBottom:"var(--space-4)"}}>
              <span style={{font:"var(--weight-medium) var(--size-title-3)/1.2 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)"}}>{day.label}</span>
              <span style={{fontSize:"var(--size-caption)",color:"var(--text-tertiary)"}}>{day.date}</span>
            </div>
            <div style={{position:"relative",paddingLeft:19}}>
              <span style={{position:"absolute",left:3,top:10,bottom:10,width:1,background:"var(--border-hairline)"}}/>
              {lines.length?lines:(
                <div style={{padding:"var(--space-4) 0",font:"var(--text-quiet-role)",fontVariantNumeric:"tabular-nums",fontSize:"var(--size-body-sm)",
                  color:"var(--text-tertiary)"}}>Nothing scheduled, the whole day is free.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window,{DayAgenda});
