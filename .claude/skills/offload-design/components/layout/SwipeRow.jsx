import React from "react";
import { Icon } from "../core/Icon.jsx";

/* Only one row is ever open, so opening one closes the rest. */
const OPEN_ROWS = new Set();

export function SwipeRow({children,onDelete,label="Delete",revealWidth=88,background="var(--surface-page)",style,...rest}){
  const [dx,setDx]=React.useState(0);
  const [snap,setSnap]=React.useState(true);
  const at=React.useRef(0);
  const open=React.useRef(false);
  const from=React.useRef(0);
  const dragging=React.useRef(false);
  const close=React.useCallback(()=>{open.current=false;at.current=0;setSnap(true);setDx(0)},[]);
  React.useEffect(()=>{OPEN_ROWS.add(close);return()=>{OPEN_ROWS.delete(close)}},[close]);
  const set=(v)=>{at.current=v;setDx(v)};
  const captured=React.useRef(false);
  const down=(e)=>{
    if(e.target.closest("[data-swipe-action]"))return;
    dragging.current=true;
    captured.current=false;
    from.current=e.clientX;
    setSnap(false);
    OPEN_ROWS.forEach(fn=>{if(fn!==close)fn()});
  };
  const move=(e)=>{
    if(!dragging.current)return;
    const d=e.clientX-from.current;
    if(!captured.current){
      if(Math.abs(d)<6)return;
      captured.current=true;
      if(e.currentTarget.setPointerCapture)try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}
    }
    const base=open.current?-revealWidth:0;
    set(Math.max(-revealWidth-20,Math.min(0,d+base)));
  };
  const up=(e)=>{
    if(!dragging.current)return;
    dragging.current=false;
    if(captured.current&&e&&e.currentTarget.releasePointerCapture)
      try{e.currentTarget.releasePointerCapture(e.pointerId)}catch(_){}
    captured.current=false;
    setSnap(true);
    /* Halfway decides, so a nudge springs back and a real pull parks. */
    const parked=at.current<-revealWidth/2;
    open.current=parked;
    set(parked?-revealWidth:0);
  };
  return (
    <div {...rest} style={{position:"relative",overflow:"hidden",...style}}>
      {/* Opacity comes from the same value as the offset, deliberately. The panel
         sits behind the row and the row's own opaque background covers it, which
         holds right up until something fades the whole screen as one layer: a tab
         change, a modal, a list animating in. At 50% through a cross-fade the clay
         reads straight through every closed row at once. Hiding by stacking order
         is not hiding. */}
      <div aria-hidden={dx===0?"true":undefined}
        style={{position:"absolute",inset:0,display:"flex",justifyContent:"flex-end",
          opacity:Math.min(1,Math.abs(dx)/12),pointerEvents:dx===0?"none":undefined}}>
        <button data-swipe-action type="button" aria-label={label} tabIndex={dx===0?-1:0}
          onClick={()=>{close();if(onDelete)onDelete()}}
          style={{width:revealWidth,flex:"0 0 auto",border:"none",cursor:"pointer",padding:0,
            background:"var(--clay-600)",color:"var(--text-on-solid)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,
            font:"var(--weight-medium) var(--size-caption)/1 var(--font-core)"}}>
          <Icon name="trash-2" size={17}/>{label}
        </button>
      </div>
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{position:"relative",background,touchAction:"pan-y",
          transform:"translateX("+dx+"px)",
          transition:snap?"transform var(--duration-base) var(--ease-out)":"none"}}>
        {children}
      </div>
    </div>
  );
}
