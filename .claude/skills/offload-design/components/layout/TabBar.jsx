import React from "react";
import { Icon } from "../core/Icon.jsx";

export function TabBar({items=[],value,onChange,style,...rest}){
  return (
    <nav {...rest} style={{display:"flex",alignItems:"stretch",height:"var(--tabbar-height)",background:"var(--surface-chrome-strong)",
      backdropFilter:"var(--blur-chrome)",WebkitBackdropFilter:"var(--blur-chrome)",borderTop:"1px solid var(--border-hairline)",...style}}>
      {items.map((it)=>{
        const on=it.value===value;
        return <button key={it.value} type="button" onClick={()=>onChange&&onChange(it.value)}
          style={{flex:1,border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",gap:4,color:on?"var(--text-primary)":"var(--text-tertiary)",transition:"color var(--transition-ui)"}}>
          <Icon name={it.icon} size={22}/>
          <span style={{font:"var(--weight-medium) 10px/1 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"0.01em"}}>{it.label}</span>
        </button>;
      })}
    </nav>
  );
}
