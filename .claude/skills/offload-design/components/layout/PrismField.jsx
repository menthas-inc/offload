import React from "react";

/* The buffer is small and CSS scales it up: the field is soft enough that the
   interpolation reads as part of the effect, and a full-resolution warp would
   be paying for detail nothing can see. */
const BUFFERS = { band: [256, 140], bloom: [200, 200] };

/* Rescales a texture's per-row alpha to a symmetric hump inside the VISIBLE
   window: zero at the top edge, full across the middle of the window, zero by
   the row where the veil closes for good.

   Shaping the field over its whole box is not enough, because what the eye sees
   is field x (1 - veil) and the veil is not symmetric: its lower stop is pinned
   so full fill is reached above the tab labels. Over the whole box the field's
   opening ramp coincides with the veil's, so the two multiply into a squared
   curve that opens abruptly, while at the bottom they stagger and the decay
   smears twice as far. Shaped to the same window as the veil, both layers are
   symmetric about the same centre and the composite is too.

   The row's existing mean is divided out, which is what makes this independent
   of whatever gradient the bake happened to carry. */
const EDGE = 0.3;
function reprofile(img, w, h, limit) {
  const d = img.data;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  let peak = 0;
  const mean = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) sum += d[(y * w + x) * 4 + 3];
    mean[y] = sum / w;
    if (mean[y] > peak) peak = mean[y];
  }
  if (!peak) return;
  const lim = limit > 0.2 && limit <= 1 ? limit : 1;
  for (let y = 0; y < h; y++) {
    const f = (y + 0.5) / h;
    /* Beyond the window the field contributes nothing at all, so the tab labels
       are protected by the absence of colour rather than only by the fill. */
    const g = f / lim;
    const target = g > 1 ? 0 : peak * Math.min(smooth(g / EDGE), smooth((1 - g) / EDGE));
    /* Guarded: a row that is nearly empty must not be multiplied up into noise. */
    const k = mean[y] > 2 ? target / mean[y] : 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      const v = d[i] * k;
      d[i] = v > 255 ? 255 : v;
    }
  }
}

