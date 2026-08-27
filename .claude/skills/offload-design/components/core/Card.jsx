import React from "react";

function usePress(){const [h,setH]=React.useState(false),[p,setP]=React.useState(false);return{h,p,bind:{onMouseEnter:()=>setH(true),onMouseLeave:()=>{setH(false);setP(false)},onMouseDown:()=>setP(true),onMouseUp:()=>setP(false),onTouchStart:()=>setP(true),onTouchEnd:()=>setP(false)}}}

export function Card({children,variant="hairline",padding="var(--space-6)",onClick,style,...rest}){
  const {h,p,bind}=usePress();
  const interactive=Boolean(onClick);
  const skin={
    hairline:{background:"var(--surface-card)",border:"1px solid var(--border-hairline)",boxShadow:"none"},
    raised:{background:"var(--surface-card)",border:"1px solid var(--border-hairline)",boxShadow:"var(--shadow-2)"},
    fill:{background:"var(--surface-sunken)",border:"1px solid transparent",boxShadow:"none"}
  }[variant]||{};
  return (
    <div onClick={onClick} {...(interactive?bind:{})} {...rest}
      style={{borderRadius:"var(--radius-card)",padding,transition:"background var(--transition-ui),border-color var(--transition-ui),transform var(--duration-instant) var(--ease-out)",
        cursor:interactive?"pointer":undefined,...skin,
        ...(interactive&&h?{borderColor:"var(--blue-600)"}:null),
        ...(interactive&&p?{transform:"scale(0.995)"}:null),...style}}>{children}</div>
  );
}
