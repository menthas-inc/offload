import React from "react";
import { Icon } from "./Icon.jsx";

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

const SIZES={sm:{h:32,px:"var(--space-5)",font:"var(--size-label)",gap:"var(--space-2)",icon:16},md:{h:40,px:"var(--space-6)",font:"var(--size-body-sm)",gap:"var(--space-3)",icon:18},lg:{h:48,px:"var(--space-7)",font:"var(--size-body)",gap:"var(--space-4)",icon:20}};
const TAP_MIN=44;

export function Button({variant="primary",size="md",shape="rounded",icon,iconAfter,block=false,disabled=false,onClick,hitArea=TAP_MIN,children,style,...rest}){
  const {h,p,bind}=usePress();
  const s=SIZES[size]||SIZES.md;
  const skin={
    primary:{background:h?"var(--ink-800)":"var(--surface-inverse)",color:"var(--text-inverse)",border:"1px solid transparent"},
    secondary:{background:h?"var(--ink-50)":"var(--surface-raised)",color:"var(--text-primary)",border:"1px solid var(--border-strong)"},
    quiet:{background:h?"var(--surface-fill-strong)":"var(--surface-fill)",color:"var(--text-primary)",border:"1px solid transparent"},
    ghost:{background:h?"var(--state-hover)":"transparent",color:"var(--text-primary)",border:"1px solid transparent"}
  }[variant]||{};
  /* Visual height stays as drawn; the touch box grows to hitArea with transparent
     vertical padding, cancelled by a negative margin so the surrounding layout
     still measures from the visual box. */
  const hit=Math.max(hitArea||0,s.h);
  const bleed=-(hit-s.h)/2;
  return (
    <button type="button" disabled={disabled} onClick={onClick} {...bind} {...rest}
      style={{display:block?"flex":"inline-flex",width:block?"100%":undefined,alignItems:"center",justifyContent:"center",
        border:"none",background:"transparent",padding:0,height:hit,margin:bleed+"px 0",
        cursor:disabled?"not-allowed":"pointer",...style}}>
      <span style={{display:"flex",width:block?"100%":undefined,alignItems:"center",justifyContent:"center",gap:s.gap,
        height:s.h,padding:"0 "+s.px,boxSizing:"border-box",
        borderRadius:shape==="pill"?"var(--radius-pill)":"var(--radius-sm)",
        font:"var(--weight-medium) "+s.font+"/1 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-body)",
        transition:"background var(--transition-ui),transform var(--duration-instant) var(--ease-out),border-color var(--transition-ui)",
        transform:p&&!disabled?"scale(var(--press-scale))":"none",...skin,
        ...(disabled?{background:"var(--state-disabled-surface)",color:"var(--state-disabled-text)",borderColor:"transparent"}:null)}}>
        {icon?<Icon name={icon} size={s.icon}/>:null}
        {children?<span>{children}</span>:null}
        {iconAfter?<Icon name={iconAfter} size={s.icon}/>:null}
      </span>
    </button>
  );
}
