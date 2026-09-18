const { Icon, IconButton, Badge, Button, Chip, Logo, EmptyState, AnswerResult, QuickReplies, TurnFooter } = OFFLOAD_DS;

const REF_TONE={thread:"accent",time:"attention",money:"warning",source:"outline"};
const REF_ICON={thread:"lasso",time:"clock",money:null,source:"link"};

/* Note 3: the sidebar marks whatever the rightmost pane is showing, and when that pane
   has no entry of its own it marks the thread it belongs to.
   The nav is a dark-themed region whatever the app theme is: data-theme="dark" on the
   column, so every token inside it resolves dark and nothing has to be hand-coloured. */
function WSidebar({active,onTab,onOpen,onSettings,unread,dead={}}){
  const tabs=[["sun","Today","today"],["lasso","My threads","things"],["cloudy","Memories","memories"]];
  const alive=D.spaces.filter(s=>!dead[s.id]);
  const counts={things:String(alive.length),memories:String(D.memories.total)};
  const pinned=alive.filter(s=>s.kind==="now").slice(0,3);
  const recent=alive.filter(s=>!pinned.some(p=>p.id===s.id)).slice(3,6);
  const item=(s)=>{
    const on=active&&active.kind==="thread"&&active.id===s.id;
    return (
      <button key={s.id} type="button" data-on={on?"1":"0"} onClick={()=>onOpen({kind:"thread",id:s.id})}
        style={rowStyle(on)}>
        {on?<span style={{width:3,height:16,borderRadius:99,background:"var(--blue-600)",flex:"0 0 auto",margin:"0 -4px 0 -7px",animation:"w-mark 220ms var(--ease-out) both"}}/>:null}
        <Icon name={s.icon} size={17}/>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
      </button>
    );
  };
  return (
    <div data-theme="dark" style={{width:SIDE_W,flex:"0 0 auto",display:"flex",flexDirection:"column",paddingBottom:"var(--space-5)",
      background:"var(--surface-page)",color:"var(--text-primary)"}}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"var(--space-5) var(--space-6) var(--space-6)"}}>
        <Logo size={21}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,padding:"0 var(--space-4)"}}>
        {tabs.map(([i,l,k])=>{
          const on=active&&active.kind===k;
          return (
            <button key={k} type="button" data-on={on?"1":"0"} onClick={()=>onTab(k)} style={rowStyle(on)}>
              {on?<span style={{width:3,height:16,borderRadius:99,background:"var(--blue-600)",flex:"0 0 auto",margin:"0 -4px 0 -7px",animation:"w-mark 220ms var(--ease-out) both"}}/>:null}
              <Icon name={i} size={17}/><span>{l}</span>
              {counts[k]?<em style={{marginLeft:"auto",fontStyle:"normal",fontSize:12.5,color:"var(--text-tertiary)",
                fontVariantNumeric:"tabular-nums"}}>{counts[k]}</em>:null}
            </button>
          );
        })}
      </div>
      <SideLabel add>Pinned</SideLabel>
      <div style={{display:"flex",flexDirection:"column",gap:2,padding:"0 var(--space-4)"}}>{pinned.map(item)}</div>
      <SideLabel>Recent</SideLabel>
      <div style={{display:"flex",flexDirection:"column",gap:2,padding:"0 var(--space-4)"}}>{recent.map(item)}</div>
      <div style={{marginTop:"auto",padding:"0 var(--space-4)",display:"flex",flexDirection:"column",gap:2}}>
        <button type="button" style={rowStyle(false)}>
          <Icon name="bell" size={17}/><span>Activity</span>
          {unread?<em style={{marginLeft:"auto",fontStyle:"normal",fontSize:12.5,color:"var(--text-tertiary)",
            fontVariantNumeric:"tabular-nums"}}>{unread}</em>:null}
        </button>
        <button type="button" onClick={onSettings} style={rowStyle(active&&active.kind==="settings")}>
          {active&&active.kind==="settings"?<span style={{width:3,height:16,borderRadius:99,background:"var(--blue-600)",flex:"0 0 auto",margin:"0 -4px 0 -7px",animation:"w-mark 220ms var(--ease-out) both"}}/>:null}
          <Icon name="settings" size={17}/><span>Settings</span>
        </button>
      </div>
    </div>
  );
}
function rowStyle(on){
  return {display:"flex",alignItems:"center",gap:11,height:38,padding:"0 var(--space-4)",minWidth:0,
    borderRadius:"var(--radius-sm)",border:"none",cursor:"pointer",textAlign:"left",
    font:"var(--weight-medium) 14.5px/1 var(--font-core)",
    background:on?"var(--blue-50)":"transparent",color:on?"var(--text-on-solid)":"var(--text-secondary)",
    transition:"background var(--transition-ui)"};
}
function SideLabel({children,add}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:7,padding:"var(--space-6) var(--space-6) var(--space-3)",
      font:"var(--weight-medium) 11.5px/1 var(--font-core)",color:"var(--text-tertiary)"}}>
      {children}{add?<Icon name="plus" size={12} style={{marginLeft:"auto",color:"var(--ink-300)"}}/>:null}
    </div>
  );
}

