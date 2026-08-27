const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { IconButton, Icon } = OFFLOAD_DS;

const PLACEHOLDERS=["Dump anything","What's on your mind?","Half a thought is fine","Say it before you forget","Anything, in any order","Throw it in here","No need to tidy it","Paste it, I'll sort it","A link, a photo, a mumble","Tell me the messy version","Something you'll want later","Out of your head, in here","Don't file it, just drop it","Even if it's three things at once","Whatever you're holding","I'll find it a home","Type it badly, that's fine","One line is enough","Where does this go? Not your problem","Give it to me"];

/* The field grows with the text up to half the screen, then scrolls. Enter sends on a
   keyboard; where there is no keyboard the return key makes a new line and the send
   button is the only way to submit. */
const COMPOSER_MAX=380;
const HAS_KEYBOARD=typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(pointer:fine)").matches;
/* Mocked picks, so a photo reads as a real file rather than a generic slot. */
const PHOTO_FILES=["IMG_4821.HEIC","shelf-brackets.png","receipt-11-aug.jpg","boarding-pass.pdf","screenshot.png"];
const WAVE_BARS=32;

function Waveform({bars}){
  return (
    <span style={{flex:1,minWidth:0,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:2,height:24,overflow:"hidden"}}>
      {bars.map((h,i)=>(
        <span key={i} style={{width:3,flex:"0 0 auto",borderRadius:2,height:Math.max(3,Math.round(h*24)),
          background:"var(--a-on)",opacity:0.35+0.65*(i/WAVE_BARS)}}/>
      ))}
    </span>
  );
}

/* The remove control is a plain glyph, not an IconButton: a 44px hit area inside a
   26px chip bleeds a hover pill out past the chip's own edge. */
function AttachChip({name,onRemove}){
  const [h,setH]=React.useState(false);
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,maxWidth:"100%",height:26,padding:"0 4px 0 8px",
      borderRadius:"var(--radius-pill)",background:"var(--a-c-high)",border:"1px solid var(--a-outline)"}}>
      <Icon name="image" size={13} style={{color:"var(--a-on-var)"}}/>
      <span title={name} style={{fontSize:"var(--size-caption)",lineHeight:1.2,color:"var(--a-on-var)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name.length>20?name.slice(0,20)+"\u2026":name}</span>
      <button type="button" aria-label={"Remove "+name} title={"Remove "+name} onClick={onRemove}
        onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,flex:"0 0 auto",
          padding:0,border:"none",borderRadius:"var(--radius-pill)",cursor:"pointer",
          background:h?"var(--a-c-high)":"transparent",color:h?"var(--a-on)":"var(--a-on-var)",
          transition:"background var(--transition-ui),color var(--transition-ui)"}}>
        <Icon name="x" size={12}/>
      </button>
    </span>
  );
}

