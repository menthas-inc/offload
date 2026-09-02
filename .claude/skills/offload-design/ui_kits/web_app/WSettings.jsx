const { Icon, IconButton, Badge, Button, Chip, Switch, SegmentedControl, TextField } = OFFLOAD_DS;

/* Settings as two panes, the kit's own model: the index stays on the left, the page you
   picked opens to the right, and both follow the depth paper like any other pane. The ten
   pages and their copy are the phone kits'. */
const S_GROUPS=[
  ["You",[["circle-dot","account","My account","jo@hey.com"],["users","people","My people","3"],
    ["lock","privacy","Privacy",null]]],
  ["Reaching you",[["bell","comms","Communication","Quiet 22:00"],["link","apps","Connected apps","2 of 4"]]],
  ["What offload keeps",[["archive","memory","Memory and data","34"],
    ["clock-fading","retention","Conversations kept","60 days"]]],
  ["The app",[["blend","appearance","Appearance","System"],["orbit","language","Language and region","EN, metric"],
    ["compass","help","Help and about","2.1.0"]]]
];
const S_PAGE={};
S_GROUPS.forEach(([g,rows])=>rows.forEach(([icon,id,title,value])=>{S_PAGE[id]={icon,title,value,group:g}}));

function WSettings({onOpen,activeId}){
  return (
    <>
      <WPaneHead big title="Settings" sub="jo@hey.com · signed in on two devices"/>
      <WBody>
        {S_GROUPS.map(([g,rows],gi)=>(
          <React.Fragment key={g}>
            <WSection>{g}</WSection>
            {rows.map(([icon,id,title,value],i)=>(
              <WRow key={id} icon={icon} title={title} last={i===rows.length-1}
                selected={activeId===id} onClick={()=>onOpen(id)}
                trailing={value?<span style={{font:"var(--weight-medium) 13.5px/1 var(--font-core)",
                  color:"var(--text-secondary)",fontVariantNumeric:"tabular-nums"}}>{value}</span>
                  :<Icon name="chevron-right" size={15} style={{color:"var(--ink-300)"}}/>}/>
            ))}
          </React.Fragment>
        ))}
      </WBody>
    </>
  );
}

/* One pattern for the pages: a heading, then blocks. A block is a label and rows. */
function SBlock({title,note,children,cols}){
  return (
    <div style={{padding:"var(--space-7) 0 0"}}>
      <div style={{font:"var(--weight-semibold) 15px/1.2 var(--font-core)"}}>{title}</div>
      {note?<div style={{fontSize:13.5,color:"var(--text-secondary)",marginTop:3}}>{note}</div>:null}
      <div style={{marginTop:"var(--space-5)",display:cols?"grid":"flex",
        gridTemplateColumns:cols?"1fr 1fr":undefined,gap:cols?"var(--space-5)":"var(--space-6)",
        flexDirection:cols?undefined:"column"}}>{children}</div>
    </div>
  );
}
function SLine({title,meta,value,onClick,last}){
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:"var(--space-5)",minHeight:46,
      cursor:onClick?"pointer":"default",boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
      <span style={{flex:1,minWidth:0}}>
        <span style={{display:"block",font:"var(--text-body-role)"}}>{title}</span>
        {meta?<span style={{display:"block",fontSize:13,color:"var(--text-secondary)",marginTop:1}}>{meta}</span>:null}
      </span>
      {value?<span style={{fontSize:13.5,color:"var(--text-secondary)",fontVariantNumeric:"tabular-nums"}}>{value}</span>:null}
      {onClick?<Icon name="chevron-right" size={15} style={{color:"var(--ink-300)"}}/>:null}
    </div>
  );
}
function SPick({options,value,onChange}){
  return (
    <div style={{display:"flex",flexDirection:"column"}}>
      {options.map((o,i)=>(
        <div key={o} onClick={()=>onChange(o)} style={{display:"flex",alignItems:"center",gap:"var(--space-4)",
          minHeight:46,cursor:"pointer",boxShadow:i===options.length-1?"none":"inset 0 -1px 0 var(--border-hairline)"}}>
          <span style={{flex:1,font:"var(--text-body-role)"}}>{o}</span>
          {o===value?<Icon name="check" size={16} style={{color:"var(--text-accent)"}}/>:null}
        </div>
      ))}
    </div>
  );
}
function SToggle({title,meta,on,onToggle}){
  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:"var(--space-5)"}}>
      <span style={{flex:1,minWidth:0}}>
        <span style={{display:"block",font:"var(--text-body-role)"}}>{title}</span>
        {meta?<span style={{display:"block",fontSize:13,color:"var(--text-secondary)",marginTop:2}}>{meta}</span>:null}
      </span>
      <Switch checked={on} onChange={onToggle}/>
    </div>
  );
}
function SCard({title,meta,on,onToggle}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-5)",padding:"var(--space-5)",
      border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-md)"}}>
      <span style={{flex:1,minWidth:0}}>
        <b style={{display:"block",font:"var(--weight-medium) 14.5px/1.3 var(--font-core)"}}>{title}</b>
        <span style={{display:"block",fontSize:13,color:"var(--text-secondary)",marginTop:1}}>{meta}</span>
      </span>
      <Switch checked={on} onChange={onToggle}/>
    </div>
  );
}
function SDanger({label,body,action}){
  return (
    <div style={{margin:"var(--space-8) 0 0",padding:"var(--space-5) var(--space-6)",
      border:"1px solid var(--clay-100)",borderRadius:"var(--radius-md)",background:"var(--clay-100)"}}>
      <b style={{display:"block",font:"var(--weight-medium) 14.5px/1.3 var(--font-core)",color:"var(--text-danger)"}}>{label}</b>
      <span style={{display:"block",fontSize:13.5,lineHeight:1.5,color:"var(--text-danger)",opacity:.85,marginTop:3}}>{body}</span>
      <div style={{marginTop:"var(--space-5)"}}>
        <button type="button" style={{height:32,padding:"0 var(--space-5)",border:"none",cursor:"pointer",
          borderRadius:"var(--radius-sm)",font:"var(--weight-medium) var(--size-label)/1 var(--font-core)",
          color:"var(--text-on-solid)",background:"var(--clay-600)"}}>{action}</button>
      </div>
    </div>
  );
}

