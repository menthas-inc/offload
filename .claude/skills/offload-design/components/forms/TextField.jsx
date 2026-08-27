import React from "react";
import { Icon } from "../core/Icon.jsx";

export function TextField({value,onChange,placeholder,label,hint,icon,multiline=false,rows=3,tone="default",disabled=false,style,...rest}){
  const [focus,setFocus]=React.useState(false);
  const border=tone==="danger"?"var(--clay-600)":focus?"var(--border-focus)":"var(--border-strong)";
  const Field=multiline?"textarea":"input";
  return (
    <label style={{display:"flex",flexDirection:"column",gap:"var(--space-3)",...style}}>
      {label?<span style={{font:"var(--text-label-role)",fontVariantNumeric:"tabular-nums",color:"var(--text-secondary)"}}>{label}</span>:null}
      <span style={{display:"flex",alignItems:multiline?"flex-start":"center",gap:"var(--space-4)",padding:multiline?"var(--space-5)":"0 var(--space-5)",height:multiline?undefined:44,
        background:disabled?"var(--state-disabled-surface)":"var(--surface-raised)",border:"1px solid "+border,borderRadius:"var(--radius-field)",
        boxShadow:focus?"var(--shadow-focus)":"none",transition:"border-color var(--transition-ui),box-shadow var(--transition-ui)"}}>
        {icon?<span style={{color:"var(--text-tertiary)",display:"flex",paddingTop:multiline?2:0}}><Icon name={icon} size={18}/></span>:null}
        <Field {...rest} rows={multiline?rows:undefined} value={value} disabled={disabled} placeholder={placeholder}
          onChange={(e)=>onChange&&onChange(e.target.value)} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
          style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",resize:multiline?"vertical":undefined,
            font:"var(--text-body-role)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-body)",color:"var(--text-primary)",padding:0}}/>
      </span>
      {hint?<span style={{font:"var(--text-caption-role)",fontVariantNumeric:"tabular-nums",color:tone==="danger"?"var(--text-danger)":"var(--text-tertiary)"}}>{hint}</span>:null}
    </label>
  );
}
