/* Android's own device frame: a 360dp compact screen, a status bar with the clock at the
   start as Android places it, and the gesture bar rather than the iOS home indicator. */
function StatusBar(){
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 18px 2px",
      background:"var(--surface-raised)",font:"var(--weight-medium) 12px/1 var(--font-core)",
      fontVariantNumeric:"tabular-nums",color:"var(--a-on)"}}>
      <span>9:41</span>
      <span style={{display:"flex",alignItems:"center",gap:6,color:"var(--a-on)"}}>
        <span style={{display:"flex",alignItems:"flex-end",gap:2,height:10}}>{[4,6,8,10].map(h=><i key={h} style={{display:"block",width:3,height:h,borderRadius:1,background:"currentColor"}}/>)}</span>
        <span style={{width:20,height:11,border:"1.5px solid currentColor",borderRadius:2,padding:1,display:"flex"}}><i style={{flex:1,background:"currentColor",borderRadius:1}}/></span>
      </span>
    </div>
  );
}

function Phone({children,theme}){
  return (
    <div data-platform="android" data-theme={theme}
      style={{width:360,height:800,background:"var(--a-surface)",color:"var(--a-on)",borderRadius:28,
      border:"1px solid var(--a-outline)",boxShadow:"var(--shadow-3)",overflow:"hidden",position:"relative",
      display:"flex",flexDirection:"column"}}>
      <StatusBar/>
      {children}
      <div style={{position:"absolute",left:"50%",bottom:7,transform:"translateX(-50%)",width:108,height:4,
        borderRadius:2,background:"var(--a-on-var)",opacity:.5}}/>
    </div>
  );
}

Object.assign(window,{Phone,StatusBar});
