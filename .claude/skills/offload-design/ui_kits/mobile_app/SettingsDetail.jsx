const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { AppBar, IconButton, Icon, Button, Switch, Badge, SegmentedControl } = OFFLOAD_DS;

/* Every category page is built from the same four row types, so ten screens cost
   one vocabulary rather than ten layouts. */
function Group({label,children}){
  return (
    <>
      {label?<div style={{font:"var(--weight-medium) 12px/1 var(--font-core)",color:"var(--text-tertiary)",
        margin:"var(--space-5) 0 var(--space-3) 2px"}}>{label}</div>:null}
      <div style={{background:"var(--surface-fill)",borderRadius:"var(--radius-lg)",padding:"0 var(--space-4)"}}>
        {React.Children.map(children,(c,i)=>React.isValidElement(c)?React.cloneElement(c,{first:i===0}):c)}
      </div>
    </>
  );
}

function Row({title,note,value,control,onClick,first,last,danger,lead}){
  const [h,setH]=React.useState(false);
  const tappable=!!onClick;
  return (
    <div role={tappable?"button":undefined} tabIndex={tappable?0:undefined} onClick={onClick}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{display:"flex",alignItems:"center",gap:"var(--space-4)",cursor:tappable?"pointer":"default",
        padding:"var(--space-4) var(--space-4)",margin:"0 calc(-1 * var(--space-4))",
        borderRadius:(first?"var(--radius-lg) var(--radius-lg)":"0 0")+" "+(last?"var(--radius-lg) var(--radius-lg)":"0 0"),
        background:tappable&&h?"var(--state-hover)":"transparent",
        boxShadow:last?"none":"inset 0 -1px 0 var(--border-hairline)",transition:"background var(--transition-ui)"}}>
      {lead?<span style={{flex:"0 0 auto",display:"flex"}}>{lead}</span>:null}
      <span style={{flex:1,minWidth:140}}>
        <span style={{display:"block",font:"var(--weight-regular) 15px/1.35 var(--font-core)",
          color:danger?"var(--text-danger)":"var(--text-primary)"}}>{title}</span>
        {note?<span style={{display:"block",fontSize:"var(--size-caption)",lineHeight:1.4,color:"var(--text-secondary)",
          marginTop:3}}>{note}</span>:null}
      </span>
      {value?<span style={{flex:"0 0 auto",fontSize:"var(--size-body-sm)",color:"var(--text-secondary)"}}>{value}</span>:null}
      {control?<span style={{flex:"0 0 auto",display:"flex"}}>{control}</span>:null}
      {tappable&&!control?<span style={{flex:"0 0 auto",display:"flex",color:"var(--ink-300)"}}><Icon name="chevron-right" size={14}/></span>:null}
    </div>
  );
}

/* A switch row keeps its own state so the page reads as live, not as a picture. */
function Toggle({title,note,on,first,last}){
  const [v,setV]=React.useState(!!on);
  return <Row title={title} note={note} first={first} last={last} control={<Switch checked={v} onChange={setV} aria-label={title}/>}/>;
}

function Radio({on}){
  return <span aria-hidden="true" style={{width:20,height:20,flex:"0 0 auto",borderRadius:"var(--radius-pill)",
    border:(on?"6px":"1.5px")+" solid "+(on?"var(--blue-600)":"var(--ink-300)"),
    transition:"border var(--transition-ui)"}}/>;
}

/* A labelled row holding a SegmentedControl. ChoiceGroup, the radio list under
   it, still serves Language and region; it is Theme specifically that the
   5 September answer moved, on all surfaces. */
