import React from "react";

export function Switch({checked=false,onChange,disabled=false,label,style,...rest}){
  const track=(
    <span style={{width:44,height:26,flex:"0 0 auto",borderRadius:"var(--radius-pill)",padding:3,
      background:disabled?"var(--state-disabled-surface)":checked?"var(--surface-inverse)":"var(--surface-fill-strong)",
      transition:"background var(--duration-base) var(--ease-out)",display:"flex",justifyContent:checked?"flex-end":"flex-start"}}>
      <span style={{width:20,height:20,borderRadius:"var(--radius-pill)",background:"var(--paper)",boxShadow:"var(--shadow-1)",
        transition:"transform var(--duration-base) var(--ease-out)"}}/>
    </span>
  );
  return (
    <label {...rest} style={{display:"inline-flex",alignItems:"center",gap:"var(--space-5)",cursor:disabled?"not-allowed":"pointer",...style}}
      onClick={()=>!disabled&&onChange&&onChange(!checked)}>
      {label?<span style={{font:"var(--text-body-role)",fontVariantNumeric:"tabular-nums",color:"var(--text-primary)",flex:1}}>{label}</span>:null}
      {track}
    </label>
  );
}
