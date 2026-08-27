import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Logo } from "../brand/Logo.jsx";

/* An Android notification, drawn as Material 3 draws it in the shade. The surface colours
   are the Android kit's own roles (--a-c, --a-on, --a-on-var, --a-on-quiet) written out,
   because a notification is painted by the system and never picks up the app's theme.
   Actions are text buttons inside the card, always visible; three is the platform maximum. */
export function NotificationAndroid({app="offload",time="now",title,body,actions,expandable=true,width=360,style,...rest}){
  return (
    <div {...rest} style={{width,boxSizing:"border-box",borderRadius:26,padding:"14px 16px 12px",
      background:"#ECEBE7",color:"#1B1B1A",
      boxShadow:"0 1px 2px rgba(0,0,0,0.28),0 4px 10px 2px rgba(0,0,0,0.14)",...style}}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <span style={{width:18,height:18,flex:"0 0 auto",borderRadius:99,background:"#3F6B4F",display:"flex",
          alignItems:"center",justifyContent:"center"}}><Logo variant="mark" size={12} tone="inverse"/></span>
        <span style={{font:"var(--weight-medium) 12.5px/1 var(--font-core)",color:"#5A5A57"}}>{app}</span>
        <span style={{width:3,height:3,borderRadius:99,background:"#8A8A86",flex:"0 0 auto"}}/>
        <span style={{font:"var(--weight-regular) 12.5px/1 var(--font-core)",color:"#5A5A57",
          fontVariantNumeric:"tabular-nums"}}>{time}</span>
        {expandable?<span style={{marginLeft:"auto",color:"#5A5A57",display:"flex"}}>
          <Icon name="chevron-down" size={16}/></span>:null}
      </div>
      <div style={{font:"var(--weight-medium) 15px/1.35 var(--font-core)",marginTop:7,
        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div>
      {body?<div style={{font:"var(--weight-regular) 14px/1.4 var(--font-core)",color:"#3A3A38",marginTop:2,
        display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{body}</div>:null}
      {actions&&actions.length?(
        <div style={{display:"flex",gap:4,marginTop:8,marginLeft:-10}}>
          {actions.map(a=>(
            <span key={a.label} role="button" tabIndex={0} onClick={a.onPress}
              style={{height:36,display:"inline-flex",alignItems:"center",padding:"0 10px",borderRadius:18,
                cursor:"pointer",font:"var(--weight-medium) 13.5px/1 var(--font-core)",whiteSpace:"nowrap",
                color:a.destructive?"#C0392B":"#2440A8"}}>{a.label}</span>
          ))}
        </div>
      ):null}
    </div>
  );
}
