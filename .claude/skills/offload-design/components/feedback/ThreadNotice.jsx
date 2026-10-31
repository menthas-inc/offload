import React from "react";
import { Icon } from "../core/Icon.jsx";

/* The thread notice (31 October 2026). One full-width strip under a thread's bar, for anything the
   thread needs to say: offload's layout suggestion, a member's layout switch, and later uses.
   Solid moss with white text from offload, ink from a person, the same in both themes. Two lines at
   most, one underlined word to act on, an x to dismiss. */

export function ThreadNotice({message,action,onAction,onDismiss,from="offload",icon="sparkles",initials,hue="var(--label-7)",style,...rest}){
  const person=from==="person";
  return (
    <div role="status" {...rest} style={{display:"flex",alignItems:"center",gap:12,boxSizing:"border-box",padding:"14px 20px",
      background:person?"var(--surface-inverse)":"var(--surface-accent)",color:person?"var(--text-inverse)":"var(--text-on-solid)",...style}}>
      {person
        ?<span aria-hidden="true" style={{width:24,height:24,borderRadius:99,flex:"0 0 auto",display:"inline-flex",alignItems:"center",justifyContent:"center",
          background:hue,color:"var(--text-on-solid)",font:"var(--weight-semibold) 10px/1 var(--font-core)"}}>{initials}</span>
        :<span style={{display:"flex",flex:"0 0 auto"}}><Icon name={icon} size={20}/></span>}
      <span style={{flex:1,minWidth:0,font:"var(--weight-medium) 16px/1.35 var(--font-core)",textWrap:"pretty",
        display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{message}</span>
      {action?<button type="button" onClick={onAction} style={{flex:"0 0 auto",minHeight:44,margin:"-12px 0",padding:0,border:"none",background:"transparent",
        cursor:"pointer",color:"inherit",font:"var(--weight-semibold) 16px/1 var(--font-core)",textDecoration:"underline",textUnderlineOffset:3,whiteSpace:"nowrap"}}>{action}</button>:null}
      {onDismiss?<button type="button" aria-label="Dismiss" onClick={onDismiss} style={{flex:"0 0 auto",width:44,height:44,margin:"-12px -14px -12px -4px",
        display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",color:"inherit",opacity:.8}}>
        <Icon name="x" size={18}/></button>:null}
    </div>
  );
}
