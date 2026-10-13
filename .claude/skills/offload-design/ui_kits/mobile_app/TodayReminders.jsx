const OFFLOAD_TR=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon:TRIcon } = OFFLOAD_TR;

/* Reminders on Today (042, drawn 11 October 2026 as C2b; readme: Today). What offload is reminding
   you about, nearest first, in one column. The countdown leads in a fixed 82px column; everything
   due today shares one card under a single Today, each row with its own time; every later thing is a
   card of its own. The x dismisses: it turns that thing's Remind me off, with Undo. Shared by the
   iOS, Android and web kits. Cards read --tp-card, which the band they sit in sets. */
function Reminders({and,onThread,web}){
  const R=window.OFFLOAD_DATA&&window.OFFLOAD_DATA.reminders;
  const [gone,setGone]=React.useState([]);
  const [toast,setToast]=React.useState(null);
  React.useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),4000);return()=>clearTimeout(t);},[toast]);
  if(!R)return null;
  const today=R.today.filter(x=>!gone.includes(x.name));
  const later=R.later.filter(x=>!gone.includes(x.name));
  const n=today.length+later.length;
  const card={borderRadius:and?16:14,background:"var(--tp-card, var(--surface-fill))",boxShadow:"inset 0 0 0 1px var(--edge-well)",cursor:"pointer"};
  const when=(big,small,soon)=><span style={{font:"var(--weight-semibold) 17px/1.15 var(--font-core)",letterSpacing:"-.01em",color:soon?"var(--amber-700)":"var(--text-primary)"}}>{big}
    <small style={{display:"block",font:"var(--weight-regular) 12px/1.3 var(--font-core)",color:"var(--text-tertiary)",letterSpacing:0,marginTop:2,fontVariantNumeric:"tabular-nums"}}>{small}</small></span>;
  const where=x=><span style={{display:"flex",alignItems:"center",gap:5,marginTop:3,font:"var(--weight-regular) 12.5px/1.2 var(--font-core)",color:"var(--text-secondary)"}}>
    <span style={{display:"flex",color:"var(--icon-on-well)"}}><TRIcon name={x.of==="memory"?"cloudy":x.of==="note"?"text-quote":x.thread?"lasso":"inbox"} size={12}/></span>
    {x.thread||(x.of==="memory"?"Memories":"Not in a thread")}
    {x.at?<span style={{color:"var(--amber-700)",fontWeight:500}}>{"\u00b7 "+x.at}</span>:null}</span>;
  const name=x=><b style={{display:"block",font:"var(--weight-medium) 15px/20px var(--font-core)"}}>{x.name}</b>;
  const X=x=><button type="button" aria-label={"Dismiss "+x.name} onClick={e=>{e.stopPropagation();setGone(g=>g.concat(x.name));setToast(x.name);}}
    style={{width:40,height:40,margin:"-4px -4px -4px 0",border:"none",background:"transparent",borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--icon-on-well)",cursor:"pointer"}}><TRIcon name="x" size={16}/></button>;
  const go=x=>()=>x.thread&&onThread&&onThread(x.thread);
  return <div>
    {n?<>
      <div style={{display:"flex",alignItems:"baseline",gap:8,paddingBottom:10,font:"var(--weight-semibold) 20px/1.2 var(--font-core)",letterSpacing:"-.01em"}}>Reminders
        <em style={{fontStyle:"normal",font:"var(--weight-regular) 13px/1 var(--font-core)",color:"var(--text-tertiary)",letterSpacing:0}}>{n}</em></div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {today.length?<div style={{...card,cursor:"default",display:"grid",gridTemplateColumns:"82px minmax(0,1fr)",columnGap:12,paddingLeft:14}}>
          <div style={{paddingTop:12}}>{when("Today",R.todayLabel,true)}</div>
          <div>{today.map((x,i)=><div key={x.name} role="button" tabIndex={0} onClick={go(x)} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",columnGap:12,alignItems:"center",padding:"12px 10px 12px 0",cursor:"pointer",boxShadow:i<today.length-1?"inset 0 -1px 0 var(--border-hairline)":"none"}}>
            <div>{name(x)}{where(x)}</div>{X(x)}</div>)}</div></div>:null}
        {later.map(x=><div key={x.name} role="button" tabIndex={0} onClick={go(x)} style={{...card,display:"grid",gridTemplateColumns:"82px minmax(0,1fr) auto",columnGap:12,alignItems:"center",padding:"12px 10px 12px 14px"}}>
          {when(x.when,x.day)}<div>{name(x)}{where(x)}</div>{X(x)}</div>)}
      </div></>:null}
    {toast?<div style={{position:web?"fixed":"absolute",left:web?"auto":"var(--gutter-screen)",right:web?28:"var(--gutter-screen)",bottom:web?120:150,width:web?380:"auto",zIndex:30,display:"flex",alignItems:"center",gap:12,minHeight:48,padding:"0 8px 0 16px",borderRadius:and?4:14,background:"var(--surface-inverse)",color:"var(--text-inverse)",font:"var(--weight-regular) 14px/1.3 var(--font-core)",boxShadow:"var(--shadow-3)"}}>
      <span style={{flex:1}}>{"Won't remind you about "+toast}</span>
      <button type="button" onClick={()=>{setGone(g=>g.filter(y=>y!==toast));setToast(null);}} style={{border:"none",background:"transparent",color:"var(--text-inverse)",font:"var(--weight-medium) 14px/1 var(--font-core)",padding:"0 10px",minHeight:44,cursor:"pointer"}}>Undo</button></div>:null}
  </div>;
}

Object.assign(window,{Reminders});
