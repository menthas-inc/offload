import React from "react";

export function Sheet({open=true,title,children,footer,onClose,style,...rest}){
  if(!open) return null;
  return (
    <div style={{position:"absolute",inset:0,zIndex:20,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"var(--surface-scrim)",animation:"offload-fade var(--duration-base) var(--ease-out) both"}}/>
      <section {...rest} style={{position:"relative",background:"var(--surface-raised)",borderRadius:"var(--radius-sheet) var(--radius-sheet) 0 0",
        boxShadow:"var(--shadow-sheet)",padding:"var(--space-5) var(--gutter-screen) var(--space-8)",
        animation:"offload-rise var(--duration-sheet) var(--ease-entrance) both",...style}}>
        <div style={{width:36,height:4,borderRadius:"var(--radius-pill)",background:"var(--ink-200)",margin:"0 auto var(--space-6)"}}/>
        {title?<h2 style={{margin:"0 0 var(--space-5)",font:"var(--weight-semibold) var(--size-title-1)/var(--leading-title) var(--font-core)",fontVariantNumeric:"tabular-nums",fontSize:21,letterSpacing:"var(--tracking-title)"}}>{title}</h2>:null}
        {children}
        {footer?<div style={{marginTop:"var(--space-7)",display:"flex",gap:"var(--space-4)"}}>{footer}</div>:null}
        <style>{"@keyframes offload-rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}@keyframes offload-fade{from{opacity:0}to{opacity:1}}"}</style>
      </section>
    </div>
  );
}
