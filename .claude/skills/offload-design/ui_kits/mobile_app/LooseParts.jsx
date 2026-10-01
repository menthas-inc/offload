/* Things without a thread (decided 1 October 2026, readme: Not in a thread).
   Shared by the iOS, Android and web kits. Stored in the account's default thread on main;
   that thread is never drawn as a thread. Rows are the things themselves. */
const LOOSE_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const LooseSwipe=LOOSE_DS.SwipeRow||(({children})=>children);
const LOOSE_SHOWN=3;
const LOOSE_TYPES=[["todo","square-check-big","To-dos"],["link","link","Links"],["photo","image","Photos"],["note","text-quote","Notes"],["event","calendar","Events"]];

function LooseGlyph({name,size=16}){
  const I=LOOSE_DS.Icon;return I?<I name={name} size={size}/>:null;
}

/* The whole line is one button. Existing thread: moss soft ground, lasso. New thread:
   dashed moss outline on paper, plus, and the words "new thread". The pill is a label
   here and never opens the thread. */
function LooseSuggestion({sug,threads,onAccept,onDismiss,and}){
  const existing=!!sug.to;
  const name=existing?((threads.find(t=>t.id===sug.to)||{}).name||sug.to):sug.name;
  const r=and?8:99;
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
      <button onClick={onAccept} style={{all:"unset",cursor:"pointer",minHeight:32,boxSizing:"border-box",
        display:"inline-flex",alignItems:"center",gap:6,padding:"0 12px 0 10px",borderRadius:r,maxWidth:"100%",
        background:existing?"var(--surface-accent-soft)":"var(--surface-raised)",
        border:existing?"1px solid transparent":"1px dashed var(--moss-600)",
        font:"var(--weight-regular) 13px/1 var(--font-core)",color:"var(--text-secondary)"}}>
        <span style={{color:"var(--moss-600)",display:"flex"}}><LooseGlyph name="sparkles" size={13}/></span>
        {existing?"Move to":"Create"}
        <span style={{display:"inline-flex",alignItems:"center",gap:4,color:"var(--moss-700)",fontWeight:500,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}>
          <LooseGlyph name={existing?"lasso":"plus"} size={12}/>{name}
        </span>
        {existing?null:<span style={{color:"var(--text-secondary)"}}>new thread</span>}
      </button>
      <button aria-label="Dismiss suggestion" onClick={onDismiss} style={{all:"unset",cursor:"pointer",width:32,height:32,
        display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-tertiary)"}}>
        <LooseGlyph name="x" size={14}/>
      </button>
    </div>
  );
}

function LooseRow({item,threads,border,onAccept,onDismiss,onDelete,and,web}){
  const tileBg=and?"var(--a-c-low)":"var(--surface-fill)";
  const row=(
    <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:web?"10px 0":"12px var(--gutter-screen)",
      background:web?"transparent":(and?"var(--a-surface)":"var(--surface-page)"),
      boxShadow:border?"inset 0 -1px 0 var(--border-hairline)":"none"}}>
      <span style={{width:36,height:36,flex:"0 0 auto",borderRadius:and?8:"var(--radius-sm)",display:"flex",
        alignItems:"center",justifyContent:"center",color:"var(--text-secondary)",
        background:item.type==="photo"?"linear-gradient(135deg,var(--ink-200),var(--ink-100))":tileBg}}>
        {item.type==="photo"?null:<LooseGlyph name={item.icon} size={18}/>}
      </span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{font:"var(--weight-medium) 15.5px/21px var(--font-core)",color:and?"var(--a-on)":"var(--text-primary)",
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
        <div style={{marginTop:2,font:"var(--weight-regular) 13px/18px var(--font-core)",color:and?"var(--a-on-var)":"var(--text-secondary)"}}>{item.meta}</div>
        {item.sug?<LooseSuggestion sug={item.sug} threads={threads} and={and} onAccept={onAccept} onDismiss={onDismiss}/>:null}
      </div>
    </div>
  );
  return web?row:<LooseSwipe background={and?"var(--a-surface)":undefined} onDelete={onDelete}>{row}</LooseSwipe>;
}

