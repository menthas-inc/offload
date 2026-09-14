const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Logo, Icon, Toast, NotificationAndroid, PrismField } = OFFLOAD_DS;

/* The same gate as iOS with the order flipped: Google leads, because that account is
   already on the device. Buttons are 56dp, the primary is filled blue, and Skip is a
   Material text button rather than a grey label. */
const A_APPLE=({size=18})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{display:"block"}}>
    <path d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.02-.9.9-2.02 1.42-3.02 1.33-.06-1.08.44-2.2 1.26-3.03.86-.87 2.1-1.4 3.01-1.32zM20.9 8.6c-1.7-.1-3.1.96-3.9.96-.83 0-2.05-.92-3.38-.9-1.74.03-3.35 1.01-4.24 2.57-1.82 3.15-.47 7.82 1.3 10.38.86 1.25 1.9 2.65 3.25 2.6 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.38.82 1.4-.03 2.29-1.27 3.15-2.53.98-1.45 1.38-2.85 1.4-2.92-.03-.01-2.7-1.04-2.72-4.12-.03-2.58 2.1-3.82 2.2-3.88-1.2-1.77-3.07-1.97-3.71-2.01z"/></svg>
);
const A_GOOGLE=({size=18})=>(
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{display:"block"}}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
);
function AButton({tone="filled",onClick,children,glyph}){
  const filled=tone==="filled",dark=tone==="dark",text=tone==="text";
  return (
    <button type="button" onClick={onClick} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,
      width:"100%",height:56,borderRadius:"var(--radius-pill)",cursor:"pointer",
      background:filled?"var(--blue-600)":dark?"var(--ink-950)":text?"transparent":"var(--surface-raised)",
      color:filled||dark?"#FFFFFF":text?"var(--blue-700)":"var(--a-on)",
      border:filled||dark||text?"1px solid transparent":"1px solid var(--a-outline)",
      font:"var(--weight-medium) 15px/1 var(--font-core)",letterSpacing:"0.01em"}}>
      {glyph||null}{children}
    </button>
  );
}
function ABigLockup(){
  return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",zIndex:1}}>
      <span style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
        <Logo variant="mark" size={92}/>
        <span style={{font:"var(--weight-semibold) 30px/1 var(--font-core)",letterSpacing:"-0.03em"}}>offload</span>
      </span>
    </div>
  );
}
function ARefusalLine({children}){
  return (
    <div style={{padding:"14px 16px",borderRadius:"var(--radius-md)",background:"var(--surface-attention-soft)",
      color:"var(--text-on-attention)",font:"var(--weight-regular) 14px/20px var(--font-core)",letterSpacing:"0.015em"}}>{children}</div>
  );
}
function AGateBody({title,sub}){
  return (
    <div style={{textAlign:"center",padding:"0 24px 44px",position:"relative",zIndex:1}}>
      <div style={{font:"var(--weight-semibold) 28px/1.18 var(--font-core)",letterSpacing:"-0.014em"}}>{title}</div>
      {sub?<div style={{font:"var(--weight-regular) 16px/24px var(--font-core)",letterSpacing:"0.01em",
        color:"var(--a-on-var)",marginTop:14}}>{sub}</div>:null}
    </div>
  );
}
function AGateFoot({children}){
  return <div style={{flex:"0 0 auto",padding:"0 24px 18px",display:"flex",flexDirection:"column",gap:12,position:"relative",zIndex:1}}>{children}</div>;
}
function ATerms({children}){
  return <div style={{font:"var(--weight-regular) 12.5px/18px var(--font-core)",color:"var(--a-on-var)",textAlign:"center"}}>{children}</div>;
}

/* The gate's atmosphere belongs to first run, not to any one of its screens:
   sign-in, the refusal, the tutorial and connect are one surface with changing
   content, so the field is mounted once around all four and warps once on
   arrival rather than restarting at every step. */