function WSetting({id,onOpenPerson}){
  const page=S_PAGE[id]||{title:"Settings"};
  const [comms,setComms]=React.useState({quiet:true,urgent:false,how:"Push"});
  const [apps,setApps]=React.useState({Calendar:true,Mail:true,Photos:false,Files:false});
  const [privacy,setPrivacy]=React.useState({learn:true,share:false,analytics:false});
  const [kept,setKept]=React.useState("60 days");
  const [look,setLook]=React.useState("System");
  const body=()=>{
    if(id==="comms")return (
      <>
        <SBlock title="What reaches you, and when">
          {[["Anything urgent","Straight away"],["What moved without you","Once a day, 18:00"],
            ["What offload sorted","Weekly"],["Someone shared a thing","Straight away"]].map(([t,v],i,a)=>
            <SLine key={t} title={t} value={v} onClick={()=>{}} last={i===a.length-1}/>)}
        </SBlock>
        <SBlock title="Quiet hours" note="Nothing buzzes between these hours.">
          <Switch label="Hold everything overnight" checked={comms.quiet}
            onChange={(v)=>setComms(c=>({...c,quiet:v}))}/>
          <div style={{display:"flex",gap:"var(--space-5)",maxWidth:360}}>
            <TextField label="From" value="22:00" onChange={()=>{}} style={{flex:1}}/>
            <TextField label="Until" value="07:30" onChange={()=>{}} style={{flex:1}}/>
          </div>
          <Switch label="Let urgent things through anyway" checked={comms.urgent}
            onChange={(v)=>setComms(c=>({...c,urgent:v}))}/>
        </SBlock>
        <SBlock title="How offload reaches you">
          <SegmentedControl options={["Push","Email","Neither"]} value={comms.how}
            onChange={(v)=>setComms(c=>({...c,how:v}))}/>
        </SBlock>
      </>
    );
    if(id==="apps")return (
      <>
        <SBlock title="Connected" note="offload reads these to keep your things current. It never writes." cols>
          <SCard title="Calendar" meta="Reading your week" on={apps.Calendar} onToggle={(v)=>setApps(a=>({...a,Calendar:v}))}/>
          <SCard title="Mail" meta="Watching for things you dump" on={apps.Mail} onToggle={(v)=>setApps(a=>({...a,Mail:v}))}/>
          <SCard title="Photos" meta="Not connected" on={apps.Photos} onToggle={(v)=>setApps(a=>({...a,Photos:v}))}/>
          <SCard title="Files" meta="Not connected" on={apps.Files} onToggle={(v)=>setApps(a=>({...a,Files:v}))}/>
        </SBlock>
        <SBlock title="What came from where">
          <SLine title="Renew the flat insurance" meta="from an email you dumped" value="Mail"/>
          <SLine title="Standup, 9:30" meta="tomorrow" value="Calendar" last/>
        </SBlock>
      </>
    );
    if(id==="account")return (
      <>
        <SBlock title="Profile">
          <div style={{display:"flex",alignItems:"center",gap:"var(--space-5)"}}>
            <span style={{width:46,height:46,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
              background:"var(--surface-fill)",display:"flex",alignItems:"center",justifyContent:"center",
              color:"var(--text-secondary)"}}><Icon name="circle-dot" size={21}/></span>
            <span style={{flex:1,minWidth:0}}>
              <b style={{display:"block",font:"var(--weight-medium) 15.5px/1.3 var(--font-core)"}}>Jo Meyer</b>
              <span style={{display:"block",fontSize:13.5,color:"var(--text-secondary)"}}>jo@hey.com</span>
            </span>
            <Button variant="secondary" size="sm">Sign out</Button>
          </div>
        </SBlock>
        <SBlock title="Signed in on" note="Sign out of a device and everything on it stops syncing.">
          <SLine title="This browser" meta="Chrome, London · now" value="Current"/>
          <SLine title="iPhone" meta="Last seen 2m ago" onClick={()=>{}} last/>
        </SBlock>
        <SDanger label="Delete your account" body="Everything offload keeps goes with it, on every device. There is no undo for this one."
          action="Delete everything"/>
      </>
    );
    if(id==="people")return (
      <>
        <SBlock title="Who you share threads with">
          {Object.keys(D.people).map((k,i,a)=>{
            const p=D.people[k];
            return <SLine key={k} title={p.name} meta={p.meta||"shares 1 thread"}
              onClick={()=>onOpenPerson&&onOpenPerson(k)} last={i===a.length-1}/>;
          })}
        </SBlock>
        <SBlock title="When someone shares with you">
          <SPick options={["Put it straight in","Ask me first"]} value="Ask me first" onChange={()=>{}}/>
        </SBlock>
      </>
    );
    if(id==="privacy")return (
      <>
        <SBlock title="What offload may do with your things">
          <SToggle title="Learn from what I dump" meta="How it knows the brackets belong to the bookshelf"
            on={privacy.learn} onToggle={(v)=>setPrivacy(p=>({...p,learn:v}))}/>
          <Switch label="Use my threads to improve offload for everyone" checked={privacy.share}
            onChange={(v)=>setPrivacy(p=>({...p,share:v}))}/>
          <Switch label="Send crash and usage reports" checked={privacy.analytics}
            onChange={(v)=>setPrivacy(p=>({...p,analytics:v}))}/>
        </SBlock>
        <SBlock title="Your copy">
          <SLine title="Export everything" meta="One file, readable without offload" onClick={()=>{}} last/>
        </SBlock>
      </>
    );
    if(id==="memory")return (
      <>
        <SBlock title="What offload knows" cols>
          {[["34","things it remembers"],["11","things they belong to"],["6","it inferred this week"],["2","people"]].map(([n,l])=>(
            <div key={l} style={{padding:"var(--space-5) var(--space-6)",border:"1px solid var(--border-hairline)",
              borderRadius:"var(--radius-md)"}}>
              <div style={{font:"var(--weight-semibold) 24px/1 var(--font-core)",fontVariantNumeric:"tabular-nums"}}>{n}</div>
              <div style={{fontSize:13,color:"var(--text-secondary)",marginTop:4}}>{l}</div>
            </div>
          ))}
        </SBlock>
        <SBlock title="Where it came from">
          <SLine title="Things you dumped" value="21"/>
          <SLine title="Read from a connected app" value="9"/>
          <SLine title="offload worked it out" value="4" last/>
        </SBlock>
        <SDanger label="Forget everything" body="Every memory, every thing, every conversation. Your account stays."
          action="Forget everything"/>
      </>
    );
    if(id==="retention")return (
      <>
        <SBlock title="Keep conversations for" note="Things offload made from a conversation stay whatever you choose here.">
          <SPick options={["30 days","60 days","A year","Forever"]} value={kept} onChange={setKept}/>
        </SBlock>
        <SBlock title="Right now">
          <SLine title="Conversations kept" value="18"/>
          <SLine title="Oldest" value="12 June" last/>
        </SBlock>
      </>
    );
    if(id==="appearance")return (
      <>
        <SBlock title="Theme">
          <SPick options={["Light","Dark","System"]} value={look} onChange={setLook}/>
          <div style={{fontSize:13,color:"var(--text-secondary)"}}>
            The preview control above the window is the same switch, for this kit only.</div>
        </SBlock>
        <SBlock title="On this screen">
          <SLine title="Panes open to the right" value="Always"/>
          <SLine title="Drop to one pane below" value="1250px" last/>
        </SBlock>
      </>
    );
    if(id==="language")return (
      <>
        <SBlock title="Language">
          <SPick options={["English","Deutsch","Portugu\u00eas"]} value="English" onChange={()=>{}}/>
        </SBlock>
        <SBlock title="Region">
          <SLine title="Units" value="Metric" onClick={()=>{}}/>
          <SLine title="First day of the week" value="Monday" onClick={()=>{}}/>
          <SLine title="Time" value="24 hour" onClick={()=>{}} last/>
        </SBlock>
      </>
    );
    return (
      <>
        <SBlock title="offload for web">
          <SLine title="Version" value="2.1.0"/>
          <SLine title="What is new" onClick={()=>{}}/>
          <SLine title="Keyboard shortcuts" value={"\u2318K"} onClick={()=>{}} last/>
        </SBlock>
        <SBlock title="Getting help">
          <SLine title="Ask offload about offload" meta="It answers in the composer, like anything else" onClick={()=>{}}/>
          <SLine title="Write to a person" meta="hello@offload.club" onClick={()=>{}} last/>
        </SBlock>
      </>
    );
  };
  return (
    <>
      <WPaneHead title={page.title} sub={page.group}
        tools={id==="comms"?[["bell","Test notification"]]:undefined}/>
      <WBody>{body()}</WBody>
    </>
  );
}

Object.assign(window,{WSettings,WSetting,S_PAGE});
