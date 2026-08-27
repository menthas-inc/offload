function StatusBar(){
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 26px 4px",
      background:"var(--surface-chrome)",backdropFilter:"var(--blur-chrome)",WebkitBackdropFilter:"var(--blur-chrome)",font:"var(--weight-semibold) var(--size-label)/1 var(--font-core)",fontVariantNumeric:"tabular-nums",letterSpacing:"var(--tracking-body)"}}>
      <span>9:41</span>
      <span style={{display:"flex",alignItems:"center",gap:5,color:"var(--ink-900)"}}>
        <span style={{display:"flex",alignItems:"flex-end",gap:2,height:10}}>{[4,6,8,10].map(h=><i key={h} style={{display:"block",width:3,height:h,borderRadius:1,background:"currentColor"}}/>)}</span>
        <span style={{width:22,height:11,border:"1px solid currentColor",borderRadius:3,padding:1,display:"flex"}}><i style={{flex:1,background:"currentColor",borderRadius:1}}/></span>
      </span>
    </div>
  );
}

function Phone({children,theme}){
  return (
    <div data-theme={theme} style={{width:390,height:844,background:"var(--surface-page)",color:"var(--text-primary)",borderRadius:44,
      border:"1px solid var(--border-strong)",boxShadow:"var(--shadow-3)",overflow:"hidden",position:"relative",
      display:"flex",flexDirection:"column"}}>
      <StatusBar/>
      {children}
      <div style={{position:"absolute",left:"50%",bottom:8,transform:"translateX(-50%)",width:134,height:5,borderRadius:3,background:"var(--ink-300)"}}/>
    </div>
  );
}

Object.assign(window,{Phone,StatusBar});
