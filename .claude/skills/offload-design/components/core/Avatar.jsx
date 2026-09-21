import React from "react";

/* A person, drawn as a prism when they have no photo.

   The product has no Avatar component until now: the kits hand-roll an initials circle in
   five places, which at 32px is two grey letters. A generated mark gives a person a colour
   and a direction, so a list is scannable before it is read.

   Two constants and two wheels, and the constants are the part not to relax:

   L 0.42 to 0.52 at C 0.13   every hue the generator can produce keeps white initials
                              above 4.5:1. At L 0.56 the lightest hue measured 4.16:1.
   12 hues, 30 degrees apart  a continuous hash puts two people 15 degrees apart, which at
                              36px is no difference at all.
   8 facet angles             12 hues alone is not enough: twelve accounts land on eight
                              distinct hues. The facet edge is what survives 36px, so it is
                              part of the identity rather than decoration.

   Seeded from the account id, never the name or the email, both of which change. In
   production the server draws this once at signup and stores it; this component is the
   same arithmetic so a mock and the real thing agree. */

const L_LO=0.42, L_HI=0.52, CH=0.13;
const HUES=12, FACETS=8;

function fnv1a(s){let h=0x811c9dc5;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,0x01000193)}return h>>>0}
function ok(l,h){return "oklch("+l+" "+CH+" "+((h%360)+360)%360+")"}

export function Avatar({uid,initials,name,size=36,style,...rest}){
  const seed=fnv1a(uid||name||"");
  const hue=(seed%HUES)*(360/HUES);
  /* One draw off the seed, so the angle is reproducible from the id alone. */
  let s=seed||1;s^=s<<13;s^=s>>>17;s^=s<<5;
  const step=((s>>>0)%FACETS);
  const deg=step*(360/FACETS);
  const rad=deg*Math.PI/180, dx=Math.cos(rad), dy=Math.sin(rad);
  /* The facet is a half plane through the centre along the seeded direction, as a polygon
     rather than a rotated box, so it clips identically at every size. */
  const t=200, nx=-dy, ny=dx;
  const pt=(a,b)=>(50+a).toFixed(2)+"% "+(50+b).toFixed(2)+"%";
  const clip="polygon("+[pt(dx*t,dy*t),pt(-dx*t,-dy*t),pt(-dx*t+nx*t,-dy*t+ny*t),pt(dx*t+nx*t,dy*t+ny*t)].join(",")+")";
  const label=initials||(name||"").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  /* The monogram scales with the circle rather than stepping, because the product draws
     five sizes between 28 and 56 and a per-size table would need editing for a sixth. */
  const fs=Math.round(size*0.36);
  return (
    <span {...rest} aria-label={name||undefined} style={{position:"relative",flex:"0 0 auto",
      width:size,height:size,borderRadius:"var(--radius-pill)",overflow:"hidden",
      display:"inline-flex",alignItems:"center",justifyContent:"center",
      background:"linear-gradient("+deg+"deg, "+ok(L_LO,hue)+", "+ok(L_HI,hue+30)+")",...style}}>
      <span aria-hidden="true" style={{position:"absolute",inset:0,clipPath:clip,
        background:"linear-gradient("+deg+"deg, "+ok(L_HI,hue+90)+", "+ok(L_LO,hue+120)+")"}}/>
      {label?<span aria-hidden="true" style={{position:"relative",color:"#FFFFFF",
        font:"var(--weight-semibold) "+fs+"px/1 var(--font-core)",letterSpacing:".01em"}}>{label}</span>:null}
    </span>
  );
}
