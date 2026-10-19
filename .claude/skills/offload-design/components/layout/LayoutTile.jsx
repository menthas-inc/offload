import React from "react";

/* A thread layout, drawn small (19 October 2026). The picture each layout is picked by, in Edit
   thread, New thread, and the web's Edit thread popover. Six layouts, a closed set:
   default, todo, events, gallery, project, timeline. The marks are abstract on purpose: each
   says how the layout arranges a page (rows, boxes, solid and dashed, squares, columns, dots),
   never what is in this thread. */

const NAMES={default:"Default",todo:"Todo list",events:"Events",gallery:"Gallery",project:"Project",timeline:"Timeline"};
const SIZES={sm:{w:44,h:54,p:7,gap:3,bar:4,r:9},md:{w:64,h:78,p:9,gap:4,bar:5,r:11}};

function marks(layout,s){
  const bar=(k,st)=>React.createElement("i",{key:k,style:{display:"block",height:s.bar,borderRadius:2,background:"var(--ink-300)",...st}});
  const box=(k)=>bar(k,{height:s.bar+2,background:"none",boxShadow:"inset 0 0 0 1px var(--ink-400)",borderRadius:1});
  const dot=(k)=>bar(k,{width:s.bar+1,height:s.bar+1,borderRadius:9,background:"var(--ink-500)"});
  if(layout==="todo")return {cols:`${s.bar+2}px 1fr`,items:[0,1,2,3].flatMap(i=>[box("b"+i),bar("l"+i)])};
  if(layout==="events")return {cols:"1fr",items:[bar(0,{height:s.bar*2+2,background:"var(--ink-500)"}),bar(1,{height:s.bar*2+2,background:"var(--ink-500)"}),bar(2,{height:s.bar*2,background:"none",boxShadow:"inset 0 0 0 1px var(--ink-300)"}),bar(3,{height:s.bar*2,background:"none",boxShadow:"inset 0 0 0 1px var(--ink-300)"})]};
  if(layout==="gallery")return {cols:"1fr 1fr",items:[0,1,2,3].map(i=>bar(i,{height:s===SIZES.md?20:13,background:"var(--ink-400)"}))};
  if(layout==="project")return {cols:"1fr 1fr 1fr",gap:2,items:[0,1,2,3,4,5,6,7].map(i=>bar(i,i<3?{background:"var(--ink-500)"}:{}))};
  if(layout==="timeline")return {cols:`${s.bar+1}px 1fr`,items:[0,1,2].flatMap(i=>[dot("d"+i),bar("l"+i)])};
  return {cols:"1fr",items:[bar(0),bar(1,{height:s.bar*3,background:"var(--ink-400)"}),bar(2),bar(3)]};
}

export function LayoutTile({layout="default",size="md",selected=false,label,onPress,style,...rest}){
  const s=SIZES[size]||SIZES.md;
  const m=marks(layout,s);
  const name=label===undefined?NAMES[layout]:label;
  const tile=React.createElement("span",{"aria-hidden":"true",style:{width:s.w,height:s.h,boxSizing:"border-box",padding:s.p,borderRadius:s.r,
    display:"grid",gridTemplateColumns:m.cols,columnGap:3,rowGap:m.gap||s.gap,alignContent:"start",flex:"0 0 auto",
    background:selected?"var(--surface-raised)":"var(--surface-fill)",
    boxShadow:selected?"inset 0 0 0 2px var(--text-primary)":"inset 0 0 0 1px var(--border-hairline)"}},m.items);
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={NAMES[layout]} onClick={onPress} {...rest}
      style={{display:"inline-flex",flexDirection:"column",alignItems:"center",gap:6,padding:0,border:"none",background:"transparent",
        cursor:onPress?"pointer":"default",font:(selected?"var(--weight-semibold)":"var(--weight-medium)")+" 12px/1 var(--font-core)",
        color:selected?"var(--text-primary)":"var(--text-secondary)",...style}}>
      {tile}{name?<span>{name}</span>:null}
    </button>
  );
}

export const LAYOUT_NAMES=NAMES;
