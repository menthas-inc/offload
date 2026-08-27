const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, Chip } = OFFLOAD_DS;

const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],MONTH=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_MS=86400000;
function parse(iso){return new Date(iso+"T00:00:00")}
function dowOf(iso){return DOW[(parse(iso).getDay()+6)%7]}
function domOf(iso){return String(parse(iso).getDate())}
/* Every date label is derived from the date, never hand written, so a weekday
   can never disagree with the calendar. */
function whenLabel(it){
  if(!it.date) return it.when||"";
  const d=parse(it.date);
  return dowOf(it.date)+" "+d.getDate()+" "+MONTH[d.getMonth()]+(it.time?", "+it.time:"");
}

/* Widgets a thread earns from its own contents: a map when it has places, a
   timeline when it has dated steps, a file grid when it has assets. Each one
   filters with the same chip row: kinds first, then tags offload derived. */

function ChipRow({options,value,onChange}){
  return (
    <div className="no-bar" style={{display:"flex",gap:"var(--space-3)",padding:"0 var(--gutter-screen) var(--space-6)",
      overflowX:"auto",scrollbarWidth:"none"}}>
      {options.map(o=>(
        <Chip key={o.id} selected={value===o.id} tone={o.derived?"accent":"neutral"} onClick={()=>onChange(o.id)}
          icon={o.derived?"sparkles":undefined}>
          {o.label+(o.count!=null?" "+o.count:"")}
        </Chip>
      ))}
    </div>
  );
}

/* ---------- map: pins over a placeholder surface, list filtered by the chips ---------- */
function MapWidget({data}){
  const [f,setF]=React.useState("all");
  const shown=f==="all"?data.places:data.places.filter(p=>p.tags.indexOf(f)>-1);
  const tones={ink:"var(--a-on)",accent:"var(--moss-600)",attention:"var(--blue-600)"};
  return (
    <>
      <ASection count={data.places.length} action="Open map">Places</ASection>
      <div style={{position:"relative",height:150,background:"var(--a-c-low)",overflow:"hidden",
        borderTop:"1px solid var(--a-outline)",borderBottom:"1px solid var(--a-outline)",
        marginBottom:"var(--space-6)"}}>
        <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
          font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:11,color:"var(--a-on-var)",textAlign:"center",padding:"0 40px",lineHeight:1.5}}>
          map surface, drawn from real coordinates
        </span>
        {shown.map((p,i)=>(
          <span key={p.id} style={{position:"absolute",left:p.x+"%",top:p.y+"%",transform:"translate(-50%,-100%)",
            width:22,height:22,borderRadius:"var(--radius-pill)",background:tones[p.tone]||tones.ink,color:"var(--paper)",
            font:"var(--weight-semibold) 11px/22px var(--font-core)",fontVariantNumeric:"tabular-nums",textAlign:"center"}}>{i+1}</span>
        ))}
      </div>
      <ChipRow options={data.filters} value={f} onChange={setF}/>
      {shown.map((p,i)=>(
        <div key={p.id} style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)",
          padding:"var(--space-4) var(--gutter-screen)",boxShadow:i<shown.length-1?"inset 0 -1px 0 var(--a-outline)":"none"}}>
          <span style={{width:20,height:20,marginTop:2,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
            background:tones[p.tone]||tones.ink,color:"var(--paper)",
            font:"var(--weight-semibold) 11px/20px var(--font-core)",fontVariantNumeric:"tabular-nums",textAlign:"center"}}>{i+1}</span>
          <span style={{flex:1,minWidth:0}}>
            <span style={{display:"block",font:"var(--weight-medium) var(--size-body)/1.35 var(--font-core)",fontVariantNumeric:"tabular-nums",
              letterSpacing:"var(--tracking-body)"}}>{p.name}</span>
            <span style={{display:"block",fontSize:"var(--size-body-sm)",color:"var(--a-on-var)"}}>{p.meta}</span>
          </span>
          <span style={{flex:"0 0 auto",fontSize:"var(--size-caption)",color:"var(--a-on-var)"}}>{p.time}</span>
        </div>
      ))}
    </>
  );
}

