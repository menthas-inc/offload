import React from "react";
import { Icon } from "./Icon.jsx";

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

export function Chip({children,icon,label,selected=false,tone="neutral",disabled=false,onClick,onRemove,hitArea=44,style,...rest}){
  const {h,p,bind}=usePress();
  const interactive=Boolean(onClick)&&!disabled;
  /* Selection has to read on every tone, not just neutral: each one has a filled
     counterpart it inverts to when selected. There is no soft variant. The soft
     tints sat too close to paper to read as colour at chip size and were retired;
     a tone is a fill. */
  const fill=(base,deep,fg)=>({bg:selected||(h&&interactive)?deep:base,fg,bd:"transparent"});
  let tones={
    neutral:{bg:selected?"var(--surface-inverse)":h&&interactive?"var(--surface-fill-strong)":"var(--surface-fill)",fg:selected?"var(--text-inverse)":"var(--text-primary)",bd:"transparent"},
    accent:fill("var(--moss-600)","var(--moss-700)","var(--text-on-solid)"),
    attention:fill("var(--blue-600)","var(--blue-700)","var(--text-on-solid)"),
    warning:fill("var(--amber-600)","var(--amber-700)","var(--amber-on)"),
    danger:fill("var(--clay-600)","var(--clay-700)","var(--text-on-solid)"),
    outline:selected?{bg:"var(--surface-inverse)",fg:"var(--text-inverse)",bd:"transparent"}:{bg:h&&interactive?"var(--ink-50)":"transparent",fg:"var(--text-secondary)",bd:"var(--border-strong)"}
  }[tone]||{};
  /* A label chip in the filter bar: neutral at rest with the label's dot, and the label's own
     solid when selected rather than ink, so two picked labels read as the two they are. */
  const lab=label?Math.min(10,Math.max(1,Math.round(label))):0;
  if(lab&&selected&&!disabled){tones.bg="var(--label-"+lab+")";tones.fg="var(--text-on-solid)";tones.bd="transparent"}
  /* Unavailable, and it has to look unavailable rather than faded: a fill and a
     text colour, no opacity, because opacity on a chip over a warm page reads as
     a rendering artefact and takes the label under the contrast floor with it. */
  const paint=disabled?{bg:"var(--state-disabled-surface)",fg:"var(--state-disabled-text)",bd:"transparent"}:tones;
  /* Drawn 30px tall, but an interactive chip accepts a 44px tap: the outer
     element carries the hit area and no paint, cancelled by a negative margin. */
  const hit=interactive?Math.max(hitArea||0,30):30;
  const bleed=-(hit-30)/2;
  return (
    <span role={interactive?"button":undefined} aria-disabled={disabled?true:undefined}
      onClick={interactive?onClick:undefined} {...(interactive?bind:{})} {...rest}
      style={{display:"inline-flex",alignItems:"center",height:hit,margin:bleed+"px 0",
        cursor:interactive?"pointer":"default",...style}}>
      <span style={{display:"inline-flex",alignItems:"center",gap:"var(--space-3)",height:30,padding:"0 var(--space-5)",
        borderRadius:"var(--radius-pill)",boxSizing:"border-box",
        background:paint.bg,color:paint.fg,border:"1px solid "+paint.bd,font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",fontVariantNumeric:"tabular-nums",
        letterSpacing:"var(--tracking-body)",whiteSpace:"nowrap",
        transition:"background var(--transition-ui),color var(--transition-ui),transform var(--duration-instant) var(--ease-out)",
        transform:p&&interactive?"scale(var(--press-scale))":"none"}}>
        {lab?<span aria-hidden="true" style={{width:8,height:8,borderRadius:"var(--radius-pill)",flex:"0 0 auto",background:selected&&!disabled?"var(--text-on-solid)":"var(--label-"+lab+")"}}/>:null}
        {icon?<Icon name={icon} size={14}/>:null}
        {children}
        {onRemove&&!disabled?<Icon name="x" size={13} style={{opacity:0.55,cursor:"pointer"}} onClick={(e)=>{e.stopPropagation();onRemove()}}/>:null}
      </span>
    </span>
  );
}
