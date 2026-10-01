const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { AppBar, IconButton, Logo } = OFFLOAD_DS;

/* Two states only: Today until sunset, Tonight after. Real sunset, see sun.js. */
function timeOfDay(date){
  const sun=(typeof window!=="undefined"&&window.OffloadSun)||null;
  const night=sun?sun.isNight(date||new Date()):false;
  return night?{label:"Tonight",icon:"moon"}:{label:"Today",icon:"sun"};
}

/* Today as decided 1 October 2026 (readme: Today). The body is shared with the Android
   kit in TodayParts.jsx; only the bar differs. */
function TodayScreen({unread,onOpenNotifications,onOpenSettings,barSolid,onOpenThread,quiet}){
  const [custom,setCustom]=React.useState(false);
  const open=(name)=>onOpenThread&&onOpenThread({"Europe, October":"lisbon","Flat":"home","Work":"shelf"}[name]||"lisbon");
  return (
    <>
      <AppBar border={false} style={barSolid?{background:"var(--surface-raised)",backdropFilter:"none",WebkitBackdropFilter:"none"}:{background:"var(--surface-chrome)"}}
        title={<Logo size={21}/>}
        right={<><IconButton icon="sliders-horizontal" label="Customize Today" onClick={()=>setCustom(true)}/><IconButton icon="bell" label="Activity" badge={unread} onClick={onOpenNotifications}/><IconButton icon="settings" label="Settings" onClick={onOpenSettings}/></>}/>
      <div style={{flex:1,overflowY:"auto"}}><TodayBody onThread={open} quiet={quiet}/></div>
      {custom?<CustomizeSheet onClose={()=>setCustom(false)}/>:null}
    </>
  );
}

Object.assign(window,{TodayScreen,timeOfDay});