/* One composer, under both panes, spanning the window. It never belongs to a pane. Asking
   something does not open a window: the composer itself grows upward and the answer
   arrives inside it, above the same input you typed in. The card is only as wide as the
   input, and a blue top edge with a little bleed lifts it off a white pane. */
function WComposer({value,onChange,onSubmit,placeholder,live,turns,writing,onClose,onExpand,onOpenThread,onTick,onPick}){
  const ref=React.useRef(null);
  /* "@" opens the connection picker, here and in any other field. */
  const at=/(?:^|\s)@([\w]*)$/.exec(value||"");
  const pickMention=(p)=>onChange((value||"").replace(/@[\w]*$/,"@"+p.name.split(" ")[0]+" "));
  return (
    <div style={{flex:"0 0 auto",padding:"var(--space-4) var(--space-8) var(--space-6)"}}>
      <div style={{maxWidth:940,margin:"0 auto",display:"flex",flexDirection:"column",minHeight:0,
        background:"var(--surface-raised)",borderRadius:33,padding:"calc(var(--space-3) + 5px)",
        border:"1.5px solid var(--blue-500)",
        boxShadow:"inset 0 10px 26px -14px rgba(74,104,222,0.28),inset 0 0 16px -6px rgba(74,104,222,0.15),var(--shadow-2)"}}>
        {live?(
          <div style={{display:"flex",flexDirection:"column",minHeight:0,maxHeight:420,
            animation:"w-grow var(--duration-slow) var(--ease-out) both"}}>
            <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",flex:"0 0 auto",
              padding:"var(--space-3) var(--space-3) var(--space-4) var(--space-5)"}}>
              <Icon name="sparkles" size={15} style={{color:"var(--text-accent)",flex:"0 0 auto"}}/>
              <b style={{flex:1,minWidth:0,font:"var(--weight-medium) 14px/1.3 var(--font-core)",color:"var(--text-secondary)",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{live}</b>
              <IconButton icon="maximize-2" label="Open full" size="sm" variant="quiet" onClick={onExpand}/>
              <IconButton icon="x" label="Close" size="sm" variant="quiet" onClick={onClose}/>
            </div>
            <WTurns turns={turns} writing={writing} onOpenThread={onOpenThread} onTick={onTick} onPick={onPick}/>
            <span style={{flex:"0 0 auto",height:1,background:"var(--border-hairline)",
              margin:"var(--space-4) var(--space-4) var(--space-3)"}}/>
          </div>
        ):null}
        {at&&window.WMentions?<WMentions query={at[1]} onPick={pickMention}/>:null}
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-3)",minHeight:50,flex:"0 0 auto",
          borderRadius:25,padding:"0 var(--space-3) 0 var(--space-6)",background:"var(--surface-input)"}}>
          <input ref={ref} value={value} onChange={(e)=>onChange(e.target.value)}
            onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();onSubmit();}}}
            placeholder={placeholder||"Dump anything"}
            style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",
              font:"var(--text-body-role)",letterSpacing:"var(--tracking-body)",color:"var(--text-primary)"}}/>
          <IconButton icon="camera" label="Photo" size="sm" variant="quiet"/>
          <IconButton icon="mic" label="Voice note" size="sm" variant="quiet"/>
          <IconButton icon="arrow-up" label="Send" size="sm" variant={value?"primary":"quiet"}
            tone={value?"attention":undefined} onClick={onSubmit}/>
        </div>
      </div>
    </div>
  );
}

