const OFFLOAD_DS_O=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Button:OButton } = OFFLOAD_DS_O;

/* Health, where an owner opens. Services, the queue, scheduled jobs, what is stuck. */
function HealthPage({say}){
  const H=AD.health;
  const [stuck,setStuck]=React.useState(H.stuck);
  const sCols=[{label:"Service"},{label:"State",w:90},{label:"Uptime, 30 days",w:140,right:true}];
  const jCols=[{label:"Job"},{label:"Account",w:160},{label:"Since",w:100},{label:"State",w:90},{label:"",w:180,right:true}];
  const kCols=[{label:"Scheduled"},{label:"When",w:160},{label:"Last run",w:100}];
  return (
    <>
      <APaneHead title="Health" sub="As of 20:45" tools={<OButton variant="ghost" size="sm">Refresh</OButton>}/>
      <ABody>
        <AStats>
          <AStat label="Waiting in the queue" value={H.queue.waiting}/>
          <AStat label="Running" value={H.queue.running}/>
          <AStat label="Oldest waiting" value={H.queue.oldest}/>
          <AStat label="Stuck or dead" value={stuck.length} tone={stuck.length?"attention":undefined}/>
        </AStats>
        <ASection>Services</ASection>
        <ATable cols={sCols}>{H.services.map(([n,s,u],i)=><ARow key={n} cols={sCols} last={i===H.services.length-1}
          cells={[<span style={{fontWeight:500}}>{n}</span>,<AStatus value={s}/>,<AMono>{u}</AMono>]}/>)}</ATable>
        <ASection note="retry puts it back on the queue">Stuck and dead</ASection>
        {stuck.length?<ATable cols={jCols}>{stuck.map((j,i)=><ARow key={j.id} cols={jCols} last={i===stuck.length-1}
          cells={[<span style={{fontWeight:500}}>{j.kind}</span>,<AQuiet>{j.who}</AQuiet>,<AQuiet>{j.since}</AQuiet>,<AStatus value={j.state}/>,
            <span style={{display:"flex",gap:"var(--space-2)",justifyContent:"flex-end"}}>
              <OButton variant="secondary" size="sm" onClick={()=>{setStuck(v=>v.filter(x=>x.id!==j.id));say("Back on the queue")}}>Retry</OButton>
              <OButton variant="ghost" size="sm" onClick={()=>{setStuck(v=>v.filter(x=>x.id!==j.id));say("Dismissed")}}>Dismiss</OButton></span>]}/>)}</ATable>
          :<AQuiet>Nothing stuck.</AQuiet>}
        <ASection>Scheduled jobs</ASection>
        <ATable cols={kCols}>{H.scheduled.map(([n,w,s],i)=><ARow key={n} cols={kCols} last={i===H.scheduled.length-1} href={()=>{}}
          cells={[<span style={{fontWeight:500}}>{n}</span>,<AQuiet>{w}</AQuiet>,<AStatus value={s}/>]}/>)}</ATable>
      </ABody>
    </>
  );
}

/* Costs. Trends, usage, by feature, by model, and by vendor against the bill. */
function CostsPage(){
  const C=AD.costs;
  const [range,setRange]=React.useState("30 days");
  const pace=C.spend/25*31;
  const label=(i)=>(i+4)+(i+4>30?" Oct":" Sep");
  const fCols=[{label:"What it pays for"},{label:"Calls",w:90,right:true},{label:"Spend",w:100,right:true},{label:"Share",w:180}];
  const mCols=[{label:"Model"},{label:"Calls",w:90,right:true},{label:"Tokens",w:100,right:true},{label:"Spend",w:100,right:true}];
  const vCols=[{label:"Vendor"},{label:"Metered",w:110,right:true},{label:"Billed",w:110,right:true},{label:"",w:90}];
  const max=Math.max(...C.byFeature.map(j=>j.spend));
  return (
    <>
      <APaneHead title="Costs" sub={C.range} tools={<><ARange value={range} onChange={setRange}/><OButton variant="secondary" size="sm">Export CSV</OButton></>}/>
      <ABody>
        <AStats>
          <AStat label="Spent this month" value={money0(C.spend)} note={"budget "+money0(C.budget)}/>
          <AStat label="On pace for" value={money0(pace)} tone={pace>C.budget?"attention":undefined} note={pace>C.budget?"over budget":"inside budget"}/>
          <AStat label="Per account" value={money(C.perUserAvg)}/>
          <AStat label="Last month" value={money0(C.lastMonth)}/>
        </AStats>
        <APlots>
          <APlot title="Cost per day" points={C.days} labels={["4 Sep","3 Oct",label]} format={money} caption="Dollars"/>
          <APlot title="Turns per day, thousands" points={C.usage} labels={["4 Sep","3 Oct",label]} caption="Thousands of turns" kind="line"/>
        </APlots>
        <ASection>By feature</ASection>
        <ATable cols={fCols}>{C.byFeature.map((j,i)=><ARow key={j.name} cols={fCols} last={i===C.byFeature.length-1}
          cells={[<span style={{fontWeight:500}}>{j.name}</span>,<AQuiet>{j.calls}</AQuiet>,<AMono bold>{money0(j.spend)}</AMono>,
            <span style={{display:"block",paddingRight:12}}><ABar value={j.spend} total={max}/></span>]}/>)}</ATable>
        <ASection>By model</ASection>
        <ATable cols={mCols}>{C.byModel.map((m,i)=><ARow key={m.name} cols={mCols} last={i===C.byModel.length-1}
          cells={[<span style={{fontWeight:500}}>{m.name}</span>,<AQuiet>{m.calls}</AQuiet>,<AQuiet>{m.tokens}</AQuiet>,<AMono bold>{money(m.spend)}</AMono>]}/>)}</ATable>
        <ASection note="what the ledger metered beside what the vendor billed, or what an owner typed">By vendor</ASection>
        <ATable cols={vCols}>{C.byVendor.map((v,i)=><ARow key={v.name} cols={vCols} last={i===C.byVendor.length-1}
          cells={[<span style={{fontWeight:500}}>{v.name}</span>,v.metered==null?<AQuiet>not metered</AQuiet>:<AMono>{money(v.metered)}</AMono>,
            <AMono bold>{money(v.billed)}</AMono>,<AStatus value={v.how}/>]}/>)}</ATable>
      </ABody>
    </>
  );
}

