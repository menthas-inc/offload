import React from "react";
import { Icon } from "../core/Icon.jsx";

export function MemoryRow({text,origin="told",author,muted=false,open=false,onOpen,onClose,onSave,onDelete,onMute,maxChars=200,arrived=false,reorder,dragging=false,over=false,style,...rest}){
  const [draft,setDraft]=React.useState(text);
  React.useEffect(()=>{if(open)setDraft(text)},[open,text]);
  const learned=origin==="learned"&&!muted;
  const save=()=>{const next=draft.trim();if(next&&onSave)onSave(next);if(onClose)onClose()};
  return (
    <div {...rest} style={{display:"flex",flexDirection:"column",
      background:dragging?"var(--surface-raised)":arrived?"var(--surface-accent-soft)":"transparent",
      borderRadius:dragging||arrived?"var(--radius-sm)":0,
      boxShadow:dragging?"var(--shadow-2)":over?(over==="top"?"inset 0 2px 0":"inset 0 -2px 0")+" var(--ink-950)":"none",
      transition:"background var(--duration-mark) var(--ease-out)",...style}}>
      <div role={open?undefined:"button"} tabIndex={open?undefined:0} onClick={open?undefined:onOpen}
        onKeyDown={open?undefined:(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();if(onOpen)onOpen()}}}
        style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)",padding:"var(--space-5) 0",
          cursor:open?"default":"pointer"}}>
        <Icon name={learned?"sparkles":"circle-dot"} size={14}
          style={{marginTop:3,flex:"0 0 auto",color:learned?"var(--text-accent)":"var(--ink-300)"}}/>
        <span style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:"var(--space-1)"}}>
          {/* Open, the editor stands in for the line rather than sitting under a copy
             of it: the row grows to hold the sentence you are editing, and printing
             it twice at 200 characters is the defect the chip version hid behind a
             40-character truncation. */}
          {open?null:<span style={{font:"var(--text-body-sm-role)",lineHeight:1.45,textWrap:"pretty",
            color:muted?"var(--text-tertiary)":"var(--text-primary)"}}>{text}</span>}
          {open?(
            /* 5px of room inside the clip: the first value that clears a 2px ring
               at 2px offset. The ring is never removed. */
            <span style={{display:"block",padding:"0 0 0 5px",margin:"0 0 0 -5px"}}>
              <span style={{display:"flex",flexDirection:"column",gap:"var(--space-4)",
                border:"1px solid var(--ink-950)",borderRadius:"var(--radius-md)",
                padding:"var(--space-5) var(--space-5) var(--space-4)",background:"var(--surface-raised)"}}>
                <textarea value={draft} rows={2} maxLength={maxChars} autoFocus
                  onChange={(e)=>setDraft(e.target.value)}
                  onKeyDown={(e)=>{
                    if(e.key==="Escape"&&onClose)onClose();
                    /* Enter saves, shift-Enter is a new line. A rule is one sentence. */
                    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();save()}
                  }}
                  placeholder="How should this thread be handled?"
                  style={{width:"100%",boxSizing:"border-box",border:"none",resize:"none",background:"transparent",
                    font:"var(--text-body-sm-role)",lineHeight:1.45,color:"var(--text-primary)",outline:"none"}}/>
                <span style={{display:"flex",alignItems:"center",gap:"var(--space-6)"}}>
                  <span style={{marginRight:"auto",font:"var(--text-numeric-role)",color:"var(--text-tertiary)"}}>{draft.length}/{maxChars}</span>
                  {/* One control, never two. Muted wins over both, whoever is asking. */}
                  {muted?<Act onClick={onMute}>Unmute</Act>
                    :onDelete?<Act tone="danger" onClick={onDelete}>Delete</Act>
                    :onMute?<Act onClick={onMute}>Mute</Act>:null}
                  <Act onClick={onClose}>Cancel</Act>
                  <button type="button" onClick={save} disabled={draft.trim().length===0}
                    style={{height:30,padding:"0 var(--space-6)",borderRadius:"var(--radius-pill)",border:"none",
                      cursor:draft.trim().length===0?"default":"pointer",
                      background:draft.trim().length===0?"var(--state-disabled-surface)":"var(--surface-inverse)",
                      color:draft.trim().length===0?"var(--state-disabled-text)":"var(--text-inverse)",
                      font:"var(--weight-medium) var(--size-label)/1 var(--font-core)"}}>Save</button>
                </span>
              </span>
            </span>
          ):null}
          {author||muted?<span style={{font:"var(--text-caption-role)",color:"var(--text-tertiary)"}}>
            {muted?"Muted":null}{muted&&author?" \u00b7 ":null}{author}
          </span>:null}
        </span>
        {/* A memory row has no pencil, since the whole row opens to edit, so the handle sits
            alone at the trailing edge. Hidden while the editor is open: you cannot reorder
            a row you are in the middle of rewriting. */}
        {reorder&&!open?<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:8,margin:-8,
          marginTop:0,flex:"0 0 auto",color:dragging?"var(--text-primary)":"var(--text-secondary)",cursor:"grab",touchAction:"none"}}>{reorder}</span>:null}
      </div>
    </div>
  );
}

function Act({children,tone,onClick}){
  return <button type="button" onClick={onClick} style={{border:"none",background:"transparent",padding:0,cursor:"pointer",
    font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",
    color:tone==="danger"?"var(--text-danger)":"var(--text-secondary)"}}>{children}</button>;
}
