import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Chip } from "../core/Chip.jsx";

/* Everything offload has to say about a turn that is not a sentence: what happened to it,
   where it landed, and where any fact in it came from.

   It belongs to the turn rather than to either bubble, because an ordinary filing turn says
   nothing back and still has all three of those to report. So it is drawn on offload's side,
   left aligned, at the log's own gutter: not inside the sent bubble's 84% and not inside the
   reply's 92%, since it is not a bubble and nothing in it is a quotation. */

const REF_TONE={thread:"accent",time:"attention",money:"warning"};
const REF_ICON={thread:"lasso",time:"clock",money:null};

/* Order is fixed: state, then threads, then sources. What happened, where it landed, where
   it came from, so a turn can be read without being read. */
export function TurnFooter({state,refs=[],sources=[],maxSources=3,onOpenRef,onOpenSource,style,...rest}){
  const shown=sources.slice(0,maxSources);
  const hidden=sources.length-shown.length;
  /* An empty footer is no footer, never a 26px gap. */
  if(!state&&!refs.length&&!sources.length)return null;
  return (
    <div {...rest} style={{alignSelf:"stretch",display:"flex",flexFlow:"row wrap",alignItems:"center",
      gap:"var(--space-2)",minHeight:26,...style}}>
      {state==="seen"?(
        <span aria-label="seen, not answered yet"
          style={{display:"inline-flex",alignItems:"center",height:24,padding:"0 var(--space-3)",
            borderRadius:"var(--radius-pill)",background:"var(--surface-raised)",
            border:"1px solid var(--border-hairline)",fontSize:15,lineHeight:1}}>👀</span>
      ):null}
      {state==="done"?(
        <span style={{display:"inline-flex",alignItems:"center",gap:5,height:24,padding:"0 var(--space-3)",
          borderRadius:"var(--radius-pill)",background:"var(--moss-600)",color:"var(--text-on-solid)",
          font:"var(--weight-medium) 11px/1 var(--font-core)",whiteSpace:"nowrap"}}>
          <Icon name="check" size={11}/>Done</span>
      ):null}

      {refs.map((r,i)=>{const kind=r.kind||"thread";
        return <Chip key={r.id||i} tone={REF_TONE[kind]} icon={REF_ICON[kind]}
          onClick={kind==="thread"&&onOpenRef?()=>onOpenRef(r):undefined}>{r.name}</Chip>;})}

      {/* An anchor rather than a Chip, because this one leaves the app and a Chip has no
          href. The outline tone's own values, so it stays the same object.

          It is the only external link in the conversation, and the reason it is allowed is
          that its label is a domain from the record of what was read rather than a word the
          page chose: a registrable domain, no path, no title, no scheme. */}
      {shown.map((s,i)=>(
        <a key={s.url||i} href={s.url} target="_blank" rel="noreferrer noopener"
          onClick={onOpenSource?(e)=>{e.preventDefault();onOpenSource(s)}:undefined}
          style={{display:"inline-flex",alignItems:"center",gap:6,height:26,padding:"0 var(--space-4)",
            borderRadius:"var(--radius-pill)",background:"transparent",border:"1px solid var(--border-strong)",
            color:"var(--text-secondary)",font:"var(--weight-regular) 12.5px/1 var(--font-core)",
            textDecoration:"none",maxWidth:"22ch",overflow:"hidden"}}>
          <Icon name="link" size={12}/>
          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.domain}</span>
        </a>
      ))}
      {/* Text, not a chip and not a control: there is no list of what a turn read, and a
          chip would promise one. */}
      {hidden>0?(
        <span style={{font:"var(--weight-regular) 12.5px/1 var(--font-core)",color:"var(--text-tertiary)",
          padding:"0 var(--space-1, 4px)",whiteSpace:"nowrap"}}>and {hidden} more</span>
      ):null}
    </div>
  );
}
