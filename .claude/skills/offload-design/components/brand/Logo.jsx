import React from "react";

export function Logo({variant="lockup",size=24,tone="ink",style,...rest}){
  const c=tone==="inverse"?"var(--paper)":"var(--ink-950)";
  const sw=size<=20?11:size<=32?10:9;
  const mark=(
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" style={{display:"block",flex:"0 0 auto"}}>
      <circle cx="48" cy="21" r={sw} fill={c}/>
      <path d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
  if(variant==="mark") return <span role="img" aria-label="offload" {...rest} style={{display:"inline-flex",...style}}>{mark}</span>;
  return (
    <span role="img" aria-label="offload" {...rest}
      style={{display:"inline-flex",alignItems:"center",gap:Math.round(size*0.34),...style}}>
      {mark}
      <span style={{font:"var(--weight-semibold) "+Math.round(size*0.92)+"px/1 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"-0.03em",color:c}}>offload</span>
    </span>
  );
}