function num(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

export function PrismField({variant="band",basePath,density=1,veil="graded",pulse,arriveOnMount=false,style,...rest}){
  /* Same resolution order as Icon: the prop, then the host page's global, then a
   root-relative guess. Pages sit at different depths, so a page-relative
   default silently fetches nothing. */
  const base=basePath||(typeof window!=="undefined"&&window.OFFLOAD_PRISM_BASE)||"assets/prism";
  const canvasRef = React.useRef(null);
  const shiftRef = React.useRef(null);
  const stateRef = React.useRef({ src: null, frame: 0, phase: 0, until: 0, last: 0 });
  const [w, h] = BUFFERS[variant] || BUFFERS.band;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const st = stateRef.current;
    const out = ctx.createImageData(w, h);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const amp = num("--prism-warp", 11);
    const runMs = num("--prism-run", 2000);
    const settleMs = num("--prism-settle", 700);

    const render = (t) => {
      if (!st.src) return;
      const s = st.src.data, o = out.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = amp * (Math.sin(y*0.085 + t*0.55) + 0.62*Math.sin((x*0.5 + y*0.7)*0.055 - t*0.42));
          const dy = amp * 0.55 * (Math.cos(x*0.062 - t*0.48) + 0.5*Math.cos((x - y)*0.045 + t*0.36));
          let sx = ((x + dx) | 0) % w; if (sx < 0) sx += w;
          let sy = (y + dy) | 0; if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
          const si = (sy*w + sx) * 4, di = (y*w + x) * 4;
          o[di] = s[si]; o[di+1] = s[si+1]; o[di+2] = s[si+2]; o[di+3] = s[si+3];
        }
      }
      ctx.putImageData(out, 0, 0);
      st.phase = t;
    };

    /* The clock advances by real elapsed time scaled through the settle, so the
       flow slows to a halt instead of cutting out mid-motion. */
    const step = (now) => {
      st.frame = 0;
      if (!st.src) return;
      const left = st.until - now;
      if (left <= 0 || document.hidden || reduce.matches) { render(st.phase); return; }
      const u = left < settleMs ? left / settleMs : 1;
      const rate = u * u * (3 - 2*u);
      const dt = Math.min(64, now - (st.last || now));
      st.last = now;
      render(st.phase + (dt / 1000) * rate);
      st.frame = requestAnimationFrame(step);
    };

    st.arrive = () => {
      if (!st.src || reduce.matches) return;
      st.until = performance.now() + runMs;
      st.last = 0;
      if (!st.frame) st.frame = requestAnimationFrame(step);
    };

    const img = new Image();
    img.onload = () => {
      const off = document.createElement("canvas");
      off.width = w; off.height = h;
      const octx = off.getContext("2d");
      octx.drawImage(img, 0, 0, w, h);
      try { st.src = octx.getImageData(0, 0, w, h); } catch (e) { st.src = null; }
      if (!st.src) return;
      /* The texture is baked with a one-directional alpha ramp, densest at one
         end. The veil, though, closes at BOTH edges, so that ramp makes the two
         ends behave nothing alike: at the dense end full-strength colour meets
         the veil's ramp and appears abruptly, while at the thin end the texture
         and the veil fade together over the same distance and dissolve. The
         field's own vertical profile is rescaled to a symmetric hump here, so
         both edges get the same length of fade. Measured per row rather than
         assumed, so it holds whatever the bake did. */
      if (variant === "band") reprofile(st.src, w, h, num("--prism-veil-reach", 64) / 100);
      /* Frozen at a fixed clock, which is also what reduced motion and a
         backgrounded app get. */
      render(1.2);
      if (arriveOnMount) st.arrive();
    };
    img.src = base.replace(/\/$/, "") + "/p2-" + variant + "-1.png";

    const onVisibility = () => {
      if (!document.hidden) return;
      if (st.frame) { cancelAnimationFrame(st.frame); st.frame = 0; }
    };
    document.addEventListener("visibilitychange", onVisibility);

    /* The texture is 16% wider than its box either side, and the shift is
       clamped inside that overhang. Horizontal only: the field's profile closes
       at both edges, so vertical travel would slide those closed ends inward
       and shorten the fade at whichever edge it moved away from. */
    let pending = false;
    const onScroll = (e) => {
      const el = e.target;
      if (!el || typeof el.scrollTop !== "number" || reduce.matches) return;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const layer = shiftRef.current;
        if (!layer) return;
        const shift = Math.max(-26, Math.min(26, -el.scrollTop * 0.055));
        layer.style.setProperty("--prism-shift", shift.toFixed(1) + "px");
      });
    };
    document.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("scroll", onScroll, true);
      if (st.frame) cancelAnimationFrame(st.frame);
      st.frame = 0;
    };
  }, [variant, base, arriveOnMount, w, h]);

  /* Any change to pulse is an arrival. The first render is not one, or the
     field would warp on every mount. */
  const seen = React.useRef(pulse);
  React.useEffect(() => {
    if (seen.current === pulse) return;
    seen.current = pulse;
    if (stateRef.current.arrive) stateRef.current.arrive();
  }, [pulse]);

  const alpha = "calc(var(--prism-alpha) * var(--prism-density) * " + density + ")";
  return (
    <div aria-hidden="true" {...rest} style={{position:"absolute",inset:0,pointerEvents:"none",...style}}>
      {/* Wider than its box so a horizontal parallax has somewhere to go, and
          no vertical overhang: the profile's closed ends are the field's edges. */}
      <div ref={shiftRef} style={{position:"absolute",left:"-16%",right:"-16%",top:0,bottom:0,overflow:"hidden",
        transform:"translate3d(var(--prism-shift,0px),0,0)"}}>
        <canvas ref={canvasRef} width={w} height={h}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",opacity:alpha}}/>
      </div>
      {veil === "graded" ? (
        <div style={{position:"absolute",inset:0,
          background:"linear-gradient(to bottom," +
            "rgb(var(--prism-veil-rgb) / var(--prism-veil-full)) 0%," +
            "rgb(var(--prism-veil-rgb) / var(--prism-veil-top)) var(--prism-veil-edge)," +
            "rgb(var(--prism-veil-rgb) / var(--prism-veil-top)) var(--prism-veil-hold)," +
            "rgb(var(--prism-veil-rgb) / var(--prism-veil-full)) var(--prism-veil-reach)," +
            "rgb(var(--prism-veil-rgb) / var(--prism-veil-full)) 100%)"}}/>
      ) : null}
    </div>
  );
}