/* Limits, in groups. Save opens the confirm with each change old to new; the other button is Cancel. */
function LimitsPage({say}){
  const L=AD.limits;
  const init=()=>({person:L.person.map(r=>r[1]),platform:L.platform.map(r=>r[1]),month:L.month.map(r=>r[1]),batch:L.batch,sw:L.switches.map(r=>r[1])});
  const [v,setV]=React.useState(init);
  const [saved,setSaved]=React.useState(init);
  const [ask,setAsk]=React.useState(false);
  const fmt=(x,aff)=>aff==="$"?"$"+x:aff?x+" "+aff:x;
  const diff=[];
  L.person.forEach((r,i)=>{if(v.person[i]!==saved.person[i])diff.push([r[0]+", per 24 hours",fmt(saved.person[i],r[2]),fmt(v.person[i],r[2])])});
  L.platform.forEach((r,i)=>{if(v.platform[i]!==saved.platform[i])diff.push([r[0]+", per 24 hours",fmt(saved.platform[i],r[2]),fmt(v.platform[i],r[2])])});
  L.month.forEach((r,i)=>{if(v.month[i]!==saved.month[i])diff.push([r[0],fmt(saved.month[i],r[2]),fmt(v.month[i],r[2])])});
  if(v.batch!==saved.batch)diff.push(["Weekly batch",saved.batch,v.batch]);
  L.switches.forEach((r,i)=>{if(v.sw[i]!==saved.sw[i])diff.push([r[0],saved.sw[i]?"on":"off",v.sw[i]?"on":"off"])});
  const set=(k,i)=>(x)=>setV(s=>{const n={...s};if(i==null)n[k]=x;else{n[k]=s[k].slice();n[k][i]=x}return n});
  const fields=(rows,k)=><div style={{display:"flex",gap:"var(--space-6)",flexWrap:"wrap"}}>{rows.map((r,i)=>
    <AField key={r[0]} label={r[0]} value={v[k][i]} onChange={set(k,i)} prefix={r[2]==="$"?"$":null} suffix={r[2]&&r[2]!=="$"?r[2]:null}/>)}</div>;
  const box=(c)=><div style={{border:"1px solid var(--border-hairline)",borderRadius:"var(--radius-md)",background:"var(--surface-raised)",padding:"var(--space-6)"}}>{c}</div>;
  return (
    <>
      <APaneHead title="Limits" sub="A cap refuses the next turn. What was already dumped is safe."
        tools={diff.length?<><OButton variant="ghost" size="sm" onClick={()=>setV(saved)}>Cancel</OButton>
          <OButton variant="primary" size="sm" onClick={()=>setAsk(true)}>Save changes</OButton></>:<AQuiet><span style={{fontSize:12.5}}>Saved</span></AQuiet>}/>
      <ABody>
        <ASection note="any 24 hours, rolling">Per person</ASection>{box(fields(L.person,"person"))}
        <ASection note="any 24 hours, rolling; refuses everyone">The platform</ASection>{box(fields(L.platform,"platform"))}
        <ASection note="what Costs draws against, and what each subscription costs">The month</ASection>{box(fields(L.month,"month"))}
        <ASection>The waitlist</ASection>{box(<AField label="Weekly batch" value={v.batch} onChange={set("batch")}/>)}
        <ASection note="off stops a path for everyone within seconds">Switches</ASection>
        <ACard>{L.switches.map((r,i)=><ASwitchRow key={r[0]} label={r[0]} on={v.sw[i]} onChange={set("sw",i)} last={i===L.switches.length-1}/>)}</ACard>
        <ASection note="last 30 days">What has been hit</ASection>
        <HitsTable rows={L.hits}/>
      </ABody>
      {ask?<AConfirm title="Save these changes?" confirmLabel="Save" onClose={()=>setAsk(false)}
        body="They apply within seconds. If somebody else changed a value meanwhile, the save is refused and the page reads again."
        onConfirm={()=>{setSaved(v);say("Limits saved")}}><ADiff rows={diff}/></AConfirm>:null}
    </>
  );
}

/* Audit. Every staff write, newest first. */
function AuditPage(){
  const cols=[{label:"When",w:80},{label:"Who",w:140},{label:"What"},{label:"About",w:160}];
  return (
    <>
      <APaneHead title="Audit" sub="Every staff write, newest first"/>
      <ABody>
        <ATable cols={cols}>{AD.audit.map((r,i)=><ARow key={i} cols={cols} last={i===AD.audit.length-1}
          cells={[<AQuiet>{r.when}</AQuiet>,<AQuiet>{r.who}</AQuiet>,<span>{r.what}</span>,<AQuiet>{r.about}</AQuiet>]}/>)}</ATable>
      </ABody>
    </>
  );
}
Object.assign(window,{HealthPage,CostsPage,LimitsPage,AuditPage});