/* The turns themselves, the same rows in the composer and in a full pane. */
function WTurns({turns,writing,onOpenThread,onTick,onPick}){
  const end=React.useRef(null);
  const [ticked,setTicked]=React.useState({});
  const [answered,setAnswered]=React.useState({});
  React.useEffect(()=>{const el=end.current&&end.current.parentElement;if(el)el.scrollTop=el.scrollHeight;},[turns.length,writing]);
  return (
    <div style={{flex:1,minHeight:0,overflowY:"auto",display:"flex",flexDirection:"column",gap:"var(--space-6)",
      padding:"var(--space-3) var(--space-6)"}}>
      {turns.map((t,i)=>t.from==="you"?(
        <React.Fragment key={i}>
        <div style={{alignSelf:"flex-end",maxWidth:"78%",
          padding:"var(--space-3) var(--space-5)",borderRadius:"18px 18px 5px 18px",
          background:"var(--blue-50)",border:"1px solid var(--blue-100)",
          font:"var(--weight-regular) 15px/1.45 var(--font-core)"}}>
          {t.text}
        </div>
        {/* The mark was absolutely positioned into this bubble's corner and is now a row
            of its own on offload's side, which is the only place it can hold a chip. */}
        {TurnFooter?<TurnFooter state={t.status} refs={t.refs} sources={t.sources}
          onOpenRef={(r)=>onOpenThread&&onOpenThread(r.id)}/>:null}
        </React.Fragment>
      ):(
        <React.Fragment key={i}>
        <div style={{alignSelf:"flex-start",maxWidth:"92%",padding:"var(--space-4) var(--space-5)",
          borderRadius:"18px 18px 18px 5px",background:"var(--ink-50)"}}>
          <div style={{font:"var(--text-quiet-role)",fontSize:15,lineHeight:1.5}}>{t.text}</div>
          {/* The question offload asked, answerable with a tap. Inside the bubble, where
              012's control sits, because it acts on the sentence above it. */}
          {AnswerResult&&t.options&&t.options.length&&!answered[i]?(
            <QuickReplies options={t.options} note={t.note} label={t.text}
              onPick={(o)=>{setAnswered(a=>({...a,[i]:true}));onPick&&onPick(o)}}/>
          ):null}
        </div>
        {/* Below the bubble, never inside it. Eight rows before Show more here: the pane
            has roughly twice the height a phone sheet does. */}
        {(AnswerResult?(t.results||[]):[]).map((r,j)=>(
          <AnswerResult key={j} thread={r.thread} count={r.count} shown={8}
            truncated={r.truncated} threadTotal={r.threadTotal} style={{alignSelf:"stretch",maxWidth:"92%"}}
            rows={(r.rows||[]).map(x=>({...x,done:ticked[x.id]!==undefined?ticked[x.id]:x.done}))}
            onToggle={r.tickable===false?undefined:(row)=>{const next=!(ticked[row.id]!==undefined?ticked[row.id]:row.done);
              setTicked(v=>({...v,[row.id]:next}));onTick&&onTick(row,next)}}
            onOpenThread={()=>onOpenThread&&onOpenThread(r.thread.id)}/>
        ))}
        {TurnFooter?<TurnFooter state={t.results?null:t.status}
          refs={t.results?[]:t.refs} sources={t.sources}
          onOpenRef={(r)=>onOpenThread&&onOpenThread(r.id)}/>:null}
        </React.Fragment>
      ))}
      {writing?(
        <div aria-label="offload is writing" style={{alignSelf:"flex-start",display:"flex",gap:5,
          padding:"var(--space-4) var(--space-5)",borderRadius:"18px 18px 18px 5px",background:"var(--ink-50)"}}>
          {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:99,background:"var(--ink-300)",
            animation:"w-pulse 1.2s var(--ease-in-out) infinite",animationDelay:(i*0.16)+"s"}}/>)}
        </div>
      ):null}
      <div ref={end}/>
    </div>
  );
}

