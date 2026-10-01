/* Activity replaced the notification sheet (24 September): a pushed screen with no plate.
   The name is kept so App wiring is unchanged. See TodayParts.jsx. */
function NotificationSheet({onClose,onOpen}){
  return <ActivityScreen and onBack={()=>onClose()} onOpen={()=>onOpen&&onOpen({thread:"Lisbon trip"})}/>;
}
Object.assign(window,{NotificationSheet});