function ChoiceRow({label,options,value,onChange}){
  const [own,setOwn]=React.useState(value||options[0]);
  const v=onChange?value:own;
  const setV=onChange||setOwn;
  return (
    <div style={{padding:"var(--space-8) 0 var(--space-4)"}}>
      <div style={{font:"var(--text-label-role)",color:"var(--text-secondary)",textTransform:"uppercase",
        letterSpacing:"0.06em",padding:"0 var(--space-2) var(--space-4)"}}>{label}</div>
      <SegmentedControl options={options} value={v} onChange={setV} style={{display:"flex",width:"100%"}}/>
    </div>
  );
}
function ChoiceGroup({label,options,value,onChange}){
  const opts=options.map(o=>typeof o==="string"?{label:o}:o);
  const [own,setOwn]=React.useState(value||opts[0].label);
  const v=onChange?value:own;
  const setV=onChange||setOwn;
  return (
    <Group label={label}>
      {opts.map((o,i)=>(
        <Row key={o.label} title={o.label} note={o.note} last={i===opts.length-1}
          onClick={()=>setV(o.label)} control={<Radio on={v===o.label}/>}/>
      ))}
    </Group>
  );
}

/* Beside Row rather than an editing state inside it: every static row would
   otherwise carry a draft, an async save and an error it never uses. The field
   is the same one first run asks the name with. */
function EditableRow({title,value,first,last}){
  const [editing,setEditing]=React.useState(false);
  const [draft,setDraft]=React.useState(value);
  const ref=React.useRef(null);
  React.useEffect(()=>{if(editing&&ref.current)ref.current.focus();},[editing]);
  if(!editing) return <Row first={first} last={last} title={title} value={value} onClick={()=>{setDraft(value);setEditing(true);}}/>;
  return (
    <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",minHeight:"var(--row-height)",
      padding:"var(--space-4) var(--space-6)",background:"var(--surface-card)",
      borderTopLeftRadius:first?"var(--radius-card)":0,borderTopRightRadius:first?"var(--radius-card)":0,
      borderBottomLeftRadius:last?"var(--radius-card)":0,borderBottomRightRadius:last?"var(--radius-card)":0}}>
      <input ref={ref} value={draft} onChange={(e)=>setDraft(e.target.value)}
        onKeyDown={(e)=>{if(e.key==="Enter")setEditing(false);if(e.key==="Escape"){setDraft(value);setEditing(false);}}}
        aria-label={title}
        style={{flex:1,minWidth:0,height:40,padding:"0 var(--space-5)",boxSizing:"border-box",
          borderRadius:"var(--radius-sm)",background:"var(--surface-input)",
          /* Ink, not --border-focus: every field in the product focuses ink and
             one blue field would be the odd one out. The token decision is open. */
          border:"1px solid var(--ink-950)",boxShadow:"var(--shadow-focus)",
          font:"var(--text-body-role)",color:"var(--text-primary)",outline:"none"}}/>
      <Button variant="primary" size="sm" onClick={()=>setEditing(false)}>Save</Button>
    </div>
  );
}
function PersonRow({name,detail,badge,first,last}){
  const initials=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <Row first={first} last={last} onClick={()=>{}} title={name} note={detail} value={badge}
      lead={<span style={{width:32,height:32,borderRadius:"var(--radius-pill)",background:"var(--paper)",
        display:"flex",alignItems:"center",justifyContent:"center",font:"var(--weight-medium) 12px/1 var(--font-core)",
        color:"var(--text-secondary)"}}>{initials}</span>}/>
  );
}