/* A conversation as a full pane, the same turns with room to read them. */
function WConversation({item,turns,writing,onOpenThread,onTick,onPick}){
  return (
    <>
      <WPaneHead title={item.title} sub={item.when}
        tools={[["users","Share"],["ellipsis","More"]]}/>
      <WTurns turns={turns} writing={writing} onOpenThread={onOpenThread} onTick={onTick} onPick={onPick}/>
    </>
  );
}

function WPerson({name,open}){
  const p=D.people[name]||Object.values(D.people)[0];
  return (
    <>
      <WPaneHead title={p.name} sub={p.meta} tools={[["maximize-2","Open full"],["message-circle","Message"],["ellipsis","More"]]}/>
      <WBody>
        <WSection count={p.pending.length}>Between you</WSection>
        {p.pending.map((x,i)=>(
          <WRow key={x.id} icon={x.who.indexOf("you")>-1?"clock":"users"}
            tone={x.who.indexOf("on you")>-1?"attention":"neutral"}
            title={x.title} meta={x.thread+" \u00b7 "+x.who} last={i===p.pending.length-1}
            trailing={x.due?<Badge tone="attention" variant="solid">{x.due}</Badge>:null}
            onClick={()=>open({kind:"task",id:x.id,thread:x.thread,label:x.title,meta:x.who})}/>
        ))}
        <WSection count={p.shared.length} tone="accent">Things you share</WSection>
        {p.shared.map((s,i)=>(
          <WRow key={s.id} icon="lasso" title={s.name} meta={s.meta} last={i===p.shared.length-1}
            onClick={()=>open({kind:"thread",id:s.id})}/>
        ))}
        <WSection>What offload knows</WSection>
        <div style={{display:"flex",flexWrap:"wrap",gap:"var(--space-3)",padding:"var(--space-3) 0"}}>
          {memoryList().filter(m=>m.person===name).map(m=>(
            <Chip key={m.key} tone="outline" onClick={()=>open({kind:"memory",id:m.key})}>{m.label}</Chip>
          ))}
        </div>
      </WBody>
    </>
  );
}

/* Nothing in yet: one invitation, three examples, no dashboard of zeros. */
function WFirstRun({onExample}){
  const examples=["Book the Alfama flat for the 14th","Ana can only travel the 14th to the 17th","Oak brackets, 30cm, matte black"];
  return (
    <>
      <WPaneHead big title="Today" sub="Nothing in here yet"/>
      <WBody>
        <div style={{maxWidth:"52ch",padding:"var(--space-8) 0 0"}}>
          <div style={{font:"var(--text-quiet-role)",fontSize:19,lineHeight:1.45}}>
            Dump the first thing and offload will sort it. You do not need to pick a place for it, or name it, or come back and tidy it up.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"var(--space-3)",marginTop:"var(--space-7)"}}>
            {examples.map(e=>(
              <button key={e} type="button" onClick={()=>onExample(e)}
                style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-4) var(--space-5)",
                  borderRadius:"var(--radius-md)",cursor:"pointer",textAlign:"left",
                  background:"var(--surface-raised)",border:"1px dashed var(--border-strong)",
                  font:"var(--weight-regular) 15px/1.4 var(--font-core)",color:"var(--text-secondary)"}}>
                <Icon name="arrow-up" size={14} style={{color:"var(--text-accent)"}}/>{e}
              </button>
            ))}
          </div>
        </div>
      </WBody>
    </>
  );
}

