import React from "react";
import { Icon } from "../core/Icon.jsx";

/* One read, drawn as one object. The thread names the rows from a header inside the card
   rather than from a chip above it: one link out per result, and the count has somewhere
   honest to sit. Ticking is the only write a row here can do. */

const TYPE_ICON={task:"circle-check",event:"calendar",location:"map-pin",link:"link",image:"image",file:"file",voice:"mic",note:"align-left"};

function Tick({done,label,onToggle}){
  const on=Boolean(done);
  return (
    <span role="checkbox" aria-checked={on} aria-label={label} tabIndex={0}
      onClick={(e)=>{e.stopPropagation();onToggle&&onToggle()}}
      onKeyDown={(e)=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();onToggle&&onToggle()}}}
      style={{width:"var(--tap-min,44px)",height:"var(--tap-min,44px)",flex:"0 0 auto",margin:"-11px 0 -11px -11px",
        display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"11px 0 0 11px",boxSizing:"border-box",
        cursor:onToggle?"pointer":"default"}}>
      <span style={{width:21,height:21,borderRadius:"var(--radius-xs)",display:"flex",alignItems:"center",justifyContent:"center",
        border:"1.5px solid "+(on?"var(--moss-600)":"var(--border-strong)"),background:on?"var(--moss-600)":"transparent",
        transition:"background var(--transition-ui),border-color var(--transition-ui)"}}>
        {on?<Icon name="check" size={13} style={{color:"var(--text-on-solid)"}}/>:null}
      </span>
    </span>
  );
}

export function AnswerResult({thread,count,rows=[],shown=5,truncated=false,threadTotal,onToggle,onOpenThread,style,...rest}){
  const [open,setOpen]=React.useState(false);
  const list=open?rows:rows.slice(0,shown);
  const rest_n=rows.length-list.length;
  const label=count===undefined||count===null?rows.length:count;
  return (
    <div {...rest} style={{background:"var(--surface-raised)",border:"1px solid var(--border-hairline)",
      borderRadius:"var(--radius-md)",overflow:"hidden",...style}}>
      {thread?(
        <button type="button" onClick={onOpenThread}
          style={{display:"flex",alignItems:"center",gap:"var(--space-4)",width:"100%",minHeight:"var(--tap-min,44px)",
            padding:"var(--space-4) var(--space-5)",boxSizing:"border-box",border:"none",textAlign:"left",
            cursor:onOpenThread?"pointer":"default",background:"var(--surface-accent-soft)",color:"var(--text-accent)",
            boxShadow:"inset 0 -1px 0 var(--border-hairline)"}}>
          <Icon name="lasso" size={15}/>
          <b style={{font:"var(--weight-medium) 13.5px/1.2 var(--font-core)"}}>{thread.name}</b>
          <span style={{marginLeft:"auto",font:"var(--text-numeric-role)",fontSize:12}}>{label}</span>
        </button>
      ):null}

      {list.map((r,i)=>{
        const tickable=Boolean(onToggle)&&(r.type===undefined||r.type==="task");
        const done=Boolean(r.done);
        return (
          <div key={r.id||i} style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)",
            padding:"var(--space-4) var(--space-5)",
            boxShadow:i===list.length-1?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
            {tickable
              ?<Tick done={done} onToggle={()=>onToggle(r)} label={r.title+(thread?", "+thread.name:"")}/>
              :<span style={{width:32,height:32,flex:"0 0 auto",borderRadius:"var(--radius-sm)",background:"var(--surface-fill)",
                color:"var(--text-secondary)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Icon name={TYPE_ICON[r.type]||"align-left"} size={16}/></span>}
            <span style={{flex:1,minWidth:0}}>
              {/* Never opacity. A finished row keeps its place, takes tertiary ink and a 1px
                  strike, and the tick has already said it. */}
              <b style={{display:"block",font:"var(--weight-medium) 15.5px/1.35 var(--font-core)",
                color:done?"var(--text-tertiary)":"var(--text-primary)",
                textDecoration:done?"line-through":"none",textDecorationThickness:"1px"}}>{r.title}</b>
              {r.meta?<span style={{display:"block",fontSize:12.5,lineHeight:1.4,color:"var(--text-secondary)",marginTop:2}}>{r.meta}</span>:null}
            </span>
          </div>
        );
      })}

      {/* Whichever tail is true, never both: there is more in hand, or there was more than
          the read could reach and the thread is where it lives. */}
      {truncated?(
        <button type="button" onClick={onOpenThread}
          style={{display:"flex",alignItems:"center",gap:"var(--space-4)",width:"100%",padding:"var(--space-4) var(--space-5)",
            boxSizing:"border-box",border:"none",textAlign:"left",cursor:"pointer",background:"var(--surface-accent-soft)",
            boxShadow:"inset 0 1px 0 var(--border-hairline)"}}>
          <Icon name="lasso" size={15} style={{color:"var(--text-accent)"}}/>
          <em style={{flex:1,fontStyle:"normal",fontSize:12.5,lineHeight:1.4,color:"var(--text-secondary)"}}>
            {threadTotal?threadTotal+" more in "+thread.name+". ":""}The rest of the answer is in the thread.</em>
          <Icon name="chevron-right" size={15} style={{color:"var(--text-accent)"}}/>
        </button>
      ):rest_n>0?(
        <button type="button" onClick={()=>setOpen(true)}
          style={{display:"flex",alignItems:"center",gap:"var(--space-3)",width:"100%",minHeight:"var(--tap-min,44px)",
            padding:"var(--space-4) var(--space-5)",boxSizing:"border-box",border:"none",cursor:"pointer",
            background:"var(--surface-fill)",color:"var(--text-primary)",
            font:"var(--weight-medium) 13.5px/1 var(--font-core)"}}>
          <Icon name="chevron-down" size={15}/>Show {rest_n} more
        </button>
      ):null}
    </div>
  );
}