/* ---------- timeline: week or hour granularity, same list underneath ---------- */
function TimelineWidget({data}){
  const [gran,setGran]=React.useState(data.granularity||"week");
  const todayIso=(typeof window!=="undefined"&&window.OFFLOAD_DATA&&window.OFFLOAD_DATA.todayIso)||null;

  /* Everything below derives from data.items, the thread's one dated list. */
  const dates=React.useMemo(()=>{
    const seen=[];
    data.items.forEach(i=>{if(i.date&&seen.indexOf(i.date)<0)seen.push(i.date)});
    return seen.sort();
  },[data.items]);

  const [sel,setSel]=React.useState(()=>{
    const i=dates.indexOf(todayIso);
    return i>-1?i:0;
  });
  const selDate=dates[Math.min(sel,dates.length-1)];

  const items=React.useMemo(()=>{
    const list=gran==="week"?data.items:data.items.filter(i=>i.date===selDate);
    return list.slice().sort((x,y)=>(x.date+(x.time||"")).localeCompare(y.date+(y.time||"")));
  },[data.items,gran,selDate]);

  const railRows=React.useMemo(()=>{
    if(!dates.length) return [];
    const mondayOf=(iso)=>{const x=parse(iso);const shift=(x.getDay()+6)%7;return new Date(x.getTime()-shift*DAY_MS)};
    const start=mondayOf(dates[0]);
    const end=new Date(mondayOf(dates[dates.length-1]).getTime()+6*DAY_MS);
    const counts={};
    data.items.forEach(i=>{if(i.date)counts[i.date]=(counts[i.date]||0)+1});
    const rows=[];
    for(let cur=start;cur<=end;){
      const week=[];
      for(let k=0;k<7;k++){
        const iso=cur.toISOString().slice(0,10);
        week.push({iso,dow:DOW[k],dom:String(cur.getDate()),count:counts[iso]||0,today:iso===todayIso});
        cur=new Date(cur.getTime()+DAY_MS);
      }
      rows.push(week);
    }
    return rows;
  },[data.items,dates,todayIso]);

  return (
    <>
      <ASection action={
        <span style={{display:"inline-flex",gap:2,padding:2,background:"var(--a-c-high)",borderRadius:"var(--radius-sm)"}}>
          {[["week","Overall"],["hour","Daily"]].map(([k,l])=>(
            <button key={k} type="button" onClick={()=>setGran(k)}
              style={{border:"none",cursor:"pointer",height:44,margin:"-9px 0",padding:0,background:"transparent",
                display:"inline-flex",alignItems:"center"}}>
              <span style={{display:"inline-flex",alignItems:"center",height:26,padding:"0 var(--space-5)",
                borderRadius:"calc(var(--radius-sm) - 2px)",
                background:gran===k?"var(--paper)":"transparent",color:gran===k?"var(--a-on)":"var(--a-on-var)",
                boxShadow:gran===k?"var(--shadow-1)":"none",font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",fontVariantNumeric:"tabular-nums"}}>{l}</span>
            </button>
          ))}
        </span>
      }>Timeline</ASection>

      {gran==="week"?(
        <div style={{display:"flex",flexDirection:"column",gap:"var(--space-3)",
          padding:"0 var(--gutter-screen) var(--space-6)"}}>
          {railRows.map((row,ri)=>(
            <div key={ri} style={{display:"flex"}}>
              {row.map((r,i)=>(
                <div key={i} style={{flex:"1 1 0",minWidth:0,textAlign:"center",padding:"var(--space-4) var(--space-1)",
                  borderRadius:"var(--radius-xs)",background:r.today?"var(--a-c-high)":"transparent"}}>
                  <span style={{display:"block",fontSize:"var(--size-caption)",color:"var(--a-on-var)"}}>{r.dow}</span>
                  <span style={{display:"block",font:"var(--weight-semibold) var(--size-body-sm)/1.3 var(--font-core)",fontVariantNumeric:"tabular-nums",marginTop:1,
                    fontVariantNumeric:"tabular-nums"}}>{r.dom}</span>
                  <span style={{display:"block",width:5,height:5,borderRadius:"var(--radius-pill)",margin:"5px auto 0",
                    background:r.count?"var(--a-on)":"transparent"}}/>
                </div>
              ))}
            </div>
          ))}
        </div>
      ):(
        <div className="no-bar" style={{display:"flex",gap:"var(--space-3)",padding:"0 var(--gutter-screen) var(--space-6)",
          overflowX:"auto",scrollbarWidth:"none"}}>
          {dates.map((iso,i)=>(
            <Chip key={iso} selected={iso===selDate} onClick={()=>setSel(i)}>{dowOf(iso)+" "+domOf(iso)}</Chip>
          ))}
        </div>
      )}

      {items.length===0?(
        <div style={{padding:"0 var(--gutter-screen) var(--space-6)",font:"var(--text-quiet-role)",fontVariantNumeric:"tabular-nums",
          fontSize:"var(--size-body-sm)",color:"var(--a-on-var)"}}>Nothing on this day.</div>
      ):items.map((it,i)=>(
        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)",
          padding:"var(--space-4) var(--gutter-screen)",boxShadow:i<items.length-1?"inset 0 -1px 0 var(--a-outline)":"none"}}>
          <span style={{width:7,height:7,marginTop:8,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
            background:it.state==="done"?"var(--moss-600)":it.state==="next"?"var(--blue-600)":"var(--a-on)"}}/>
          <span style={{flex:1,minWidth:0}}>
            <span style={{display:"block",font:"var(--weight-medium) var(--size-body)/1.35 var(--font-core)",fontVariantNumeric:"tabular-nums",
              letterSpacing:"var(--tracking-body)"}}>{it.title}</span>
            <span style={{display:"block",fontSize:"var(--size-body-sm)",color:"var(--a-on-var)",
              fontVariantNumeric:"tabular-nums"}}>{gran==="week"?whenLabel(it):(it.time||whenLabel(it))}</span>
          </span>
        </div>
      ))}
    </>
  );
}

/* ---------- files: previews where they exist, type glyph where they do not ---------- */
function FileTile({file}){
  return (
    <div style={{border:"1px solid var(--a-outline)",borderRadius:"var(--radius-sm)",overflow:"hidden",
      aspectRatio:"1 / 1",background:file.preview?"var(--a-c-high)":"var(--surface-page)",
      display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      {file.preview?(
        <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
          font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",fontSize:10,color:"var(--a-on-var)"}}>preview</span>
      ):(
        <span style={{color:"var(--a-on-var)",display:"flex"}}><Icon name={file.icon} size={22}/></span>
      )}
    </div>
  );
}

function FilesWidget({data}){
  const [f,setF]=React.useState("all");
  const shown=f==="all"?data.files:data.files.filter(x=>x.tags.indexOf(f)>-1);
  return (
    <>
      <ASection count={data.files.length}>Files</ASection>
      <ChipRow options={data.filters} value={f} onChange={setF}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"var(--space-4)",
        padding:"0 var(--gutter-screen) var(--space-6)"}}>
        {shown.map(x=><FileTile key={x.id} file={x}/>)}
      </div>
    </>
  );
}

Object.assign(window,{MapWidget,TimelineWidget,FilesWidget});
