import React from "react";

export function Spinner({size=18,label,style,...rest}){
  return (
    <span {...rest} style={{display:"inline-flex",alignItems:"center",gap:"var(--space-4)",color:"var(--text-tertiary)",...style}}>
      <span style={{width:size,height:size,borderRadius:"var(--radius-pill)",border:"1.5px solid var(--ink-200)",
        borderTopColor:"var(--ink-700)",animation:"offload-spin 720ms linear infinite"}}/>
      {label?<span style={{font:"var(--text-caption-role)",fontVariantNumeric:"tabular-nums"}}>{label}</span>:null}
      <style>{"@keyframes offload-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}