/* The group on My threads: header with count, type chips that filter in place, three
   rows, then All N (of that type when filtered). Not drawn when empty. */
function LooseGroup({items,threads,Section,and,web,onOpenAll,onToast}){
  const [type,setType]=React.useState(null);
  const [gone,setGone]=React.useState({});
  const [dismissed,setDismissed]=React.useState({});
  const live=items.filter(i=>!gone[i.id]).map(i=>dismissed[i.id]?{...i,sug:null}:i);
  if(!live.length)return null;
  const types=LOOSE_TYPES.filter(([k])=>live.some(i=>i.type===k));
  const list=type?live.filter(i=>i.type===type):live;
  const shown=list.slice(0,LOOSE_SHOWN);
  const label=type?(LOOSE_TYPES.find(t=>t[0]===type)[2]).toLowerCase():null;
  const accept=item=>{
    const s=item.sug;
    if(s.to){setGone(g=>({...g,[item.id]:1}));
      const t=threads.find(x=>x.id===s.to);onToast&&onToast("Moved to "+(t?t.name:s.to));return;}
    const ids=s.with||[item.id];setGone(g=>{const n={...g};ids.forEach(id=>n[id]=1);return n});
    onToast&&onToast(s.name+" created");
  };
  const chip=(k,glyph,name,n)=>{
    const on=(type||null)===k;
    return <button key={k||"all"} onClick={()=>setType(k)} style={{all:"unset",cursor:"pointer",flex:"0 0 auto",display:"inline-flex",
      alignItems:"center",gap:6,height:and?32:34,padding:"0 12px",borderRadius:and?8:99,whiteSpace:"nowrap",
      font:"var(--weight-medium) 13px/1 var(--font-core)",
      background:on?(and?"var(--surface-accent-soft)":"var(--surface-inverse)"):(and?"transparent":"var(--surface-fill)"),
      color:on?(and?"var(--moss-700)":"var(--text-inverse)"):"var(--text-primary)",
      boxShadow:and&&!on?"inset 0 0 0 1px var(--a-outline)":"none"}}>
      {glyph?<LooseGlyph name={glyph} size={14}/>:null}{name}
      <span style={{fontWeight:400,opacity:.7}}>{n}</span></button>;
  };
  return (
    <>
      <Section count={live.length}>Not in a thread</Section>
      {types.length>1?<div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",
        padding:web?"0 0 6px":"0 var(--gutter-screen) 6px"}}>
        {chip(null,null,"All",live.length)}
        {types.map(([k,g,n])=>chip(k,g,n,live.filter(i=>i.type===k).length))}
      </div>:null}
      {shown.map((it,i)=><LooseRow key={it.id} item={it} threads={threads} and={and} web={web}
        border={i<shown.length-1}
        onAccept={()=>accept(it)} onDismiss={()=>setDismissed(d=>({...d,[it.id]:1}))}
        onDelete={()=>{setGone(g=>({...g,[it.id]:1}));onToast&&onToast("Deleted")}}/>)}
      {list.length>LOOSE_SHOWN?<div style={{padding:web?"var(--space-4) 0 0":"var(--space-5) var(--gutter-screen) 0"}}>
        <button onClick={()=>onOpenAll&&onOpenAll(type)} style={{all:"unset",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4,
          minHeight:44,font:"var(--weight-medium) 14px/1 var(--font-core)",color:"var(--text-secondary)"}}>
          {"All "+list.length+(label?" "+label:"")}<LooseGlyph name="chevron-right" size={14}/></button>
      </div>:null}
    </>
  );
}

Object.assign(window,{LooseGroup,LooseRow,LooseSuggestion,LOOSE_TYPES});
