import React from "react";

export function Badge({children,tone="neutral",variant="soft",style,...rest}){
  const map={
    neutral:{soft:["var(--surface-fill)","var(--text-secondary)","var(--edge-card)"],solid:["var(--surface-inverse)","var(--text-inverse)"]},
    accent:{soft:["var(--surface-accent-soft)","var(--text-accent)","var(--edge-accent)"],solid:["var(--moss-600)","var(--text-on-solid)"]},
    attention:{soft:["var(--surface-attention-soft)","var(--text-on-attention)","var(--edge-attention)"],solid:["var(--surface-attention)","var(--text-on-solid)"]},
    warning:{soft:["var(--amber-100)","var(--amber-700)","var(--edge-noticed)"],solid:["var(--amber-600)","var(--amber-on)"]},
    danger:{soft:["var(--clay-100)","var(--clay-700)","var(--edge-danger)"],solid:["var(--clay-600)","var(--text-on-solid)"]}
  };
  /* A soft badge draws its edge (7 October): transparent in light, its own hue in dark. */
  const [bg,fg,edge]=(map[tone]||map.neutral)[variant]||map.neutral.soft;
  return <span {...rest} style={{display:"inline-flex",alignItems:"center",height:20,padding:"0 var(--space-3)",borderRadius:"var(--radius-xs)",background:bg,color:fg,boxShadow:edge?"inset 0 0 0 1px "+edge:"none",font:"var(--weight-medium) var(--size-caption)/1 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"0.01em",...style}}>{children}</span>;
}
