import React from "react";
import { Icon } from "../core/Icon.jsx";

export function Toast({message,action,onAction,icon="check",style,...rest}){
  return (
    <div role="status" {...rest} style={{display:"flex",alignItems:"center",gap:"var(--space-5)",padding:"var(--space-5) var(--space-6)",
      background:"var(--surface-inverse)",color:"var(--text-inverse)",borderRadius:"var(--radius-md)",boxShadow:"var(--shadow-3)",
      animation:"offload-toast var(--duration-slow) var(--ease-entrance) both",...style}}>
      {icon?<Icon name={icon} size={18} style={{opacity:0.8}}/>:null}
      <span style={{flex:1,font:"var(--text-body-sm-role)",fontVariantNumeric:"tabular-nums"}}>{message}</span>
      {action?<button type="button" onClick={onAction} style={{border:"none",background:"transparent",cursor:"pointer",padding:0,
        color:"var(--text-inverse)",font:"var(--weight-medium) var(--size-body-sm)/1 var(--font-core)",fontVariantNumeric:"tabular-nums",textDecoration:"underline",textUnderlineOffset:3}}>{action}</button>:null}
      <style>{"@keyframes offload-toast{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}"}</style>
    </div>
  );
}
