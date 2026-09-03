"use client";

// The page background for every screen someone can reach without an account:
// the landing page and the gate. It is one component and not two so the two
// screens are literally the same background, which is what makes the move
// between them read as a card arriving rather than a page changing.
//
// What it draws, back to front: four blurred colour clouds across the whole
// page, a halo, then the mark filled with six drifting watercolour layers,
// five gradients and a thin-film prism shader, each pushed through its own
// turbulence displacement so no edge is ever a clean one.
//
// The layers shift away from the pointer at different depths, which is the
// part that has to be JavaScript: it is a light source at the cursor casting a
// stack, and CSS cannot follow a pointer.
//
// `pinned` is for a page taller than the window. Two things change and both are
// forced by the same measurement. It is fixed rather than absolute, because the
// atmosphere is centred on its own box and on a long document an absolute one
// puts the mark halfway down the article where nobody will ever see it. And it
// is *still*: no drift, no parallax, one draw of the shader.
//
// The stillness is not a taste decision. Each wash drifts inside a parent
// carrying an SVG turbulence filter, so moving the child re-runs the filter,
// and the whole stack costs ~96ms to paint: five 602px flares at ~9ms, three
// blurred clouds at 6-9ms, the halo at 4.4ms. Animated, that is ~96ms of raster
// work every frame, forever. On a one-screen page nothing else needs the raster
// thread and it is free. On a document it competes with the text tiles, which
// cost 2.7ms and lose, and the text arrives a second or two after the scroll.
// Frozen, the same picture is painted once and never again.

import { useEffect, useRef } from "react";
import styles from "./atmosphere.module.css";

// A full-screen triangle. No geometry, no matrices: the fragment shader is the
// whole picture.
const VERTEX_SHADER = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

// Domain-warped fbm twice over, read as a thin-film interference band. The
// cosine palette is what turns one scalar into the oil-on-water spread; the
// desaturate afterwards pulls it back from a rainbow to something that can sit
// behind text.
const FRAGMENT_SHADER = [
  "precision highp float;",
  "uniform vec2 res;uniform float t;uniform float amt;uniform vec3 paper;",
  "vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453);}",
  "float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
  "return mix(mix(dot(h2(i),f),dot(h2(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(h2(i+vec2(0,1)),f-vec2(0,1)),dot(h2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}",
  "float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.03;a*=.5;}return s;}",
  "void main(){",
  "vec2 uv=gl_FragCoord.xy/res.xy;vec2 q=uv*vec2(res.x/res.y,1.);",
  "float T=t*0.03;",
  "vec2 w1=vec2(fbm(q*1.1+vec2(0.,T)),fbm(q*1.1+vec2(4.2,-T)));",
  "vec2 w2=vec2(fbm(q*1.7+w1*1.5+vec2(T*1.1,1.7)),fbm(q*1.7+w1*1.5+vec2(-1.1,T)));",
  "float film=fbm(q*1.4+w2*1.8)*1.3+0.5;",
  "float band=film*2.6+T*1.4;",
  "vec3 col=0.5+0.5*cos(6.28318*(band+vec3(0.0,0.30,0.60)));",
  "col=mix(vec3(dot(col,vec3(0.299,0.587,0.114))),col,0.66);",
  "float shade=smoothstep(0.05,1.0,fbm(q*0.8+w2*0.7)+0.5);",
  "col=mix(paper,col,amt*(0.45+0.55*shade));",
  "gl_FragColor=vec4(col,1.0);}",
].join("\n");

/** How far each layer lags the pointer, in px at the edge of the screen. The
 *  order is front to back: the widest, softest wash moves most. */
const DEPTHS = [46, 35, 25, 16, 9, 0];

/** The prism redraws ten times a second. See the note in `draw`. */
const SHADER_INTERVAL_MS = 100;

/** The shader's ground has to be the page's own colour or the mark sits on a
 *  slightly different white than the paper around it. Read from the token
 *  rather than restated, so it follows --surface-page wherever that goes. */