function AGateShell({children}){
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",position:"relative"}}>
      {PrismField?<PrismField variant="bloom" veil="none" arriveOnMount basePath="../../assets/prism"
        style={{inset:"auto",left:"-34%",top:"-20%",width:"120%",height:"58%",zIndex:0}}/>:null}
      <div style={{position:"relative",zIndex:1,flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>{children}</div>
    </div>
  );
}
function M3SignInScreen({error,onApple,onGoogle}){
  return (
    /* No veil on the gate's field: nothing in --text-tertiary crosses it. */
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
      <ABigLockup/>
      <AGateBody title="One place for everything you would otherwise forget."
        sub="Sign in to start. Invite only for now."/>
      <AGateFoot>
        {error?<ARefusalLine>{error}</ARefusalLine>:null}
        <AButton tone="filled" glyph={<A_GOOGLE/>} onClick={onGoogle}>Continue with Google</AButton>
        <AButton tone="dark" glyph={<A_APPLE/>} onClick={onApple}>Continue with Apple</AButton>
        <ATerms>No invite yet? <b style={{color:"var(--blue-700)",fontWeight:500}}>Join the waitlist</b><br/>Terms · Privacy</ATerms>
      </AGateFoot>
    </div>
  );
}

function M3NotInvitedScreen({email="jo@hey.com",joined,onJoin,onSwitch}){
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
      <ABigLockup/>
      {joined
        ?<AGateBody title="You're on the list" sub={"We'll email "+email+" when your account is ready to use."}/>
        :<AGateBody title="You're not on the list yet" sub={"We checked "+email+" and found no invite."}/>}
      <AGateFoot>
        {joined
          ?<Toast message="Added to the waitlist" style={{borderRadius:"var(--radius-xs)",
            boxShadow:"0 1px 2px rgba(0,0,0,0.3),0 2px 6px 2px rgba(0,0,0,0.15)"}}/>
          :(<>
            <AButton tone="filled" onClick={onJoin}>Join the waitlist</AButton>
            <AButton tone="outlined" onClick={onSwitch}>Use a different account</AButton>
            <ATerms>Invited on another address? Sign in with that one.</ATerms>
          </>)}
      </AGateFoot>
    </div>
  );
}

