import React from "react";

/* The tick is an inline path, not a masked glyph, so it can draw itself along its length
   when a task is ticked off. Both phone kits animate exactly this. */
export function Checkbox({checked=false,onChange,label,meta,disabled=false,shape="rounded",style,...rest}){
  return (
    <label {...rest} onClick={()=>!disabled&&onChange&&onChange(!checked)}
      style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)",cursor:disabled?"not-allowed":"pointer",...style}}>
      <style>{"@keyframes offload-tick{from{stroke-dashoffset:22}to{stroke-dashoffset:0}}"}</style>
      <span style={{width:20,height:20,marginTop:2,flex:"0 0 auto",display:"flex",alignItems:"center",justifyContent:"center",
        borderRadius:shape==="circle"?"var(--radius-pill)":"var(--radius-xs)",
        border:"1px solid "+(checked?"transparent":"var(--border-strong)"),
        background:checked?"var(--surface-inverse)":"transparent",
        transition:"background var(--transition-ui),border-color var(--transition-ui)"}}>
        {checked?(
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" style={{strokeDasharray:22,animation:"offload-tick 220ms var(--ease-out) both"}}/>
          </svg>
        ):null}
      </span>
      {label?<span style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
        <span style={{font:"var(--text-body-role)",fontVariantNumeric:"tabular-nums",color:checked?"var(--text-tertiary)":"var(--text-primary)",textDecoration:checked?"line-through":"none",transition:"color 180ms linear"}}>{label}</span>
        {meta?<span style={{font:"var(--text-caption-role)",fontVariantNumeric:"tabular-nums",color:"var(--text-tertiary)"}}>{meta}</span>:null}
      </span>:null}
    </label>
  );
}
