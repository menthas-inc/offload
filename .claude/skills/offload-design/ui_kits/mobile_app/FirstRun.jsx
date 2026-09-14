const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Logo, Button, Icon, Toast, NotificationIOS, AppBar, IconButton, PrismField } = OFFLOAD_DS;

/* Getting in. Two providers, no email field and no password: Apple leads because the
   App Store rule says it has to be at least as prominent as Google's here. The refusal
   is one line above the buttons, never a dialog, and it clears on the next attempt. */
const AppleGlyph=({size=18})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{display:"block"}}>
    <path d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.02-.9.9-2.02 1.42-3.02 1.33-.06-1.08.44-2.2 1.26-3.03.86-.87 2.1-1.4 3.01-1.32zM20.9 8.6c-1.7-.1-3.1.96-3.9.96-.83 0-2.05-.92-3.38-.9-1.74.03-3.35 1.01-4.24 2.57-1.82 3.15-.47 7.82 1.3 10.38.86 1.25 1.9 2.65 3.25 2.6 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.38.82 1.4-.03 2.29-1.27 3.15-2.53.98-1.45 1.38-2.85 1.4-2.92-.03-.01-2.7-1.04-2.72-4.12-.03-2.58 2.1-3.82 2.2-3.88-1.2-1.77-3.07-1.97-3.71-2.01z"/></svg>
);
const GoogleGlyph=({size=18})=>(
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{display:"block"}}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
);
function ProviderButton({kind,onClick}){
  const dark=kind==="apple";
  return (
    <button type="button" onClick={onClick} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,
      width:"100%",height:52,borderRadius:"var(--radius-pill)",cursor:"pointer",
      background:dark?"var(--ink-950)":"var(--surface-raised)",color:dark?"var(--text-inverse)":"var(--text-primary)",
      border:dark?"1px solid transparent":"1px solid var(--border-strong)",
      font:"var(--weight-medium) var(--size-body)/1 var(--font-core)",letterSpacing:"var(--tracking-body)"}}>
      {dark?<AppleGlyph/>:<GoogleGlyph/>}
      {dark?"Continue with Apple":"Continue with Google"}
    </button>
  );
}
/* Vertical lockup, only used before you are in. The mark sits in the upper half and the
   wordmark hangs under it, so the first thing the app shows is the brand and nothing else. */
function BigLockup(){
  return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",zIndex:1}}>
      <span style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
        <Logo variant="mark" size={92}/>
        <span style={{font:"var(--weight-semibold) 30px/1 var(--font-core)",letterSpacing:"-0.03em"}}>offload</span>
      </span>
    </div>
  );
}
function RefusalLine({children}){
  return (
    <div style={{display:"flex",gap:9,alignItems:"flex-start",padding:"12px 14px",borderRadius:"var(--radius-md)",
      background:"var(--surface-attention-soft)",color:"var(--text-on-attention)",
      font:"var(--weight-regular) var(--size-body-sm)/1.4 var(--font-core)"}}>{children}</div>
  );
}
function GateFoot({children}){
  return <div style={{flex:"0 0 auto",padding:"0 var(--gutter-screen) 22px",display:"flex",flexDirection:"column",gap:10,position:"relative",zIndex:1}}>{children}</div>;
}
function GateBody({title,sub}){
  return (
    <div style={{textAlign:"center",padding:"0 var(--gutter-screen) 44px",position:"relative",zIndex:1}}>
      <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)"}}>{title}</div>
      {sub?<div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:12,lineHeight:"var(--leading-body)"}}>{sub}</div>:null}
    </div>
  );
}
function Terms({children}){
  return <div style={{font:"var(--text-caption-role)",color:"var(--text-tertiary)",textAlign:"center",lineHeight:1.45}}>{children}</div>;
}

/* The gate's atmosphere belongs to first run, not to any one of its screens:
   sign-in, the refusal, the tutorial and connect are one surface with changing
   content, so the field is mounted once around all four and warps once on
   arrival rather than restarting at every step. */
