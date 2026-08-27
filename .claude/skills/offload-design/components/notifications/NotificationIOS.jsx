import React from "react";
import { Logo } from "../brand/Logo.jsx";

/* An iOS notification banner. The surface is system material, not an offload surface, so
   the colours here are the system's own and do not follow the theme: a notification is
   drawn by iOS on top of whatever is behind it.
   A collapsed banner cannot carry a button, so `actions` render the expanded state: full
   width rows under the content, 44pt minimum, split by hairlines. Four is the platform
   maximum and two is as many as offload should ever ask for. */
export function NotificationIOS({app="offload",time="now",title,body,actions,width=390,style,...rest}){
  return (
    <div {...rest} style={{width,borderRadius:22,overflow:"hidden",background:"rgba(255,255,255,0.82)",
      backdropFilter:"blur(20px) saturate(140%)",WebkitBackdropFilter:"blur(20px) saturate(140%)",
      boxShadow:"0 10px 24px -10px rgba(0,0,0,0.35)",color:"#0B0B0B",boxSizing:"border-box",...style}}>
      <div style={{display:"flex",gap:11,padding:"13px 15px 14px"}}>
        <span style={{width:38,height:38,flex:"0 0 auto",borderRadius:9,background:"#0B0B0B",display:"flex",
          alignItems:"center",justifyContent:"center"}}><Logo variant="mark" size={22} tone="inverse"/></span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{flex:1,minWidth:0,font:"var(--weight-medium) 12px/1.2 var(--font-core)",
              letterSpacing:"0.04em",textTransform:"uppercase",color:"rgba(11,11,11,0.55)",
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{app}</span>
            <span style={{font:"var(--weight-regular) 12px/1.2 var(--font-core)",color:"rgba(11,11,11,0.5)",
              fontVariantNumeric:"tabular-nums",flex:"0 0 auto"}}>{time}</span>
          </div>
          <div style={{font:"var(--weight-semibold) 15px/1.3 var(--font-core)",marginTop:2,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
          {body?<div style={{font:"var(--weight-regular) 15px/1.35 var(--font-core)",marginTop:1,
            display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{body}</div>:null}
        </div>
      </div>
      {actions&&actions.length?(
        <div style={{borderTop:"0.5px solid rgba(11,11,11,0.14)"}}>
          {actions.map((a,i)=>(
            <div key={a.label} role="button" tabIndex={0} onClick={a.onPress}
              style={{minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",
                borderTop:i?"0.5px solid rgba(11,11,11,0.14)":"none",cursor:"pointer",
                font:"var(--weight-regular) 15px/1 var(--font-core)",
                color:a.destructive?"#C0392B":"#0B0B0B"}}>{a.label}</div>
          ))}
        </div>
      ):null}
    </div>
  );
}
