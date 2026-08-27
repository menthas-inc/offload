const { Icon, Button, Toast, Logo, NotificationIOS } = OFFLOAD_DS;

/* Everything before the shell: the gate, the refusal line, the no-invite screen and the
   three tutorial screens. Web gets the same copy and the same order as the phones, laid
   out as one centred card instead of a full-bleed screen, and it never shows the tutorial
   to someone who already ran it on a phone. */
const W_APPLE=({size=17})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{display:"block"}}>
    <path d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.02-.9.9-2.02 1.42-3.02 1.33-.06-1.08.44-2.2 1.26-3.03.86-.87 2.1-1.4 3.01-1.32zM20.9 8.6c-1.7-.1-3.1.96-3.9.96-.83 0-2.05-.92-3.38-.9-1.74.03-3.35 1.01-4.24 2.57-1.82 3.15-.47 7.82 1.3 10.38.86 1.25 1.9 2.65 3.25 2.6 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.38.82 1.4-.03 2.29-1.27 3.15-2.53.98-1.45 1.38-2.85 1.4-2.92-.03-.01-2.7-1.04-2.72-4.12-.03-2.58 2.1-3.82 2.2-3.88-1.2-1.77-3.07-1.97-3.71-2.01z"/></svg>
);
const W_GOOGLE=({size=17})=>(
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{display:"block"}}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
);
function WProvider({kind,onClick}){
  const dark=kind==="apple";
  return (
    <button type="button" onClick={onClick} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,
      width:"100%",height:48,borderRadius:"var(--radius-pill)",cursor:"pointer",
      background:dark?"var(--ink-950)":"var(--surface-raised)",color:dark?"var(--text-inverse)":"var(--text-primary)",
      border:dark?"1px solid transparent":"1px solid var(--border-strong)",
      font:"var(--weight-medium) 15.5px/1 var(--font-core)",letterSpacing:"var(--tracking-body)"}}>
      {dark?<W_APPLE/>:<W_GOOGLE/>}{dark?"Continue with Apple":"Continue with Google"}
    </button>
  );
}
function WWordmark(){
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:9}}>
      <Logo variant="mark" size={22}/>
      <span style={{font:"var(--weight-semibold) 20px/1 var(--font-core)",letterSpacing:"-0.03em"}}>offload</span>
    </span>
  );
}
function WGateCard({children}){
  return (
    <div style={{width:440,boxSizing:"border-box",padding:"44px",borderRadius:"var(--radius-2xl)",
      background:"var(--surface-raised)",boxShadow:"var(--shadow-sheet)",display:"flex",flexDirection:"column"}}>
      {children}
    </div>
  );
}
function WRefusalLine({children}){
  return (
    <div style={{padding:"12px 14px",borderRadius:"var(--radius-md)",background:"var(--surface-attention-soft)",
      color:"var(--text-on-attention)",font:"var(--weight-regular) 14px/1.4 var(--font-core)"}}>{children}</div>
  );
}
function WTerms({children,align="center"}){
  return <div style={{font:"var(--text-caption-role)",color:"var(--text-tertiary)",textAlign:align,lineHeight:1.45}}>{children}</div>;
}

const W_TUTORIAL=[
  {title:"Dump anything",sub:"Half a thought, a photo, a voice note. No folders, no tidying.",art:"bubbles"},
  {title:"offload sorts it",sub:"Related bits end up together, with the dates and the money attached.",art:"things"},
  {title:"It only interrupts when it matters",sub:"Deadlines and answers you are waiting on. Nothing else.",art:"notification"}
];
const W_DUMPS=["Ana can only travel the 14th to the 17th","€214 for the flights","matte black, 30cm","dentist after the 20th"];
const W_THINGS=[["lasso","Lisbon trip","4 things"],["bookmark","Bookshelf build","2 things"],["cloudy","Read later","23 things"]];
function WTutorialArt({kind}){
  if(kind==="bubbles")return (
    <div style={{width:520,display:"flex",flexDirection:"column",gap:12}}>
      {W_DUMPS.map((t,i)=>(
        <span key={t} style={{alignSelf:i%2?"flex-end":"flex-start",padding:"11px 15px",borderRadius:18,
          background:"var(--surface-fill)",color:"var(--text-secondary)",
          font:"var(--weight-regular) 15px/1.35 var(--font-core)"}}>{t}</span>
      ))}
    </div>
  );
  if(kind==="things")return (
    <div style={{width:520,display:"flex",flexDirection:"column",gap:10}}>
      {W_THINGS.map(([icon,name,meta])=>(
        <span key={name} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 15px",
          borderRadius:"var(--radius-lg)",border:"1px solid var(--border-hairline)",background:"var(--surface-raised)"}}>
          <span style={{width:32,height:32,borderRadius:"var(--radius-sm)",background:"var(--surface-fill)",
            display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}><Icon name={icon} size={17}/></span>
          <span style={{flex:1,font:"var(--weight-medium) 15px/1 var(--font-core)"}}>{name}</span>
          <span style={{font:"var(--text-body-sm-role)",color:"var(--text-tertiary)"}}>{meta}</span>
        </span>
      ))}
    </div>
  );
  return <NotificationIOS app="offload" time="now" title="Brackets go up Friday" body="You saved the link on Tuesday." width={420}/>;
}