function GateShell({children}){
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",position:"relative"}}>
      {PrismField?<PrismField variant="bloom" veil="none" arriveOnMount basePath="../../assets/prism"
        style={{inset:"auto",left:"-34%",top:"-20%",width:"120%",height:"58%",zIndex:0}}/>:null}
      <div style={{position:"relative",zIndex:1,flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>{children}</div>
    </div>
  );
}
function SignInScreen({error,onApple,onGoogle}){
  return (
    /* No veil on the gate's field: nothing in --text-tertiary crosses it, and
       the mark and wordmark over it are ink. */
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
      <BigLockup/>
      <GateBody title="One place for everything you would otherwise forget."
        sub="Sign in to start. Invite only for now."/>
      <GateFoot>
        {error?<RefusalLine>{error}</RefusalLine>:null}
        <ProviderButton kind="apple" onClick={onApple}/>
        <ProviderButton kind="google" onClick={onGoogle}/>
        <Terms>No invite yet? <b style={{color:"var(--text-accent)",fontWeight:500}}>Join the waitlist</b><br/>Terms · Privacy</Terms>
      </GateFoot>
    </div>
  );
}

/* Signed in with a real account that has no invite. The address is named, because the
   usual cause is the wrong one of two accounts, and joining reuses it so there is no
   field to fill. */
function NotInvitedScreen({email="jo@hey.com",joined,onJoin,onSwitch}){
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
      <BigLockup/>
      {joined
        ?<GateBody title="You're on the list" sub={"We'll email "+email+" when your account is ready to use."}/>
        :<GateBody title="You're not on the list yet" sub={"We checked "+email+" and found no invite."}/>}
      <GateFoot>
        {joined?<Toast message="Added to the waitlist"/>:(<>
          <Button variant="primary" size="lg" block onClick={onJoin}>Join the waitlist</Button>
          <Button variant="secondary" size="lg" block onClick={onSwitch}>Use a different account</Button>
          <Terms>Invited on another address? Sign in with that one.</Terms>
        </>)}
      </GateFoot>
    </div>
  );
}

/* Three screens, once per person, never again on any device. Skip sits in the same place
   on all three so it never moves under the thumb. */
const TUTORIAL=[
  {title:"Dump anything",sub:"Half a thought, a photo, a voice note. No folders, no tidying.",art:"bubbles"},
  {title:"offload sorts it",sub:"Related bits end up together, with the dates and the money attached.",art:"things"},
  {title:"It only interrupts when it matters",sub:"Deadlines and answers you are waiting on. Nothing else.",art:"notification"}
];
const DUMPS=["Ana can only travel the 14th to the 17th","€214 for the flights","matte black, 30cm","dentist after the 20th"];
const THINGS=[["lasso","Lisbon trip","4 things"],["bookmark","Bookshelf build","2 things"],["cloudy","Read later","23 things"]];
function TutorialArt({kind}){
  if(kind==="bubbles")return (
    <div style={{width:"100%",display:"flex",flexDirection:"column",gap:12}}>
      {DUMPS.map((t,i)=>(
        <span key={t} style={{alignSelf:i%2?"flex-end":"flex-start",maxWidth:"88%",padding:"11px 15px",
          borderRadius:18,background:"var(--surface-fill)",color:"var(--text-secondary)",
          font:"var(--weight-regular) 15px/1.35 var(--font-core)"}}>{t}</span>
      ))}
    </div>
  );
  if(kind==="things")return (
    <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
      {THINGS.map(([icon,name,meta])=>(
        <span key={name} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 15px",borderRadius:"var(--radius-lg)",
          border:"1px solid var(--border-hairline)",background:"var(--surface-raised)"}}>
          <span style={{width:32,height:32,borderRadius:"var(--radius-sm)",background:"var(--surface-fill)",
            display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-secondary)"}}><Icon name={icon} size={17}/></span>
          <span style={{flex:1,font:"var(--weight-medium) 15px/1 var(--font-core)"}}>{name}</span>
          <span style={{font:"var(--text-body-sm-role)",color:"var(--text-tertiary)"}}>{meta}</span>
        </span>
      ))}
    </div>
  );
  return <NotificationIOS app="offload" time="now" title="Brackets go up Friday" body="You saved the link on Tuesday." width={342}/>;
}
const STEPS=TUTORIAL.length+1;
/* Dots left, the way out top right, identical on every step so neither moves
   under the thumb between screens. */
