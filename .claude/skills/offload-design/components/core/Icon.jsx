import React from "react";

const CDN="https://cdn.jsdelivr.net/npm/lucide-static@0.469.0/icons/";

/* Set window.OFFLOAD_ICON_BASE to serve the vendored assets/icons/ copies
   instead of the CDN, components that take an `icon` slug (Button, TabBar,
   ListRow…) render Icon internally, so this is the only way to redirect them. */
export function Icon({name,size=20,basePath,style,...rest}){
  const base=basePath||(typeof window!=="undefined"&&window.OFFLOAD_ICON_BASE)||CDN;
  const url=base+name+".svg";
  return <span aria-hidden="true" {...rest} style={{display:"inline-block",width:size,height:size,flex:"0 0 auto",background:"currentColor",WebkitMaskImage:'url("'+url+'")',maskImage:'url("'+url+'")',WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",...style}}/>;
}
