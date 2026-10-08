const OFFLOAD_DS=(typeof window!=="undefined"&&window.OffloadDesignSystem_dc4a89)||{};
const { Icon, Logo } = OFFLOAD_DS;

function timeOfDay(date){
  const sun=(typeof window!=="undefined"&&window.OffloadSun)||null;
  const night=sun?sun.isNight(date||new Date()):false;
  return night?{label:"Tonight",icon:"moon"}:{label:"Today",icon:"sun"};
}

/* Today as decided 1 October 2026; the body is the iOS kit's TodayParts.jsx with and. */
function TodayScreen({unread,onOpenNotifications,onOpenSettings,onOpenThread,quiet}){
  const [custom,setCustom]=React.useState(false);
  const open=(name)=>onOpenThread&&onOpenThread({"Europe, October":"lisbon","Flat":"home","Work":"shelf","Bookshelf build":"shelf"}[name]||"lisbon");
  const ib=(icon,label,on,badge)=><button type="button" aria-label={label} onClick={on} style={{position:"relative",width:48,height:48,border:"none",background:"transparent",borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--a-on-var)",cursor:"pointer"}}><Icon name={icon} size={22}/>{badge?<i style={{position:"absolute",top:12,right:12,width:8,height:8,borderRadius:9,background:"var(--clay-600)"}}/>:null}</button>;
  return (
    <>
      <div style={{height:64,flex:"0 0 auto",display:"flex",alignItems:"center",padding:"0 4px 0 var(--gutter-screen)"}}>
        {Logo?<Logo size={21}/>:null}
        <span style={{flex:1}}/>{ib("sliders-horizontal","Customize Today",()=>setCustom(true))}{ib("bell","Activity",onOpenNotifications,unread)}{ib("settings","Settings",onOpenSettings)}</div>
      <div style={{flex:1,overflowY:"auto"}}><TodayBody and onThread={open} quiet={quiet}/></div>
      {custom?<CustomizeSheet and onClose={()=>setCustom(false)}/>:null}
    </>
  );
}

Object.assign(window,{TodayScreen,timeOfDay});
