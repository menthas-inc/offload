import React from "react";
import { Icon } from "../core/Icon.jsx";

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

export function ListRow({title,meta,leading,trailing,chevron=false,selected=false,onClick,border=true,style,...rest}){
  const {h,p,bind}=usePress();
  const interactive=Boolean(onClick);
  return (
    <div onClick={onClick} {...(interactive?bind:{})} {...rest}
      style={{display:"flex",alignItems:"center",gap:"var(--space-5)",minHeight:meta?"var(--row-height-lg)":"var(--row-height)",
        padding:"var(--space-5) var(--gutter-screen)",cursor:interactive?"pointer":undefined,
        background:selected?"var(--state-selected)":p?"var(--state-press)":h&&interactive?"var(--state-hover)":"transparent",
        boxShadow:border?"inset 0 -1px 0 var(--border-hairline)":"none",transition:"background var(--transition-ui)",...style}}>
      {leading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)",flex:"0 0 auto"}}>{leading}</div>:null}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:2}}>
        <div style={{font:"var(--weight-medium) var(--size-body)/1.3 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-body)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        {meta?<div style={{font:"var(--text-body-sm-role)",fontVariantNumeric:"tabular-nums",color:"var(--text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meta}</div>:null}
      </div>
      {trailing?<div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",color:"var(--text-tertiary)",font:"var(--text-caption-role)",fontVariantNumeric:"tabular-nums",flex:"0 0 auto"}}>{trailing}</div>:null}
      {chevron?<span style={{color:"var(--ink-300)",display:"flex"}}><Icon name="chevron-right" size={18}/></span>:null}
    </div>
  );
}