function WGate({phase,refused,joined,step=1,onApple,onGoogle,onJoin,onSwitch,onNext,onSkip}){
  if(phase==="tutorial"){
    const s=W_TUTORIAL[step-1];
    const last=step===W_TUTORIAL.length;
    return (
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",background:"var(--surface-sunken)",
        padding:"28px 44px 40px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <WWordmark/>
          <button type="button" onClick={onSkip} style={{border:"none",background:"none",cursor:"pointer",
            font:"var(--weight-medium) 14px/1 var(--font-core)",color:"var(--text-secondary)"}}>Skip</button>
        </div>
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",gap:34}}>
          <WTutorialArt kind={s.art}/>
          <div style={{width:520,textAlign:"center"}}>
            <div style={{font:"var(--weight-semibold) 34px/1.1 var(--font-core)",letterSpacing:"var(--tracking-display)"}}>{s.title}</div>
            <div style={{font:"var(--text-body-role)",fontSize:17,color:"var(--text-secondary)",marginTop:12,lineHeight:1.5}}>{s.sub}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
            <Button variant="primary" size="lg" onClick={onNext} style={{width:240,justifyContent:"center"}}>
              {last?"Get started":"Next"}</Button>
            <span style={{display:"flex",gap:6,alignItems:"center"}}>
              {W_TUTORIAL.map((_,i)=>(
                <span key={i} style={{height:6,width:i+1===step?18:6,borderRadius:"var(--radius-pill)",
                  background:i+1===step?"var(--ink-950)":"var(--ink-200)",transition:"width 200ms var(--ease-out)"}}/>
              ))}
            </span>
          </div>
        </div>
      </div>
    );
  }
  const invited=phase!=="notinvited";
  return (
    <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",background:"var(--surface-sunken)",
      padding:"36px 44px"}}>
      <WWordmark/>
      <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {invited?(
          <WGateCard>
            <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)"}}>Sign in to offload</div>
            <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:10,lineHeight:1.5}}>
              Use the account your invite was sent to.</div>
            {refused?<div style={{marginTop:22}}><WRefusalLine>That did not go through. Nothing was sent, try again.</WRefusalLine></div>:null}
            <div style={{display:"flex",flexDirection:"column",gap:10,margin:(refused?16:28)+"px 0 18px"}}>
              <WProvider kind="apple" onClick={onApple}/>
              <WProvider kind="google" onClick={onGoogle}/>
            </div>
            <WTerms>offload is invite only. <b style={{color:"var(--text-accent)",fontWeight:500}}>Join the waitlist</b></WTerms>
          </WGateCard>
        ):(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:22}}>
            <WGateCard>
              {joined?(<>
                <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)"}}>You are on the list</div>
                <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:10,lineHeight:1.5}}>
                  We will email jo@hey.com when your account is ready to use.</div>
              </>):(<>
                <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)"}}>You are not on the list yet</div>
                <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:10,lineHeight:1.5}}>
                  offload is invite only right now. We checked <b style={{color:"var(--text-primary)",fontWeight:500}}>jo@hey.com</b> and found no invite.</div>
                <div style={{display:"flex",flexDirection:"column",gap:10,margin:"26px 0 16px"}}>
                  <Button variant="primary" size="lg" block onClick={onJoin}>Join the waitlist with this email</Button>
                  <Button variant="secondary" size="lg" block onClick={onSwitch}>Use a different account</Button>
                </div>
                <WTerms>Invited on another address? Sign in with that one instead.</WTerms>
              </>)}
            </WGateCard>
            {joined?<Toast message="Added to the waitlist"/>:null}
          </div>
        )}
      </div>
      <WTerms align="left">Terms · Privacy</WTerms>
    </div>
  );
}

Object.assign(window,{WGate,W_TUTORIAL_STEPS:W_TUTORIAL.length});
