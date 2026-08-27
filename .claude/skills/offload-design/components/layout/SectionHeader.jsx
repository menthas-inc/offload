import React from "react";

const SECTION_TONES={
  ink:{rule:"var(--ink-950)",bg:"var(--surface-fill)",fg:"var(--text-secondary)"},
  attention:{rule:"var(--surface-attention)",bg:"var(--surface-attention)",fg:"var(--text-on-solid)"},
  accent:{rule:"var(--moss-600)",bg:"var(--surface-accent-soft)",fg:"var(--text-accent)"}
};

export function SectionHeader({children,count,action,alignAction="left",sticky=false,tone="ink",style,...rest}){
  const t=SECTION_TONES[tone]||SECTION_TONES.ink;
  return (
    <div {...rest} style={{padding:"var(--space-9) var(--gutter-screen) var(--space-5)",
      background:sticky?"var(--surface-chrome-strong)":"transparent",
      backdropFilter:sticky?"var(--blur-chrome)":undefined,position:sticky?"sticky":undefined,top:sticky?0:undefined,zIndex:sticky?2:undefined,...style}}>
      <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",paddingBottom:"var(--space-4)",
        borderBottom:"1px solid "+t.rule}}>
        <span style={{font:"var(--weight-semibold) var(--size-title-2)/1.15 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-title)",
          color:"var(--text-primary)"}}>{children}</span>
        {count!==undefined&&count!==null&&count!==""?(
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:22,
            padding:"0 var(--space-3)",borderRadius:"var(--radius-pill)",background:t.bg,
            font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",fontVariantNumeric:"tabular-nums",
            color:t.fg}}>{count}</span>
        ):null}
        {action?<span style={{marginLeft:alignAction==="right"?"auto":undefined,font:"var(--text-label-role)",fontVariantNumeric:"tabular-nums",color:"var(--text-secondary)"}}>{action}</span>:null}
        <span style={{flex:1}}/>
      </div>
    </div>
  );
}
