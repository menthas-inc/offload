import React from "react";
import { Icon } from "./Icon.jsx";

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

export function Chip({children,icon,selected=false,tone="neutral",variant="solid",onClick,onRemove,hitArea=44,style,...rest}){
  const {h,p,bind}=usePress();
  const interactive=Boolean(onClick);
  /* Selection has to read on every tone, not just neutral: each one has a filled
     counterpart it inverts to when selected. */
  const fill=(base,deep,fg)=>({bg:selected||(h&&interactive)?deep:base,fg,bd:"transparent"});
  const tint=(soft,solid,deep,fg,on)=>selected?{bg:solid,fg:on,bd:"transparent"}
    :{bg:h&&interactive?deep:soft,fg,bd:"transparent"};
  const soft=variant==="soft";
  const tones={
    neutral:{bg:selected?"var(--surface-inverse)":h&&interactive?"var(--surface-fill-strong)":"var(--surface-fill)",fg:selected?"var(--text-inverse)":"var(--text-primary)",bd:"transparent"},
    accent:soft?tint("var(--surface-accent-soft)","var(--moss-600)","var(--moss-100)","var(--text-accent)","var(--text-on-solid)")
      :fill("var(--moss-600)","var(--moss-700)","var(--text-on-solid)"),
    attention:soft?tint("var(--blue-50)","var(--blue-600)","var(--blue-100)","var(--blue-700)","var(--text-on-solid)")
      :fill("var(--blue-600)","var(--blue-700)","var(--text-on-solid)"),
    warning:soft?tint("var(--amber-100)","var(--amber-600)","var(--amber-200)","var(--amber-700)","var(--amber-on)")
      :fill("var(--amber-600)","var(--amber-700)","var(--amber-on)"),
    danger:soft?tint("var(--clay-100)","var(--clay-600)","var(--clay-200)","var(--clay-700)","var(--text-on-solid)")
      :fill("var(--clay-600)","var(--clay-700)","var(--text-on-solid)"),
    outline:selected?{bg:"var(--surface-inverse)",fg:"var(--text-inverse)",bd:"transparent"}:{bg:h&&interactive?"var(--ink-50)":"transparent",fg:"var(--text-secondary)",bd:"var(--border-strong)"}
  }[tone]||{};
  /* Drawn 30px tall, but an interactive chip accepts a 44px tap: the outer
     element carries the hit area and no paint, cancelled by a negative margin. */
  const hit=interactive?Math.max(hitArea||0,30):30;
  const bleed=-(hit-30)/2;
  return (
    <span role={interactive?"button":undefined} onClick={onClick} {...(interactive?bind:{})} {...rest}
      style={{display:"inline-flex",alignItems:"center",height:hit,margin:bleed+"px 0",
        cursor:interactive?"pointer":"default",...style}}>
      <span style={{display:"inline-flex",alignItems:"center",gap:"var(--space-3)",height:30,padding:"0 var(--space-5)",
        borderRadius:"var(--radius-pill)",boxSizing:"border-box",
        background:tones.bg,color:tones.fg,border:"1px solid "+tones.bd,font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",fontVariantNumeric:"tabular-nums",
        letterSpacing:"var(--tracking-body)",whiteSpace:"nowrap",
        transition:"background var(--transition-ui),color var(--transition-ui),transform var(--duration-instant) var(--ease-out)",
        transform:p?"scale(var(--press-scale))":"none"}}>
        {icon?<Icon name={icon} size={14}/>:null}
        {children}
        {onRemove?<Icon name="x" size={13} style={{opacity:0.55,cursor:"pointer"}} onClick={(e)=>{e.stopPropagation();onRemove()}}/>:null}
      </span>
    </span>
  );
}
