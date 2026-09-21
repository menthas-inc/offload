import React from "react";
import { Icon } from "../core/Icon.jsx";

/* A voice note on a sent message: the control, the waveform, the length, and the
   transcript beneath once offload has written it down.

   **The bars are the note's own thirty two**, resampled over the whole recording on the
   device at stop and stored with it, so every surface and every reload draws the same bars
   and a bar is a fixed slice of time. The composer's live row keeps a sliding window of the
   last few seconds; that window is not what a sent note shows, and neither is a drawn sine.

   **The glyph is the control, so it says what pressing it does**: play at rest, pause while
   playing. A microphone there says record, which is the composer's job.

   **The remainder recedes only while playing.** A played bar is --text-attention and the
   rest of the bar row drops to --ink-300, which measures 3.53:1 against it; at rest every
   bar is --text-tertiary at 4.76:1, because then the whole waveform is the note. Dimming a
   resting row would cost the default state of every note three points of contrast to buy
   legibility in a state it is not in.

   **--text-attention rather than --text-primary**, which is louder in the absolute but
   measures 1.21:1 against a tertiary remainder: the boundary between played and not was
   the one thing you could not see. */

const BARS = 32;

export function SentVoice({durationMs=0,waveform,transcript,transcribed=false,playing=false,positionMs=0,
  failed=false,inert=false,onToggle,onShowAll,folded=false,style,...rest}){
  const bars=waveform&&waveform.length?waveform:new Array(BARS).fill(40);
  const played=playing&&durationMs>0?Math.min(1,positionMs/durationMs):0;
  const remaining=playing?Math.max(0,durationMs-positionMs):durationMs;
  const mmss=(ms)=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
  const words=transcribed?(transcript||""):null;
  return (
    <div {...rest} style={{marginTop:"var(--space-2)",minWidth:150,display:"flex",flexDirection:"column",gap:6,...style}}>
      {/* 44px minimum, which is the row rather than the glyph: the whole waveform is the
          target, as a voice note is in every messaging app. */}
      <div role="button" tabIndex={inert?undefined:0} aria-disabled={inert||undefined}
        aria-label={"Voice note, "+mmss(durationMs)+", "+(playing?"pause":"play")}
        aria-description={playing?"playing, "+mmss(remaining)+" left":undefined}
        onClick={inert?undefined:onToggle}
        onKeyDown={inert?undefined:(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onToggle&&onToggle()}}}
        style={{display:"flex",alignItems:"center",gap:"var(--space-3)",minHeight:"var(--tap-min)",
          cursor:inert?"default":"pointer"}}>
        <Icon name={playing?"pause":"play"} size={14} style={{color:"var(--text-secondary)",flex:"0 0 auto"}}/>
        <span style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:2,height:20,overflow:"hidden"}}>
          {bars.map((value,at)=>(
            <span key={at} style={{width:3,flex:"0 0 auto",borderRadius:2,
              height:Math.max(3,Math.round((value/255)*20)),
              background:at/bars.length<played?"var(--text-attention)"
                :playing?"var(--ink-300)":"var(--text-tertiary)"}}/>
          ))}
        </span>
        <span style={{flex:"0 0 auto",font:"var(--text-numeric-role)",fontVariantNumeric:"tabular-nums",
          fontSize:"var(--size-caption)",color:"var(--text-secondary)"}}>{mmss(remaining)}</span>
      </div>
      {/* The playback failure. No control beside it: the row above is the retry, and a
          Try again here would be a second control for the same tap. */}
      {failed?(
        <div role="alert" style={{font:"var(--weight-regular) 13px/18px var(--font-core)",color:"var(--text-danger)"}}>
          Not here yet.
        </div>
      ):null}
      {/* What offload heard, in the person's own bubble and their own face: the review a
          spoken dump gets in place of the one a typed dump gets while being typed. */}
      {words?(
        <div style={{font:"var(--weight-regular) 15px/22px var(--font-core)",color:"var(--text-secondary)"}}>
          {words}
          {folded?(
            <span role="button" tabIndex={0} onClick={onShowAll}
              style={{marginLeft:6,fontWeight:"var(--weight-medium)",color:"var(--text-accent)",cursor:"pointer"}}>Show all</span>
          ):null}
        </div>
      ):null}
    </div>
  );
}