/* The launcher is the one thing that blocks: it is modal by nature. */
function WPalette({onClose,open,onTab,dead={}}){
  const [q,setQ]=React.useState("");
  const jump=[...D.spaces.filter(s=>!dead[s.id]).slice(0,3).map(s=>({icon:s.icon,label:s.name,hint:"thread",go:()=>open({kind:"thread",id:s.id})})),
    ...memoryList().slice(0,2).map(m=>({icon:"cloudy",label:m.label,hint:"memory",go:()=>open({kind:"memory",id:m.key})}))];
  const dos=[{icon:"plus",label:"New thread",key:""},{icon:"archive",label:"Archive what is selected",key:"\u2318\u232B"},
    {icon:"cloudy",label:"Go to Memories",key:"",go:()=>onTab("memories")},{icon:"settings",label:"Settings",key:"\u2318,"}];
  const f=(list)=>q?list.filter(x=>x.label.toLowerCase().indexOf(q.toLowerCase())>-1):list;
  return (
    <>
      <div onClick={onClose} style={{position:"absolute",inset:0,zIndex:30,background:"var(--surface-scrim)"}}/>
      <div style={{position:"absolute",left:"50%",top:104,transform:"translateX(-50%)",width:660,zIndex:31,
        background:"var(--surface-raised)",border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-lg)",
        boxShadow:"var(--shadow-3)",overflow:"hidden",animation:"w-rise var(--duration-base) var(--ease-out)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)",padding:"var(--space-5) var(--space-6)",
          boxShadow:"inset 0 -1px 0 var(--border-hairline)"}}>
          <Icon name="search" size={17} style={{color:"var(--text-tertiary)"}}/>
          <input autoFocus value={q} onChange={(e)=>setQ(e.target.value)}
            onKeyDown={(e)=>{if(e.key==="Escape")onClose()}}
            placeholder="Type a command, or ask offload something"
            style={{flex:1,border:"none",outline:"none",background:"transparent",fontSize:16,
              font:"var(--text-body-role)",color:"var(--text-primary)"}}/>
        </div>
        <div style={{maxHeight:380,overflowY:"auto",padding:"0 0 var(--space-3)"}}>
          {[["Jump to",f(jump)],["Do",f(dos)]].map(([label,rows])=>rows.length?(
            <React.Fragment key={label}>
              <div style={{font:"var(--weight-medium) 11px/1 var(--font-core)",color:"var(--text-tertiary)",
                padding:"var(--space-4) var(--space-6) var(--space-2)"}}>{label}</div>
              {rows.map((r,i)=>(
                <button key={r.label} type="button" onClick={()=>{r.go&&r.go();onClose();}}
                  style={{display:"flex",alignItems:"center",gap:"var(--space-4)",width:"100%",border:"none",
                    padding:"var(--space-3) var(--space-6)",cursor:"pointer",textAlign:"left",fontSize:14.5,
                    background:label==="Jump to"&&i===0?"var(--surface-fill)":"transparent",color:"var(--text-primary)"}}>
                  <Icon name={r.icon} size={16} style={{color:"var(--text-secondary)",flex:"0 0 auto"}}/>
                  <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</span>
                  {r.hint?<em style={{fontStyle:"normal",fontSize:11.5,color:"var(--text-tertiary)"}}>{r.hint}</em>:null}
                  {r.key?<em style={{fontStyle:"normal",fontSize:11.5,color:"var(--text-tertiary)",
                    border:"1px solid var(--border-hairline)",borderRadius:5,padding:"4px 5px"}}>{r.key}</em>:null}
                </button>
              ))}
            </React.Fragment>
          ):null)}
        </div>
      </div>
    </>
  );
}

Object.assign(window,{WSidebar,WComposer,WTurns,WConversation,WPerson,WFirstRun,WPalette,REF_TONE,REF_ICON});