function StepBar({step,total=STEPS,onSkip,skipLabel="Skip"}){
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 var(--gutter-screen)"}}>
      <span style={{display:"flex",gap:6,alignItems:"center"}}>
        {Array.from({length:total}).map((_,i)=>(
          <span key={i} style={{height:6,width:i+1===step?18:6,borderRadius:"var(--radius-pill)",
            background:i+1===step?"var(--ink-950)":"var(--ink-200)",transition:"width 200ms var(--ease-out)"}}/>
        ))}
      </span>
      <button type="button" onClick={onSkip} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
        border:"none",background:"none",cursor:"pointer",height:"var(--tap-min)",
        padding:"0 var(--space-4)",margin:"0 calc(var(--space-4) * -1)",
        font:"var(--text-label-role)",color:"var(--text-secondary)"}}>{skipLabel}</button>
    </div>
  );
}
function TutorialScreen({step=1,onNext,onSkip}){
  const s=TUTORIAL[step-1];
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",padding:"14px 0 0"}}>
      <StepBar step={step} onSkip={onSkip}/>
      <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 var(--gutter-screen)"}}>
        <TutorialArt kind={s.art}/>
      </div>
      <div style={{padding:"0 var(--gutter-screen) 24px"}}>
        <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)"}}>{s.title}</div>
        <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:10,lineHeight:"var(--leading-body)"}}>{s.sub}</div>
      </div>
      {/* Next on the last card too: the tutorial does not end the flow any more. */}
      <GateFoot><Button variant="primary" size="lg" block onClick={onNext}>Next</Button></GateFoot>
    </div>
  );
}

/* The last screen of first run, after the tutorial. One provider, one screen: the mark
   large enough to be read before the words, two sentences, one button and Not now.
   Deliberately makes no claim that a list exists, so a second provider becomes another
   screen rather than a redesign.

   ALL COPY HERE IS PLACEHOLDER. The two sentences commit the product to something about
   another service's data, which is the app's call, not the design system's. The shape is
   ours: what offload reads, what it does back, both as prose rather than toggles, per the
   5 September Privacy refusal. As of 8 September offload MAY write to a connected
   calendar, so nothing here promises read-only.

   The provider's mark is never redrawn. offload's own comes from Logo.jsx because that
   geometry is ours; a third party's radius, colours and letterforms are their
   specification, and 90% right is what people spot instantly on a logo they see daily.
   This kit draws a neutral stand-in; the build passes the official asset as `mark`. */
function ProviderMark({mark,size=88,radius=18}){
  const [broken,setBroken]=React.useState(false);
  if(mark&&!broken) return <img src={mark} alt="" width={size} height={size} onError={()=>setBroken(true)}
    style={{display:"block",width:size,height:size,borderRadius:radius,objectFit:"contain"}}/>;
  return <span aria-hidden="true" title="Drop the official mark at assets/brands/google-calendar.svg"
    style={{display:"block",width:size,height:size,borderRadius:radius,
    background:"var(--surface-fill)",border:"1px dashed var(--border-strong)"}}/>;
}
function ConnectScreen({provider="Google Calendar",mark,step=STEPS,onConnect,onSkip}){
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",padding:"14px 0 0"}}>
      {/* Not now, never Skip: Skip means skip the tutorial. Turning down a
          connection is a different answer to a different question, so the word
          changes while the position does not. */}
      <StepBar step={step} onSkip={onSkip} skipLabel="Not now"/>
      <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 var(--gutter-screen)"}}>
        <ProviderMark mark={mark}/>
      </div>
      <div style={{padding:"0 var(--gutter-screen) 24px"}}>
        <div style={{font:"var(--text-title-1)",letterSpacing:"var(--tracking-title)",textWrap:"pretty"}}>Bring in your calendar</div>
        <div style={{font:"var(--text-body-role)",color:"var(--text-secondary)",marginTop:10,
          lineHeight:"var(--leading-body)",textWrap:"pretty"}}>So &ldquo;before the trip&rdquo; and &ldquo;after the dentist&rdquo; mean something.</div>
        <div style={{display:"flex",flexDirection:"column",gap:"var(--space-5)",marginTop:"var(--space-7)"}}>
          {[["calendar","offload reads your days.","Times, titles and who is on them."],
            ["plus","And it can add to them.","Anything you dump with a time on it can land back on your calendar."]].map(([ic,head,rest])=>(
            <div key={head} style={{display:"flex",gap:"var(--space-5)",alignItems:"flex-start"}}>
              <Icon name={ic} size={16} style={{marginTop:3,flex:"0 0 auto",color:"var(--text-tertiary)"}}/>
              <span style={{flex:1,minWidth:0,fontSize:"var(--size-body-sm)",lineHeight:1.45,color:"var(--text-secondary)"}}>
                <b style={{color:"var(--text-primary)",fontWeight:500}}>{head}</b> {rest}
              </span>
            </div>
          ))}
        </div>
      </div>
      <GateFoot><Button variant="primary" size="lg" block onClick={onConnect}>{`Connect ${provider}`}</Button></GateFoot>
    </div>
  );
}
/* Day one, after Get started. Today shows what a dump looks like, because the examples
   teach what the tutorial could not: half a sentence is a legitimate thing to type. They
   fill the composer rather than submitting, and they never come back once something real
   is in. The other two tabs stay quiet: one sentence, no button, the mark at 22%. */