const A_TUTORIAL=[
  {title:"Dump anything",sub:"Half a thought, a photo, a voice note. No folders, no tidying.",art:"bubbles"},
  {title:"offload sorts it",sub:"Related bits end up together, with the dates and the money attached.",art:"things"},
  {title:"It only interrupts when it matters",sub:"Deadlines and answers you are waiting on. Nothing else.",art:"notification"}
];
const A_DUMPS=["Ana can only travel the 14th to the 17th","€214 for the flights","matte black, 30cm","dentist after the 20th"];
const A_THINGS=[["lasso","Lisbon trip","4 things"],["bookmark","Bookshelf build","2 things"],["cloudy","Read later","23 things"]];
function ATutorialArt({kind}){
  if(kind==="bubbles")return (
    <div style={{width:"100%",display:"flex",flexDirection:"column",gap:12}}>
      {A_DUMPS.map((t,i)=>(
        <span key={t} style={{alignSelf:i%2?"flex-end":"flex-start",maxWidth:"88%",padding:"12px 16px",
          borderRadius:16,background:"var(--a-c-low)",color:"var(--a-on-var)",
          font:"var(--weight-regular) 15px/21px var(--font-core)"}}>{t}</span>
      ))}
    </div>
  );
  if(kind==="things")return (
    <div style={{width:"100%",display:"flex",flexDirection:"column",gap:8}}>
      {A_THINGS.map(([icon,name,meta])=>(
        <span key={name} style={{display:"flex",alignItems:"center",gap:16,padding:"12px 16px",borderRadius:12,
          background:"var(--a-c-low)"}}>
          <span style={{width:40,height:40,borderRadius:"var(--radius-pill)",background:"var(--a-c-high)",
            display:"flex",alignItems:"center",justifyContent:"center",color:"var(--a-on-var)"}}><Icon name={icon} size={19}/></span>
          <span style={{flex:1,font:"var(--weight-regular) 16px/24px var(--font-core)"}}>{name}</span>
          <span style={{font:"var(--weight-regular) 14px/20px var(--font-core)",color:"var(--a-on-var)"}}>{meta}</span>
        </span>
      ))}
    </div>
  );
  return <NotificationAndroid app="offload" time="now" title="Brackets go up Friday"
    body="You saved the link on Tuesday." width={312}/>;
}
const A_STEPS=A_TUTORIAL.length+1;
/* Dots left, the way out top right, identical on every step. */
function AStepBar({step,total=A_STEPS,onSkip,skipLabel="Skip"}){
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px"}}>
      <span style={{display:"flex",gap:6,alignItems:"center"}}>
        {Array.from({length:total}).map((_,i)=>(
          <span key={i} style={{height:6,width:i+1===step?18:6,borderRadius:"var(--radius-pill)",
            background:i+1===step?"var(--a-on)":"var(--a-c-high)",transition:"width 200ms var(--ease-out)"}}/>
        ))}
      </span>
      <button type="button" onClick={onSkip} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
        border:"none",background:"none",cursor:"pointer",height:48,
        padding:"0 12px",margin:"0 -12px",
        font:"var(--weight-medium) 14px/20px var(--font-core)",color:"var(--blue-700)"}}>{skipLabel}</button>
    </div>
  );
}
function M3TutorialScreen({step=1,onNext,onSkip}){
  const s=A_TUTORIAL[step-1];
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",padding:"16px 0 0"}}>
      <AStepBar step={step} onSkip={onSkip}/>
      <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
        <ATutorialArt kind={s.art}/>
      </div>
      <div style={{padding:"0 24px 24px"}}>
        <div style={{font:"var(--weight-semibold) 28px/1.18 var(--font-core)",letterSpacing:"-0.014em"}}>{s.title}</div>
        <div style={{font:"var(--weight-regular) 16px/24px var(--font-core)",letterSpacing:"0.01em",
          color:"var(--a-on-var)",marginTop:12}}>{s.sub}</div>
      </div>
      {/* Next on the last card too: the tutorial no longer ends the flow. */}
      <AGateFoot><AButton tone="filled" onClick={onNext}>Next</AButton></AGateFoot>
    </div>
  );
}
/* The last screen of first run. Same decision as iOS, Material geometry: one provider,
   the mark read before the words, two sentences, a filled button and a text button.

   ALL COPY HERE IS PLACEHOLDER, and the two sentences most of all: they commit the
   product to something about another service's data, which is the app's call. The shape
   is ours, what offload reads and what it does back, as prose rather than switches. As of
   8 September offload MAY write to a connected calendar, so nothing promises read-only.

   The provider's mark is never redrawn; the build passes the official asset as `mark`. */
