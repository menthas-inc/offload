import React from "react";
import { Icon } from "./Icon.jsx";

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

const SIZES={sm:{box:32,icon:16},md:{box:40,icon:20},lg:{box:48,icon:22}};
const TAP_MIN=44;

export function IconButton({icon,label,variant="ghost",tone="neutral",size="md",shape="circle",disabled=false,onClick,hitArea=TAP_MIN,badge,style,...rest}){
  const {h,p,bind}=usePress();
  const s=SIZES[size]||SIZES.md;
  const skin={
    primary:tone==="attention"?{background:h?"var(--blue-700)":"var(--blue-600)",color:"var(--text-on-solid)",border:"1px solid transparent"}
      :tone==="accent"?{background:h?"var(--moss-700)":"var(--moss-600)",color:"var(--text-on-solid)",border:"1px solid transparent"}
      :{background:h?"var(--ink-800)":"var(--surface-inverse)",color:"var(--text-inverse)",border:"1px solid transparent"},
    secondary:{background:h?"var(--ink-50)":"var(--surface-raised)",color:"var(--text-primary)",border:"1px solid var(--border-strong)"},
    quiet:{background:h?"var(--surface-fill-strong)":"var(--surface-fill)",color:"var(--text-primary)",border:"1px solid transparent"},
    ghost:{background:h?"var(--state-hover)":"transparent",color:"var(--text-secondary)",border:"1px solid transparent"}
  }[variant]||{};
  /* tone recolours the glyph on the painted span: a colour passed on style lands on the
     outer hit-area element, which the inner span overrides, so it never reaches the mask. */
  const toned=variant==="primary"?undefined:{danger:"var(--text-danger)",accent:"var(--text-accent)",attention:"var(--text-attention)"}[tone];
  /* The drawn button can be 32px while the thing you can hit is 44px: the
     outer element carries the hit area and no paint, the inner span is the
     visual. Negative margins keep layout measured from the visual box. */
  const hit=Math.max(hitArea||0,s.box);
  const bleed=-(hit-s.box)/2;
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} {...bind} {...rest}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:hit,height:hit,flex:"0 0 auto",
        margin:bleed+"px",padding:0,border:"none",background:"transparent",
        cursor:disabled?"not-allowed":"pointer",...style}}>
      <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:s.box,height:s.box,
        borderRadius:shape==="circle"?"var(--radius-pill)":"var(--radius-sm)",
        transition:"background var(--transition-ui),transform var(--duration-instant) var(--ease-out),color var(--transition-ui)",
        transform:p&&!disabled?"scale(var(--press-scale))":"none",...skin,
        ...(toned?{color:toned}:null),
        ...(disabled?{background:"transparent",color:"var(--state-disabled-text)"}:null)}}>
        <Icon name={icon} size={s.icon}/>
        {/* Presence, not arithmetic: a dot on the glyph's top-right corner says there
            is something new without asking you to read a number. */}
        {badge?<span aria-hidden="true" style={{position:"absolute",top:5,right:5,width:8,height:8,
          borderRadius:"var(--radius-pill)",background:"var(--clay-600)",border:"1.5px solid var(--paper)"}}/>:null}
      </span>
    </button>
  );
}
