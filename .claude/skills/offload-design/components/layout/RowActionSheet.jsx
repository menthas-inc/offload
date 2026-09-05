import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Sheet } from "./Sheet.jsx";

export function RowActionSheet({open=true,actions=[],subject,onClose,style,...rest}){
  /* Sheet pays the screen gutter; the action rows pay it themselves so a press
     lands anywhere across the sheet rather than only on the label. */
  return (
    <Sheet open={open} onClose={onClose} style={{paddingLeft:0,paddingRight:0,paddingBottom:"var(--space-8)",...style}} {...rest}>
      {subject?<p style={{margin:"0 0 var(--space-3)",padding:"0 var(--gutter-screen)",
        font:"var(--text-body-sm-role)",color:"var(--text-tertiary)",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subject}</p>:null}
      <div role="group" style={{display:"flex",flexDirection:"column"}}>
        {actions.map((action)=>(
          <button key={action.label} type="button"
            onClick={()=>{if(onClose)onClose();if(action.onSelect)action.onSelect()}}
            style={{display:"flex",alignItems:"center",gap:"var(--space-5)",minHeight:"var(--tap-min)",
              padding:"0 var(--gutter-screen)",border:"none",background:"transparent",cursor:"pointer",
              textAlign:"left",color:action.danger?"var(--text-danger)":"var(--text-primary)",
              font:"var(--text-body-role)",letterSpacing:"var(--tracking-body)"}}>
            {action.icon?<Icon name={action.icon} size={18} style={{color:action.danger?"var(--text-danger)":"var(--text-tertiary)"}}/>:null}
            {action.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
