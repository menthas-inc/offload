/* Real sunrise/sunset from latitude+longitude (NOAA/suncalc method).
   No fixed 20:00 boundary. If the browser gives us a position we use it;
   otherwise longitude is estimated from the device's UTC offset and latitude
   defaults to 45 deg, which puts sunset within ~30 min for most of Europe and
   North America. Replace the fallback with a real location on device. */
(function(){
  var rad=Math.PI/180, dayMs=86400000, J1970=2440588, J2000=2451545;
  function toJulian(d){return d.valueOf()/dayMs-0.5+J1970}
  function fromJulian(j){return new Date((j+0.5-J1970)*dayMs)}

  function events(date,lat,lon){
    var J=toJulian(date), n=Math.round(J-J2000-0.0009-(-lon/360));
    var Js=J2000+0.0009+(-lon/360)+n;
    var M=(357.5291+0.98560028*(Js-J2000))*rad;
    var C=(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M))*rad;
    var L=M+C+102.9372*rad+Math.PI;
    var Jtransit=Js+0.0053*Math.sin(M)-0.0069*Math.sin(2*L);
    var dec=Math.asin(Math.sin(L)*Math.sin(23.44*rad));
    var cosH=(Math.sin(-0.833*rad)-Math.sin(lat*rad)*Math.sin(dec))/(Math.cos(lat*rad)*Math.cos(dec));
    if(cosH>1) return {sunrise:null,sunset:null,polar:"night"};
    if(cosH<-1) return {sunrise:null,sunset:null,polar:"day"};
    var H=Math.acos(cosH)/rad;
    var Jset=J2000+0.0009+((H-lon)/360+n)+0.0053*Math.sin(M)-0.0069*Math.sin(2*L);
    var Jrise=Jtransit-(Jset-Jtransit);
    return {sunrise:fromJulian(Jrise),sunset:fromJulian(Jset),polar:null};
  }

  var coords={lat:45,lon:-(new Date().getTimezoneOffset())/4,exact:false};
  if(typeof navigator!=="undefined"&&navigator.geolocation){
    try{navigator.geolocation.getCurrentPosition(function(p){
      coords={lat:p.coords.latitude,lon:p.coords.longitude,exact:true};
      window.dispatchEvent(new Event("offload:location"));
    },function(){},{timeout:4000,maximumAge:600000});}catch(e){}
  }

  /* isNight(date), true from sunset until sunrise, on the real curve. */
  function isNight(date){
    var d=date||new Date(), e=events(d,coords.lat,coords.lon);
    if(e.polar) return e.polar==="night";
    return d>=e.sunset||d<e.sunrise;
  }
  function sunsetTime(date){
    var e=events(date||new Date(),coords.lat,coords.lon);
    return e.sunset;
  }
  window.OffloadSun={events:events,isNight:isNight,sunsetTime:sunsetTime,coords:function(){return coords}};
})();