function pageColour(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--surface-page").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!hex) return [1, 1, 1];
  const digits = hex[1]!.length === 3 ? [...hex[1]!].map((d) => d + d) : hex[1]!.match(/../g)!;
  return digits.map((pair) => parseInt(pair, 16) / 255) as [number, number, number];
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Atmosphere({ pinned = false }: { pinned?: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** A pinned atmosphere is a still one, for the same reason reduced motion is:
   *  both want the picture without anything that repaints it. */
  const still = pinned;

  // The pointer parallax. Two loops on purpose: the pointer writes a target and
  // the frame eases towards it, so a fast flick across the page drags the stack
  // rather than teleporting it.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || still || reducedMotion()) return;

    const flares = [...root.querySelectorAll<HTMLElement>("[data-flare]")];
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      target.x = (event.clientX / (window.innerWidth || 1) - 0.5) * 2;
      target.y = (event.clientY / (window.innerHeight || 1) - 0.5) * 2;
    };

    // Runs only while it has somewhere to go. Easing towards a target it has
    // already reached is a rAF a second forever for no movement at all, on a
    // page that is usually sitting still with nobody's pointer on it.
    const settled = () => Math.abs(target.x - eased.x) < 0.001 && Math.abs(target.y - eased.y) < 0.001;

    const tick = () => {
      eased.x += (target.x - eased.x) * 0.06;
      eased.y += (target.y - eased.y) * 0.06;
      flares.forEach((flare, index) => {
        const depth = DEPTHS[index] ?? 0;
        flare.style.setProperty("--fx", (-eased.x * depth).toFixed(2) + "px");
        flare.style.setProperty("--fy", (-eased.y * depth).toFixed(2) + "px");
      });
      frame = settled() ? 0 : requestAnimationFrame(tick);
    };

    const wake = (event: PointerEvent) => {
      onMove(event);
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", wake);
    return () => {
      window.removeEventListener("pointermove", wake);
      cancelAnimationFrame(frame);
    };
  }, [still]);

  // The prism shader.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    // No WebGL is not a failure state. Five watercolour layers still sit over
    // this one, so the mark loses a shimmer and keeps its shape.
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "res");
    const uTime = gl.getUniformLocation(program, "t");
    const uAmount = gl.getUniformLocation(program, "amt");
    const uPaper = gl.getUniformLocation(program, "paper");
    gl.uniform3fv(uPaper, pageColour());
    gl.uniform1f(uAmount, 0.25);

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      // Capped at 1.5, not the device ratio: this is a blurred field behind a
      // mask, and a 3x buffer of it costs real frames for nothing visible.
      const ratio = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // A still atmosphere draws once, at a fixed clock, exactly as reduced motion
    // does. The prism is part of the mark, not an animation of it, so removing
    // it would remove the picture rather than the movement.
    // Ten draws a second, and ten wake-ups a second to make them. The field's
    // own clock advances at 0.03, so a second of it is a thirtieth of a cycle:
    // fifty of every sixty frames were redrawing something indistinguishable
    // from what was already on screen, and each redraw pushes the canvas back
    // through its filter. The timer sets the rate and the frame keeps the draw
    // on the browser's own schedule, so nothing is drawn into a hidden tab.
    const reduced = still || reducedMotion();
    const start = performance.now();
    let frame = 0;
    let timer = 0;
    const draw = (now: number) => {
      gl.uniform1f(uTime, reduced ? 40 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced) timer = window.setTimeout(() => (frame = requestAnimationFrame(draw)), SHADER_INTERVAL_MS);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [still]);

  return (
    <div
      ref={rootRef}
      className={pinned ? `${styles.atmosphere} ${styles.pinned}` : styles.atmosphere}
      aria-hidden="true"
    >
      <div className={styles.clouds}>
        <div className={`${styles.cloud} ${styles.cloud1}`} />
        <div className={`${styles.cloud} ${styles.cloud2}`} />
        <div className={`${styles.cloud} ${styles.cloud3}`} />
        <div className={`${styles.cloud} ${styles.cloud4}`} />
      </div>

      <svg className={styles.defs} focusable="false" aria-hidden="true">
        <defs>
          {/* One turbulence per layer, each with its own seed and frequency, so
              the five washes do not tear along the same lines. */}
          <filter id="atmoA" x="-45%" y="-45%" width="190%" height="190%">
            <feTurbulence type="fractalNoise" baseFrequency="0.007 0.010" numOctaves="4" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="30" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="10" />
          </filter>
          <filter id="atmoB" x="-45%" y="-45%" width="190%" height="190%">
            <feTurbulence type="fractalNoise" baseFrequency="0.011 0.008" numOctaves="4" seed="21" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="24" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="7" />
          </filter>
          <filter id="atmoC" x="-45%" y="-45%" width="190%" height="190%">
            <feTurbulence type="fractalNoise" baseFrequency="0.009 0.013" numOctaves="4" seed="14" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="5" />
          </filter>
          <filter id="atmoD" x="-45%" y="-45%" width="190%" height="190%">
            <feTurbulence type="fractalNoise" baseFrequency="0.014 0.011" numOctaves="4" seed="41" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="4" />
          </filter>
          {/* The shader's own filter is much gentler: it already carries its
              own structure and a heavy displacement only smears it. */}
          <filter id="atmoE" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.022 0.026" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="1.1" />
          </filter>
        </defs>
      </svg>

      <div className={styles.glow} />

      <div className={styles.mark}>
        <div data-flare className={`${styles.flare} ${styles.flare1}`}>
          <div className={`${styles.wash} ${styles.wash1}`} />
        </div>
        <div data-flare className={`${styles.flare} ${styles.flare2}`}>
          <div className={`${styles.wash} ${styles.wash2}`} />
        </div>
        <div data-flare className={`${styles.flare} ${styles.flare3}`}>
          <div className={`${styles.wash} ${styles.wash3}`} />
        </div>
        <div data-flare className={`${styles.flare} ${styles.flare4}`}>
          <div className={`${styles.wash} ${styles.wash4}`} />
        </div>
        <div data-flare className={`${styles.flare} ${styles.flare5}`}>
          <div className={`${styles.wash} ${styles.wash5}`} />
        </div>
        <div data-flare className={`${styles.flare} ${styles.flare6}`}>
          <div className={`${styles.wash} ${styles.wash6}`}>
            <canvas ref={canvasRef} className={styles.canvas} />
          </div>
        </div>
      </div>
    </div>
  );
}
