import React from "react";
import { Icon } from "../core/Icon.jsx";

/* The answers to a question offload asked, as taps. 012's calendar proposal is the same
   control with two fixed options, so this generalises it rather than replacing it.

   Five at most, all of them typeable, and none of them destroys anything. A choice among
   values has no primary: dark ink would say offload was recommending one, and a question
   is what offload asks when it does not know. */

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);
  return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

function Reply({option,onPick,hint}){
  const {h,p,bind}=usePress();
  const kind=option.kind||"value";
  const plain=kind==="plain";
  const paint={
    /* A value is Chip's geometry with a raised paint: --surface-card and --border-strong.
       The fill is 1.06:1 against the reply bubble in light and exactly 1.00:1 in dark,
       where the bubble and the card are the same token, so --border-strong is what draws
       this chip in both themes and the fill only matters where the bubble does not reach. */
    value:{bg:h?"var(--surface-fill)":"var(--surface-card)",fg:"var(--text-primary)",bd:"var(--border-strong)"},
    /* Kept for 012's proposal, which has one recommendation and one way out. A question
       among values never uses it. */
    primary:{bg:h?"var(--ink-800)":"var(--surface-inverse)",fg:"var(--text-inverse)",bd:"transparent"},
    thread:{bg:h?"var(--moss-100)":"var(--surface-accent-soft)",fg:"var(--text-accent)",bd:"var(--border-accent)"},
    plain:{bg:h?"var(--state-hover)":"transparent",fg:"var(--text-secondary)",bd:"transparent"}
  }[kind]||{};
  /* Drawn 30 tall inside a 44 target, the hit area cancelled by a negative margin so two
     wrapped lines of chips sit 30 apart in ink and meet at 44 in target. */
  return (
    <span role="button" tabIndex={0} aria-label={hint?option.label+", "+hint:undefined}
      onClick={()=>onPick&&onPick(option)}
      onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onPick&&onPick(option)}}}
      {...bind}
      style={{display:"inline-flex",alignItems:"center",height:"var(--tap-min,44px)",margin:"-7px 0",cursor:"pointer"}}>
      <span style={{display:"inline-flex",alignItems:"center",gap:"var(--space-3)",height:30,boxSizing:"border-box",
        padding:plain?"0 var(--space-3)":"0 var(--space-5)",borderRadius:"var(--radius-pill)",
        background:paint.bg,color:paint.fg,border:"1px solid "+paint.bd,
        font:(plain?"var(--weight-regular)":"var(--weight-medium)")+" var(--size-label)/1 var(--font-core)",
        letterSpacing:"var(--tracking-body)",whiteSpace:"nowrap",
        transition:"background var(--transition-ui)",transform:p?"scale(var(--press-scale))":"none"}}>
        {/* The way out carries an x, because it cancels the question rather than answering
            it, and without a mark a borderless chip beside bordered ones reads as a value
            whose border failed to draw. */}
        {plain?<Icon name="x" size={13}/>:option.icon?<Icon name={option.icon} size={14}/>:null}
        {option.label}
      </span>
    </span>
  );
}

export function QuickReplies({options=[],onPick,label,note,style,...rest}){
  if(!options.length)return null;
  const shown=options.slice(0,5);
  /* The way out is not one of the values, so it never shares their line: the values wrap
     among themselves and the plain options break to a row of their own. Which line it
     landed on was otherwise a property of the labels rather than a decision. */
  const values=shown.filter(o=>(o.kind||"value")!=="plain");
  const ways=shown.filter(o=>o.kind==="plain");
  return (
    <div {...rest} style={{marginTop:"var(--space-4)",...style}}>
      {/* One group named by the sentence that asked, so the options are heard as answers to
          it. iOS does not read a container's name, so the clients repeat `label` as each
          chip's hint; that is what the third argument to Reply is for. */}
      <div role="group" aria-label={label} style={{display:"flex",flexFlow:"row wrap",gap:"var(--space-4)"}}>
        {values.map((o,i)=><Reply key={o.id||o.label||i} option={o} onPick={onPick} hint={label}/>)}
        {ways.length?<span style={{flexBasis:"100%",height:0}}/>:null}
        {ways.map((o,i)=><Reply key={o.id||o.label||"way"+i} option={o} onPick={onPick} hint={label}/>)}
      </div>
      {note?<div style={{marginTop:"var(--space-3)",fontSize:13,lineHeight:1.4,color:"var(--text-tertiary)"}}>{note}</div>:null}
    </div>
  );
}
