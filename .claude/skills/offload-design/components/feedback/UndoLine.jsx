import React from "react";
import { Icon } from "../core/Icon.jsx";

/* Undo, in place (18 October 2026). The way back is drawn where the change is, never over the page.

   slot:  the thing left its list. The line takes its slot, at its height, on amber.
   under: the thing stayed, changed. A short grey line directly beneath it.
   plate: the change has no row on screen (a dump filed from Today). A line above the composer.

   Eight seconds, drawn as a rule along the foot that empties. Several run at once, each with its
   own clock. No close: it covers nothing. Failed keeps the ground and the place, swaps the glyph
   for circle-alert, the action for Retry, and the live region for an alert. */

const FORMS={
  slot:{minHeight:56,padding:"0 var(--space-6)",background:"var(--amber-100)",color:"var(--amber-700)",glyph:"var(--amber-700)",act:"var(--amber-700)",rule:"var(--amber-600)",font:"var(--weight-regular) 14px/1.3 var(--font-core)",under:true},
  under:{minHeight:36,padding:"0 var(--space-6) 0 47px",background:"transparent",color:"var(--text-secondary)",glyph:"var(--text-tertiary)",act:"var(--text-accent)",rule:"var(--border-strong)",font:"var(--weight-regular) 13px/1.3 var(--font-core)"},
  plate:{minHeight:40,padding:"0 var(--space-3) 0 var(--space-6)",background:"var(--surface-raised)",color:"var(--text-secondary)",glyph:"var(--text-tertiary)",act:"var(--text-accent)",rule:"var(--border-strong)",font:"var(--weight-regular) 13.5px/1.3 var(--font-core)",radius:12,edge:true}
};

export function UndoLine({message,action,onAction,form="slot",failed=false,icon,wrap=false,duration=8000,startedAt,onExpire,radius,style,...rest}){
  const f=FORMS[form]||FORMS.slot;
  const t0=React.useRef(startedAt||Date.now());
  const [closing,setClosing]=React.useState(false);
  React.useEffect(()=>{
    if(!onExpire)return;
    const left=Math.max(0,duration-(Date.now()-t0.current));
    const a=setTimeout(()=>setClosing(true),left);
    const b=setTimeout(()=>onExpire(),left+240);
    return ()=>{clearTimeout(a);clearTimeout(b)};
  },[duration,onExpire]);
  const glyph=failed?"circle-alert":(icon===undefined?"check":icon);
  const label=action||(failed?"Retry":"Undo");
  const spent=Math.min(Date.now()-t0.current,duration);
  return (
    <div role={failed?"alert":"status"} {...rest} style={{position:"relative",display:"flex",alignItems:"center",gap:"var(--space-4)",
      boxSizing:"border-box",overflow:"hidden",minHeight:f.minHeight,padding:f.padding,background:f.background,color:f.color,
      borderRadius:radius!==undefined?radius:(f.radius||0),boxShadow:f.edge?"inset 0 0 0 1px var(--border-hairline)":"none",
      font:f.font,fontVariantNumeric:"tabular-nums",
      animation:closing?"offload-ul-out 240ms var(--ease-out) both":"offload-ul-in 200ms var(--ease-entrance) both",...style}}>
      {glyph?<span style={{display:"flex",color:f.glyph}}><Icon name={glyph} size={form==="under"?14:16}/></span>:null}
      <span style={wrap?{flex:1,minWidth:0,padding:"8px 0",textWrap:"pretty"}:{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{message}</span>
      <button type="button" onClick={onAction} style={{flex:"0 0 auto",minHeight:44,margin:"-12px -6px",padding:"0 10px",border:"none",
        background:"transparent",cursor:"pointer",color:f.act,font:"var(--weight-medium) "+(form==="under"?"13px":"14px")+"/1 var(--font-core)",
        textDecoration:f.under?"underline":"none",textUnderlineOffset:3,textDecorationThickness:1}}>{label}</button>
      {failed?null:<i aria-hidden="true" style={{position:"absolute",left:0,right:0,bottom:0,height:2,background:f.rule,transformOrigin:"left",
        animation:"offload-ul-run "+duration+"ms linear both",animationDelay:"-"+spent+"ms"}}/>}
      <style>{"@keyframes offload-ul-in{from{opacity:0;transform:translateY(3px)}}@keyframes offload-ul-run{from{transform:scaleX(1)}to{transform:scaleX(0)}}@keyframes offload-ul-out{to{opacity:0;max-height:0;min-height:0;padding-top:0;padding-bottom:0}}@media (prefers-reduced-motion:reduce){[role=status],[role=alert]{animation:none!important}}"}</style>
    </div>
  );
}
