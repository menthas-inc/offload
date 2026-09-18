import React from "react";
import { Icon } from "../core/Icon.jsx";

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

export function ListRow({title,meta,leading,trailing,reorder,dragging=false,over=false,chevron=false,selected=false,onClick,border=true,style,...rest}){
  const {h,p,bind}=usePress();
  const interactive=Boolean(onClick);
  /* Held and being moved: the row lifts off the list rather than tinting, so it reads as
     the thing in your hand while the list re-sorts under it. --shadow-2 because it is the
     only shadow token with a value in dark. */
  const lift=dragging?{background:"var(--surface-raised)",borderRadius:"var(--radius-sm)",boxShadow:"var(--shadow-2)"}:null;
  /* Where the drop would land: a 2px ink line on that edge, the row's full width, because
     every other boundary in the list is full width and this one is a boundary. */
  const line=over?{boxShadow:(over==="top"?"inset 0 2px 0":"inset 0 -2px 0")+" var(--ink-950)"}:null;
  return (
    <div onClick={onClick} {...(interactive?bind:{})} {...rest}
      style={{position:"relative",display:"flex",alignItems:"center",gap:"var(--space-5)",minHeight:meta?"var(--row-height-lg)":"var(--row-height)",
        padding:"var(--space-5) var(--gutter-screen)",cursor:interactive?"pointer":undefined,
        background:selected?"var(--state-selected)":p?"var(--state-press)":h&&interactive?"var(--state-hover)":"transparent",
        boxShadow:border?"inset 0 -1px 0 var(--border-hairline)":"none",transition:"background var(--transition-ui)",
        ...lift,...line,...style}}>
      {leading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)",flex:"0 0 auto"}}>{leading}</div>:null}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:2}}>
        <div style={{font:"var(--weight-medium) var(--size-body)/1.3 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-body)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        {meta?<div style={{font:"var(--text-body-sm-role)",fontVariantNumeric:"tabular-nums",color:"var(--text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meta}</div>:null}
      </div>
      {/* The handle leads the trailing controls, before the pencil. It does nothing when
          pressed, so unlike every other control in the row it never inverts to ink: it
          keeps --surface-fill and takes a grab cursor. Its target is the glyph plus 8px of
          slop rather than a full 44, which sits inside the row's own target and is the same
          compromise the row's other controls already make. */}
      {reorder||trailing?(
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",color:"var(--text-tertiary)",font:"var(--text-caption-role)",fontVariantNumeric:"tabular-nums",flex:"0 0 auto"}}>
          {reorder?<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:8,margin:-8,
            color:dragging?"var(--text-primary)":"var(--text-secondary)",cursor:"grab",touchAction:"none"}}>{reorder}</span>:null}
          {trailing}
        </div>
      ):null}
      {chevron?<span style={{color:"var(--ink-300)",display:"flex"}}><Icon name="chevron-right" size={18}/></span>:null}
    </div>
  );
}