function Composer({value,onChange,onSubmit,placeholder,bare}){
  const [focus,setFocus]=React.useState(false);
  /* "@" opens the connection picker, here and in every other field. */
  const at=/(?:^|\s)@([\w]*)$/.exec(value||"");
  const pickMention=(p)=>onChange((value||"").replace(/@[\w]*$/,"@"+p.name.split(" ")[0]+" "));
  const ref=React.useRef(null);
  const mirrorRef=React.useRef(null);
  const pillRef=React.useRef(null);
  const actionsRef=React.useRef(null);
  const [tall,setTall]=React.useState(false);
  const [photos,setPhotos]=React.useState([]);
  const [rec,setRec]=React.useState(null); // {secs,bars}
  React.useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    el.style.height="auto";
    const h=Math.min(el.scrollHeight,COMPOSER_MAX);
    el.style.height=h+"px";
    el.style.overflowY=el.scrollHeight>COMPOSER_MAX?"auto":"hidden";
    const pill=pillRef.current,actions=actionsRef.current,mirror=mirrorRef.current;
    if(pill&&actions&&mirror){
      const cs=getComputedStyle(pill);
      const inner=pill.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      mirror.style.width=Math.max(40,inner-actions.offsetWidth-12)+"px";
      setTall(mirror.scrollHeight>28);
    } else setTall(h>28);
  },[value]);
  React.useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    el.style.height="auto";
    el.style.height=Math.min(el.scrollHeight,COMPOSER_MAX)+"px";
  },[tall,photos.length]);
  React.useEffect(()=>{
    if(!rec)return;
    const t=setInterval(()=>setRec(r=>r?{secs:r.secs+0.1,bars:[...r.bars,0.15+Math.random()*0.85].slice(-WAVE_BARS)}:r),100);
    return ()=>clearInterval(t);
  },[!!rec]);
  const [ph,setPh]=React.useState(0);
  const [fade,setFade]=React.useState(1);
  const typed=value.trim().length>0;
  const has=typed||photos.length>0||!!rec;
  React.useEffect(()=>{
    if(focus||typed)return;
    const t=setInterval(()=>{
      setFade(0);
      setTimeout(()=>{setPh(p=>(p+1)%PLACEHOLDERS.length);setFade(1)},180);
    },10000);
    return ()=>clearInterval(t);
  },[focus,typed]);
  const addPhoto=()=>setPhotos(p=>[...p,PHOTO_FILES[p.length%PHOTO_FILES.length]]);
  const send=()=>{
    if(!has)return;
    const voice=rec?{secs:Math.max(1,Math.round(rec.secs)),bars:rec.bars}:null;
    setRec(null);setPhotos([]);
    onSubmit({text:value,photos,voice});
  };
  const mmss=(s)=>{const t=Math.floor(s);return Math.floor(t/60)+":"+String(t%60).padStart(2,"0")};
  const expanded=tall||photos.length>0;
  return (
    <div style={bare?{padding:"var(--space-4) var(--gutter-screen) var(--space-5)"}
      :{padding:"var(--space-4) var(--gutter-screen) var(--space-5)",background:"var(--surface-chrome)",
      backdropFilter:"var(--blur-chrome)",WebkitBackdropFilter:"var(--blur-chrome)",borderTop:"1px solid transparent"}}>
      {at&&window.MentionList?<MentionList query={at[1]} onPick={pickMention}/>:null}
      <span ref={mirrorRef} aria-hidden="true" style={{position:"absolute",visibility:"hidden",pointerEvents:"none",
        whiteSpace:"pre-wrap",wordBreak:"break-word",font:"var(--text-body-role)",letterSpacing:"var(--tracking-body)"}}>{value+"\u200B"}</span>
      <div ref={pillRef} style={{display:"flex",flexDirection:expanded?"column":"row",alignItems:expanded?"stretch":"center",gap:expanded?"var(--space-4)":"var(--space-3)",minHeight:48,
        padding:expanded?"var(--space-4) var(--space-3) var(--space-3) var(--space-6)":"0 var(--space-3) 0 var(--space-6)",
        borderRadius:expanded?"var(--radius-lg)":"var(--radius-pill)",background:"var(--surface-raised)",
        border:"1px solid var(--border-focus)",
        boxShadow:focus?"0 0 0 3px var(--surface-attention-soft)":"none",
        transition:"box-shadow var(--transition-ui)"}}>
        {rec?(
          <>
            {photos.length?(
              <span style={{display:"flex",alignItems:"center",gap:"var(--space-2)",flexWrap:"wrap"}}>
                {photos.map((f,i)=><AttachChip key={f+i} name={f} onRemove={()=>setPhotos(p=>p.filter((_,j)=>j!==i))}/>)}
              </span>
            ):null}
            <span style={{display:"flex",alignItems:"center",gap:"var(--space-3)",flex:1,minWidth:0,width:"100%"}}>
            <span style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <span style={{width:8,height:8,borderRadius:"50%",flex:"0 0 auto",background:"var(--text-danger)",
                animation:"offload-rec-pulse 1.2s var(--ease-out) infinite"}}/>
              <span style={{font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",color:"var(--a-on-var)",flex:"0 0 auto"}}>{mmss(rec.secs)}</span>
              <Waveform bars={rec.bars}/>
            </span>
            <IconButton icon="trash-2" label="Discard recording" tone="danger" size="sm" onClick={()=>setRec(null)}/>
            <IconButton icon="arrow-up" label="Send" variant="primary" size="sm" onClick={send}/>
            </span>
          </>
        ):(
          <>
            <span style={{flex:1,minWidth:0,position:"relative",display:"flex",alignItems:"center",padding:0}}>
              <textarea ref={ref} rows={1} value={value} onChange={(e)=>onChange(e.target.value)}
                onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
                onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey&&HAS_KEYBOARD){e.preventDefault();send()}}}
                style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",resize:"none",display:"block",
                  padding:0,margin:0,font:"var(--text-body-role)",fontVariantNumeric:"tabular-nums",
                  letterSpacing:"var(--tracking-body)",color:"var(--a-on)"}}/>
              {typed?null:(
                <span aria-hidden="true" style={{position:"absolute",left:0,right:0,bottom:tall?0:"auto",pointerEvents:"none",
                  font:"var(--text-body-role)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-body)",color:"var(--a-on-var)",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                  opacity:placeholder?1:fade,transition:"opacity var(--duration-base) var(--ease-out)"}}>{placeholder||PLACEHOLDERS[ph]}</span>
              )}
            </span>
            <span style={{display:"flex",alignItems:"center",gap:"var(--space-2)",flexWrap:"wrap",minWidth:0}}>
              {photos.map((f,i)=><AttachChip key={f+i} name={f} onRemove={()=>setPhotos(p=>p.filter((_,j)=>j!==i))}/>)}
              <span ref={actionsRef} style={{display:"flex",alignItems:"center",gap:"var(--space-2)",flex:"0 0 auto",marginLeft:"auto"}}>
                <IconButton icon="camera" label="Photo" size="sm" onClick={addPhoto}/>
                <IconButton icon="mic" label="Voice note" size="sm" onClick={()=>setRec({secs:0,bars:[]})}/>
                <IconButton icon="arrow-up" label="Send" variant={has?"primary":"quiet"} tone={has?"attention":undefined} size="sm" onClick={send}/>
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window,{Composer});
