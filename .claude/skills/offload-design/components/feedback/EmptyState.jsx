import React from "react";
import { Icon } from "../core/Icon.jsx";

export function EmptyState({title,body,icon,action,style,...rest}){
  return (
    <div {...rest} style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:"var(--space-5)",
      padding:"var(--space-11) var(--space-9)",...style}}>
      {icon?<span style={{color:"var(--ink-300)"}}><Icon name={icon} size={28}/></span>:null}
      {title?<div style={{font:"var(--text-title-3)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)"}}>{title}</div>:null}
      {body?<p style={{margin:0,font:"var(--text-quiet-role)",fontVariantNumeric:"tabular-nums",fontSize:"var(--size-body)",color:"var(--text-secondary)",maxWidth:"32ch"}}>{body}</p>:null}
      {action?<div style={{marginTop:"var(--space-3)"}}>{action}</div>:null}
    </div>
  );
}