const PAGES={
  account:{title:"My account",render:()=>(<>
    {/* No Phone and no Password: this product is OAuth-only, so both would be
        controls that do nothing. No Plan group either, because there are no
        plans and inventing a tier on a settings screen is a product claim
        nobody has made. Name edits in place rather than pushing a screen. */}
    <Group label="Details">
      <EditableRow title="Name" value="Jo Martins"/>
      <Row title="Email" value="jo@hey.com" last/>
    </Group>
    <Group label="Ending things">
      <Row title="Shared threads" note="A shared thread belongs to everyone in it. Deleting your account removes your private things and your access, and leaves what you added in a shared thread with the others."/>
      <Row title="Sign out" onClick={()=>{}}/>
      <Row title="Delete account" note="Everything offload knows goes with it. This can't be undone." danger onClick={()=>{}} last/>
    </Group>
  </>)},
  people:{title:"My people",render:()=>(<>
    <Group label="Sharing with you">
      <PersonRow name="Ana Duarte" detail="Lisbon trip, Berlin in October" badge="2"/>
      <PersonRow name="Tom Reilly" detail="Lisbon trip"/>
      <PersonRow name="Sam Ibekwe" detail="Flat admin" last/>
    </Group>
    <Group label="Invites">
      <Row title="Priya Raman" note="Invited on 4 Aug, not accepted" value="Resend" onClick={()=>{}} last/>
    </Group>
    <Group label="Defaults">
      <Toggle title="Let people add to my threads" note="They can add, never delete." on/>
      <Toggle title="Tell me when someone opens a shared thread"/>
      <Row title="Blocked" value="None" onClick={()=>{}} last/>
    </Group>
  </>)},
  privacy:{title:"Privacy",render:()=>(<>
    <ChoiceGroup label="When you share a thread, people see" value="Only what you pick"
      options={[{label:"Everything in it",note:"Notes, files and dates"},{label:"Only what you pick",note:"You choose each time"}]}/>
    <Group label="What others see">
      <Toggle title="Show when you were last in" last/>
    </Group>
    <Group label="What offload does with it">
      <Toggle title="Let offload notice patterns" note="Like Fridays slipping, or a bill that arrives every March." on/>
      <Toggle title="Improve offload with my data" note="Off by default. Nothing you dump is used to train anything." />
      <Toggle title="Analytics" note="Crash reports and counts, never content." on last/>
    </Group>
    <Group label="Elsewhere">
      <Row title="Privacy policy" onClick={()=>{}}/>
      <Row title="Download everything offload has" onClick={()=>{}} last/>
    </Group>
  </>)},
  comms:{title:"Communication",render:()=>(<>
    <Group label="What reaches you">
      <Toggle title="Something needs an answer" note="Ana asked about dates, a bill is due." on/>
      <Toggle title="Someone added to a shared thread" on/>
      <Toggle title="What offload noticed" note="The quiet nudges on Today." on/>
      <Toggle title="Nothing is happening" note="A weekly note if a thing has gone still." last/>
    </Group>
    <Group label="When">
      <Toggle title="Quiet hours" note="Nothing reaches you between 22:00 and 07:00." on/>
      <Row title="From" value="22:00" onClick={()=>{}}/>
      <Row title="Until" value="07:00" onClick={()=>{}} last/>
    </Group>
    <Group label="Where">
      <Toggle title="Push" on/>
      <Toggle title="Email" note="jo@hey.com" last/>
    </Group>
    <ChoiceGroup label="Weekly summary" options={["Off","Sunday evening","Monday morning"]} value="Off"/>
  </>)},
  apps:{title:"Connected apps",render:()=>(<>
    <Group label="Connected">
      <Row title="Calendar" note="Google, jo@hey.com" value="On" onClick={()=>{}}/>
      <Row title="Photos" note="Screenshots become things you can search" value="On" onClick={()=>{}} last/>
    </Group>
    <Group label="Not connected">
      <Row title="Mail" note="So a confirmation files itself" value="Connect" onClick={()=>{}}/>
      <Row title="Browser" note="Save a page straight into a thing" value="Connect" onClick={()=>{}} last/>
    </Group>
    <Group label="How offload uses them">
      <Row title="Read only" note="offload never sends mail, moves events, or deletes photos." last/>
    </Group>
  </>)},
  memory:{title:"Memory and data",render:()=>(<>
    <Group label="What offload keeps">
      <Row title="Memories" value="34" onClick={()=>{}}/>
      <Row title="Things" value="11" onClick={()=>{}}/>
      <Row title="Files and photos" value="128 MB" onClick={()=>{}} last/>
    </Group>
    <Group label="Learning">
      <Toggle title="Remember what I tell it" note="Turning this off keeps the app working, but it will stop learning you." on/>
      <Toggle title="Learn from things I archive" last/>
    </Group>
    <Group label="Getting it out">
      <Row title="Export everything" note="A single file, readable without offload." onClick={()=>{}}/>
      <Row title="Forget everything" note="Memories, things and conversations. The account stays." danger onClick={()=>{}} last/>
    </Group>
  </>)},
  retention:{title:"Conversations kept",render:()=>(<>
    <Group>
      <Row title="offload keeps conversations for 60 days" note="Anything you asked it to remember becomes a memory and is kept until you delete it. The rest goes." last/>
    </Group>
    <ChoiceGroup label="Keep conversations for" options={["30 days","60 days","1 year","Forever"]} value="60 days"/>
    <Group label="Now">
      <Row title="Conversations kept" value="31"/>
      <Row title="Oldest" value="14 Jun"/>
      <Row title="Delete all conversations" note="Memories aren't affected." danger onClick={()=>{}} last/>
    </Group>
  </>)},
  appearance:{title:"Appearance",render:(ctx)=>{
    const sun=window.OffloadSun&&window.OffloadSun.sunsetTime(new Date());
    const sunsetNote=sun?"Sunset today is "+sun.toTimeString().slice(0,5)+".":null;
    return (<>
    {/* SegmentedControl, not the radio list this kit used to draw, and three
        values: system is what an unset preference already did without a name.
        A new account still opens in light, because offering system as a choice
        and defaulting to it are different things. */}
    <ChoiceRow label="Theme" options={["Light","Dark","System"]} value={ctx.theme} onChange={ctx.setTheme}/>
    {/* No text size on the phones. Mobile type is numeric fontSize literals
        with no size variables in the generated stylesheet, so offering the
        choice here is a generator change rather than a screen. Web has it. */}
    <Group label="Today">
      <Toggle title="Switch to Tonight after sunset" note={sunsetNote} on/>
      <Toggle title="Show the forecast line" on/>
      <Toggle title="Show the day agenda" on last/>
    </Group>
  </>);}},
  language:{title:"Language and region",render:()=>(<>
    <Group>
      <Row title="Language" value="English (UK)" onClick={()=>{}}/>
      <Row title="Region" value="Portugal" onClick={()=>{}} last/>
    </Group>
    <ChoiceGroup label="Units" options={["Metric","Imperial"]} value="Metric"/>
    <ChoiceGroup label="Week starts" options={["Monday","Sunday"]} value="Monday"/>
    <ChoiceGroup label="Time" options={["24 hour","12 hour"]} value="24 hour"/>
  </>)},
  help:{title:"Help and about",render:()=>(<>
    <Group>
      <Row title="How offload works" onClick={()=>{}}/>
      <Row title="Ask for help" note="A real person, usually within a day." onClick={()=>{}}/>
      <Row title="Report something wrong" onClick={()=>{}} last/>
    </Group>
    <Group label="About">
      <Row title="Version" value="2.1.0 (418)"/>
      <Row title="Terms" onClick={()=>{}}/>
      <Row title="Privacy policy" onClick={()=>{}}/>
      <Row title="Licences" onClick={()=>{}} last/>
    </Group>
  </>)}
};

function SettingsDetail({page,onBack,theme,setTheme}){
  const p=PAGES[page];
  if(!p)return null;
  return (
    <>
      <AppBar border={false} left={<IconButton icon="chevron-left" label="Back" onClick={onBack}/>} title={p.title}/>
      <div style={{flex:1,overflowY:"auto",padding:"var(--space-6) var(--gutter-screen) var(--space-9)"}}>{p.render({theme,setTheme})}</div>
    </>
  );
}

Object.assign(window,{SettingsDetail,SETTINGS_PAGES:PAGES});
