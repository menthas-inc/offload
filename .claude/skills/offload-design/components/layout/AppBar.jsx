import React from "react";

export function AppBar({title,subtitle,left,right,border=true,align="left",style,...rest}){
  return (
    <header {...rest} style={{display:"flex",alignItems:"center",gap:"var(--space-4)",minHeight:"var(--appbar-height)",
      padding:"0 var(--gutter-screen)",background:"var(--surface-chrome-strong)",backdropFilter:"var(--blur-chrome)",WebkitBackdropFilter:"var(--blur-chrome)",
      borderBottom:border?"1px solid var(--border-hairline)":"1px solid transparent",...style}}>
      {left?<div style={{display:"flex",alignItems:"center",gap:"var(--space-2)",marginLeft:-8}}>{left}</div>:null}
      <div style={{flex:1,minWidth:0,textAlign:align}}>
        {title?<div style={{font:"var(--text-title-3)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>:null}
        {subtitle?<div style={{font:"var(--text-caption-role)",fontVariantNumeric:"tabular-nums",color:"var(--text-tertiary)",marginTop:1}}>{subtitle}</div>:null}
      </div>
      {right?<div style={{display:"flex",alignItems:"center",gap:"var(--space-2)",marginRight:-8}}>{right}</div>:null}
    </header>
  );
}
