import React from "react";
import { Icon } from "./Icon.jsx";

/* A person's label on a row: the date chip's geometry, the label's solid, white words. 26 Sep. */
export function LabelMark({children,color=1,size=20,onClick,onRemove,style,...rest}){
  const n=Math.min(10,Math.max(1,Math.round(color)||1));
  const interactive=Boolean(onClick);
  return (
    <span role={interactive?"button":undefined} tabIndex={interactive?0:undefined} onClick={onClick}
      onKeyDown={interactive?(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick(e)}}:undefined}
      {...rest}
      style={{display:"inline-flex",alignItems:"center",gap:"var(--space-2)",height:size,boxSizing:"border-box",
        padding:"0 "+(size>=24?"var(--space-3)":"7px"),borderRadius:"var(--radius-xs)",
        background:"var(--label-"+n+")",color:"var(--text-on-solid)",
        font:"var(--weight-medium) "+(size>=24?"var(--size-caption)":"12px")+"/1 var(--font-core)",
        whiteSpace:"nowrap",cursor:interactive?"pointer":"default",...style}}>
      {children}
      {onRemove?<Icon name="x" size={12} style={{cursor:"pointer"}} onClick={(e)=>{e.stopPropagation();onRemove()}}/>:null}
    </span>
  );
}