function AProviderMark({mark,size=88,radius=20}){
  const [broken,setBroken]=React.useState(false);
  if(mark&&!broken) return <img src={mark} alt="" width={size} height={size} onError={()=>setBroken(true)}
    style={{display:"block",width:size,height:size,borderRadius:radius,objectFit:"contain"}}/>;
  return <span aria-hidden="true" title="Drop the official mark at assets/brands/google-calendar.svg"
    style={{display:"block",width:size,height:size,borderRadius:radius,
    background:"var(--a-c-low)",border:"1px dashed var(--a-outline)"}}/>;
}
function M3ConnectScreen({provider="Google Calendar",mark,step=A_STEPS,onConnect,onSkip}){
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",padding:"16px 0 0"}}>
      {/* Not now, never Skip. Same position, different word. */}
      <AStepBar step={step} onSkip={onSkip} skipLabel="Not now"/>
      <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
        <AProviderMark mark={mark}/>
      </div>
      <div style={{padding:"0 24px 24px"}}>
        <div style={{font:"var(--weight-semibold) 28px/1.18 var(--font-core)",letterSpacing:"-0.014em",textWrap:"pretty"}}>Bring in your calendar</div>
        <div style={{font:"var(--weight-regular) 16px/24px var(--font-core)",letterSpacing:"0.01em",
          color:"var(--a-on-var)",marginTop:12,textWrap:"pretty"}}>So &ldquo;before the trip&rdquo; and &ldquo;after the dentist&rdquo; mean something.</div>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:20}}>
          {[["calendar","offload reads your days.","Times, titles and who is on them."],
            ["plus","And it can add to them.","Anything you dump with a time on it can land back on your calendar."]].map(([ic,head,rest])=>(
            <div key={head} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <Icon name={ic} size={16} style={{marginTop:4,flex:"0 0 auto",color:"var(--a-on-var)"}}/>
              <span style={{flex:1,minWidth:0,font:"var(--weight-regular) 14px/20px var(--font-core)",
                letterSpacing:"0.015em",color:"var(--a-on-var)"}}>
                <b style={{color:"var(--a-on)",fontWeight:500}}>{head}</b> {rest}
              </span>
            </div>
          ))}
        </div>
      </div>
      <AGateFoot><AButton tone="filled" onClick={onConnect}>{`Connect ${provider}`}</AButton></AGateFoot>
    </div>
  );
}
/* Day one, after Get started. Today shows what a dump looks like, because the examples
   teach what the tutorial could not: half a sentence is a legitimate thing to type. They
   fill the composer rather than submitting, and they never come back once something real
   is in. The other two tabs stay quiet: one sentence, no button, the mark at 22%. */
const EXAMPLES=["Book the Alfama flat for the 14th","Ana can only travel the 14th to the 17th","Oak brackets, 30cm, matte black"];
function M3EmptyToday({onExample,unread,onOpenNotifications,onOpenSettings}){
  return (
    <>
      <M3DayOneBar unread={unread} onOpenNotifications={onOpenNotifications} onOpenSettings={onOpenSettings}/>
      <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"var(--space-6) var(--gutter-screen) 0"}}>
        <div style={{font:"var(--text-quiet-role)",fontSize:17,lineHeight:1.5}}>
          Dump the first thing and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.</div>
        <div style={{display:"flex",flexDirection:"column",gap:"var(--space-3)",marginTop:"var(--space-7)"}}>
          {EXAMPLES.map(e=>(
            <button key={e} type="button" onClick={()=>onExample&&onExample(e)}
              style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"13px 15px",textAlign:"left",
                borderRadius:12,cursor:"pointer",background:"var(--a-c-low)",
                border:"1px dashed var(--a-outline)",font:"var(--weight-regular) 15px/1.4 var(--font-core)",
                color:"var(--text-secondary)"}}>
              <Icon name="arrow-up" size={14} style={{color:"var(--text-accent)"}}/>{e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
/* Material's own top bar, the same one every other screen uses. */
function M3DayOneBar({unread,onOpenNotifications,onOpenSettings}){
  return (
    <ABar wordmark
      right={<><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/>
        <IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
  );
}
function M3QuietEmpty({line,unread,onOpenNotifications,onOpenSettings}){
  return (
    <>
      <M3DayOneBar unread={unread} onOpenNotifications={onOpenNotifications} onOpenSettings={onOpenSettings}/>
      <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        textAlign:"center",padding:"0 var(--gutter-screen)"}}>
        <span style={{opacity:.22}}><Logo variant="mark" size={30}/></span>
        <div style={{font:"var(--text-quiet-role)",fontSize:17,lineHeight:1.5,marginTop:"var(--space-5)",maxWidth:"27ch"}}>{line}</div>
      </div>
    </>
  );
}


Object.assign(window,{AGateShell,M3EmptyToday,M3QuietEmpty,M3DayOneBar,M3SignInScreen,M3NotInvitedScreen,M3TutorialScreen,M3ConnectScreen,AProviderMark,AStepBar,A_TUTORIAL_STEPS:A_TUTORIAL.length,A_FIRST_RUN_STEPS:A_STEPS});