const EXAMPLES=["Book the Alfama flat for the 14th","Ana can only travel the 14th to the 17th","Oak brackets, 30cm, matte black"];
function EmptyToday({onExample,unread,barSolid,onOpenNotifications,onOpenSettings}){
  return (
    <>
      <DayOneBar unread={unread} barSolid={barSolid} onOpenNotifications={onOpenNotifications} onOpenSettings={onOpenSettings}/>
      <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"var(--space-6) var(--gutter-screen) 0"}}>
        <div style={{font:"var(--text-quiet-role)",fontSize:17,lineHeight:1.5}}>
          Dump the first thing and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.</div>
        <div style={{display:"flex",flexDirection:"column",gap:"var(--space-3)",marginTop:"var(--space-7)"}}>
          {EXAMPLES.map(e=>(
            <button key={e} type="button" onClick={()=>onExample&&onExample(e)}
              style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"13px 15px",textAlign:"left",
                borderRadius:"var(--radius-md)",cursor:"pointer",background:"var(--surface-raised)",
                border:"1px dashed var(--border-strong)",font:"var(--weight-regular) 15px/1.4 var(--font-core)",
                color:"var(--text-secondary)"}}>
              <Icon name="arrow-up" size={14} style={{color:"var(--text-accent)"}}/>{e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
/* The same bar as every other screen: wordmark, activity, settings. A day-one screen is
   still the app, so it is not allowed its own chrome. */
function DayOneBar({unread,barSolid,onOpenNotifications,onOpenSettings}){
  return (
    <AppBar border={false} title={<Logo size={21}/>}
      style={barSolid?{background:"var(--surface-raised)",backdropFilter:"none",WebkitBackdropFilter:"none"}:{background:"var(--surface-chrome)"}}
      right={<><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/>
        <IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
  );
}
function QuietEmpty({line,unread,barSolid,onOpenNotifications,onOpenSettings}){
  return (
    <>
      <DayOneBar unread={unread} barSolid={barSolid} onOpenNotifications={onOpenNotifications} onOpenSettings={onOpenSettings}/>
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        textAlign:"center",padding:"0 var(--gutter-screen)"}}>
        <span style={{opacity:.22}}><Logo variant="mark" size={30}/></span>
        <div style={{font:"var(--text-quiet-role)",fontSize:17,lineHeight:1.5,marginTop:"var(--space-5)",maxWidth:"27ch"}}>{line}</div>
      </div>
    </>
  );
}

Object.assign(window,{EmptyToday,QuietEmpty,DayOneBar,GateShell,SignInScreen,NotInvitedScreen,TutorialScreen,ConnectScreen,ProviderMark,StepBar,TUTORIAL_STEPS:TUTORIAL.length,FIRST_RUN_STEPS:STEPS,
  AppleGlyph,GoogleGlyph,ProviderButton,BigLockup,RefusalLine});
