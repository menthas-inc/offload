import React from "react";

export function SegmentedControl({options=[],value,onChange,style,...rest}){
  return (
    <div role="tablist" {...rest} style={{display:"inline-flex",gap:2,padding:2,background:"var(--surface-fill)",boxShadow:"inset 0 0 0 1px var(--edge-well)",borderRadius:"var(--radius-sm)",...style}}>
      {options.map((o)=>{
        const v=typeof o==="string"?o:o.value,l=typeof o==="string"?o:o.label;
        const on=v===value;
        return <button key={v} type="button" role="tab" aria-selected={on} onClick={()=>onChange&&onChange(v)}
          style={{border:"none",cursor:"pointer",height:32,padding:"0 var(--space-6)",borderRadius:"calc(var(--radius-sm) - 2px)",
            background:on?"var(--paper)":"transparent",color:on?"var(--text-primary)":"var(--text-secondary)",
            boxShadow:on?"var(--shadow-1)":"none",font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",fontVariantNumeric:"tabular-nums",
            transition:"background var(--transition-ui),color var(--transition-ui)"}}>{l}</button>;
      })}
    </div>
  );
}
