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
//
// `scroll` is the landing page, which is long *and* moves. The mark is driven
// by the scroll: it grows until the window is inside the vessel, and shrinks
// to sit over the closing heading. The same measurement decides how. There is
// no turbulence at all: the washes take a plain blur, which a compositor can
// scale as a texture. The prism is one canvas the size of the window with the
// mark as its mask, and the mask moves, because scaling the canvas itself
// would magnify a 0.6x buffer eighteen times and blur the film to flat colour.
// No parallax. Under reduced motion it is the pinned picture, exactly.

import { useEffect, useRef } from "react";
import { useReducedMotion } from "../lib/reduced-motion";
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
  // `hue` turns the band and `zm` magnifies the field about its centre. At 0
  // and 1 they are not there.
  "uniform float hue;uniform float zm;",
  "vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453);}",
  "float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
  "return mix(mix(dot(h2(i),f),dot(h2(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(h2(i+vec2(0,1)),f-vec2(0,1)),dot(h2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}",
  "float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.03;a*=.5;}return s;}",
  "void main(){",
  "vec2 uv=gl_FragCoord.xy/res.xy;vec2 q=((uv-.5)*vec2(res.x/res.y,1.))/zm+.5;",
  "float T=t*0.03;",
  "vec2 w1=vec2(fbm(q*1.1+vec2(0.,T)),fbm(q*1.1+vec2(4.2,-T)));",
  "vec2 w2=vec2(fbm(q*1.7+w1*1.5+vec2(T*1.1,1.7)),fbm(q*1.7+w1*1.5+vec2(-1.1,T)));",
  "float film=fbm(q*1.4+w2*1.8)*1.3+0.5;",
  "float band=film*2.6+T*1.4+hue;",
  "vec3 col=0.5+0.5*cos(6.28318*(band+vec3(0.0,0.30,0.60)));",
  "col=mix(vec3(dot(col,vec3(0.299,0.587,0.114))),col,0.66);",
  "float shade=smoothstep(0.05,1.0,fbm(q*0.8+w2*0.7)+0.5);",
  "col=mix(paper,col,amt*(0.45+0.55*shade));",
  "gl_FragColor=vec4(col,1.0);}",
].join("\n");

/** How far each layer lags the pointer, in px at the edge of the screen. The
 *  order is front to back: the widest, softest wash moves most. */
const DEPTHS = [46, 35, 25, 16, 9, 0];

const FLARES = [styles.flare1, styles.flare2, styles.flare3, styles.flare4, styles.flare5];

/** The prism redraws ten times a second. See the note in `draw`. */
const SHADER_INTERVAL_MS = 100;

/** And at most thirty times a second while the page scrolls. The mark and its
 *  mask move on every frame, which is what reads as smooth; the film inside is
 *  a slow field, and a draw of it on each of a phone's 60 or 120 frames is the
 *  fragment shader competing with the story's text for nothing anyone sees. */
const SCROLL_FILM_INTERVAL_MS = 33;

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

/** The film in scroll mode is drawn at 0.6 of a CSS pixel whatever the
 *  device's ratio: it fills the window, sits behind a blurred panel for most of
 *  the page, and is the first thing to give up if a phone drops frames in the
 *  zoom (to 0.45, per the handoff). */
const SCROLL_FILM_SCALE = 0.6;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

interface Prism {
  /** Fit the buffer to the canvas's box at `scale` buffer pixels per CSS one. */
  size(scale: number): void;
  draw(t: number, amount: number, hue: number, zoom: number): void;
}

function prism(canvas: HTMLCanvasElement): Prism | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  // No WebGL is not a failure state. Five watercolour layers still sit over
  // this one, so the mark loses a shimmer and keeps its shape.
  if (!gl) return null;

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
  const uHue = gl.getUniformLocation(program, "hue");
  const uZoom = gl.getUniformLocation(program, "zm");
  gl.uniform3fv(gl.getUniformLocation(program, "paper"), pageColour());

  return {
    size(scale) {
      const box = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(box.width * scale));
      const height = Math.max(1, Math.round(box.height * scale));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
    },
    draw(t, amount, hue, zoom) {
      gl.uniform1f(uTime, t);
      gl.uniform1f(uAmount, amount);
      gl.uniform1f(uHue, hue);
      gl.uniform1f(uZoom, zoom);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

export function Atmosphere({ mode = "drift" }: { mode?: "drift" | "pinned" | "scroll" }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const markRef = useRef<HTMLDivElement | null>(null);
  const filmRef = useRef<HTMLDivElement | null>(null);
  const cloudsRef = useRef<HTMLDivElement | null>(null);
  const pinned = mode === "pinned";
  const scroll = mode === "scroll";
  /** A pinned atmosphere is a still one, for the same reason reduced motion is:
   *  both want the picture without anything that repaints it. */
  const still = pinned;
  const reduced = useReducedMotion();

  // The pointer parallax. Two loops on purpose: the pointer writes a target and
  // the frame eases towards it, so a fast flick across the page drags the stack
  // rather than teleporting it.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || still || scroll || reduced) return;

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
    // Back to rest when the loop stops, so turning reduced motion on does not
    // leave the stack parked where the pointer last pushed it, and a later run
    // starts from where its own `eased` does.
    return () => {
      window.removeEventListener("pointermove", wake);
      cancelAnimationFrame(frame);
      for (const flare of flares) {
        flare.style.removeProperty("--fx");
        flare.style.removeProperty("--fy");
      }
    };
  }, [still, scroll, reduced]);

  // The prism shader.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scroll) return;
    const film = prism(canvas);
    if (!film) return;

    // Capped at 1.5, not the device ratio: this is a blurred field behind a
    // mask, and a 3x buffer of it costs real frames for nothing visible.
    const resize = () => film.size(Math.min(1.5, window.devicePixelRatio || 1));
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
    const fixed = still || reduced;
    const start = performance.now();
    let frame = 0;
    let timer = 0;
    const draw = (now: number) => {
      film.draw(fixed ? 40 : (now - start) / 1000, 0.25, 0, 1);
      if (!fixed) timer = window.setTimeout(() => (frame = requestAnimationFrame(draw)), SHADER_INTERVAL_MS);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [still, scroll, reduced]);

  // Scroll mode: the mark, its film and the clouds, placed by how far the
  // window has scrolled. One loop, woken by the scroll and by a ten-a-second
  // timer for the film's own clock, and writing only transforms, opacities and
  // the mask, so nothing here lays the page out again.
  useEffect(() => {
    if (mode !== "scroll") return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const mark = markRef.current;
    const filmBox = filmRef.current;
    const clouds = cloudsRef.current;
    if (!root || !canvas || !mark || !filmBox || !clouds) return;

    const film = prism(canvas);

    // Reduced motion is the pinned picture: no zoom and no clock. The styles
    // already draw the mark where pinned does, so one draw is all there is,
    // once whatever the scroll wrote is taken off again.
    if (reduced) {
      for (const property of ["transform", "opacity"]) mark.style.removeProperty(property);
      for (const property of ["-webkit-mask-size", "mask-size", "-webkit-mask-position", "mask-position", "opacity"]) filmBox.style.removeProperty(property);
      clouds.style.removeProperty("opacity");
      const once = () => {
        film?.size(SCROLL_FILM_SCALE);
        film?.draw(40, 0.25, 0, 1);
      };
      once();
      window.addEventListener("resize", once);
      return () => window.removeEventListener("resize", once);
    }

    const end = document.querySelector<HTMLElement>("[data-landing-end]");
    const start = performance.now();
    let frame = 0;
    let timer = 0;
    let lastY = -1;
    let lastDraw = 0;
    let dirty = true;
    let width = 1;
    let height = 1;
    let box = 1;

    const measure = () => {
      width = root.clientWidth || 1;
      height = root.clientHeight || 1;
      box = mark.offsetWidth || 1;
      film?.size(SCROLL_FILM_SCALE);
      dirty = true;
    };

    const tick = (now: number) => {
      frame = 0;
      const y = window.scrollY;
      const moved = dirty || y !== lastY;
      const stir = moved ? now - lastDraw >= SCROLL_FILM_INTERVAL_MS : now - lastDraw >= SHADER_INTERVAL_MS;
      if (moved || stir) {
        const k = clamp(y / height);
        const page = clamp(y / Math.max(1, document.documentElement.scrollHeight - height));
        // In: through the first screen, about the vessel's base.
        const zin = smooth(clamp(k / 1.05));
        // Out: as the closing section comes through the window.
        let zout = 0;
        if (end) {
          const rect = end.getBoundingClientRect();
          zout = smooth(clamp((clamp((height - rect.top) / (rect.height + height)) - 0.08) / 0.42));
        }
        const inside = zin * (1 - zout);

        if (moved) {
          const scale = mix(1 + Math.pow(zin, 2.4) * 17, 0.36, zout);
          // The origin: 92.6% down the mark's box going in, its centre going out.
          const origin = mix(0.426, 0, zout) * box;
          const centre = height / 2 + origin - origin * scale - zout * height * 0.2;
          const opacity = mix(0.75, 1, inside).toFixed(3);

          mark.style.transform = `translate(-50%, calc(-50% + ${(centre - height / 2).toFixed(1)}px)) scale(${scale.toFixed(4)})`;
          mark.style.opacity = opacity;

          const maskWidth = ((box * 62) / 68) * scale;
          const maskHeight = box * scale;
          const size = `${maskWidth.toFixed(1)}px ${maskHeight.toFixed(1)}px`;
          const at = `${(width / 2 - maskWidth / 2).toFixed(1)}px ${(centre - maskHeight / 2).toFixed(1)}px`;
          filmBox.style.setProperty("-webkit-mask-size", size);
          filmBox.style.setProperty("mask-size", size);
          filmBox.style.setProperty("-webkit-mask-position", at);
          filmBox.style.setProperty("mask-position", at);
          filmBox.style.opacity = opacity;

          clouds.style.opacity = (0.72 * (1 - 0.6 * inside)).toFixed(3);
        }

        // The film stirs as the page scrolls: the scroll is added to its clock.
        if (stir) {
          film?.draw(40 + (now - start) / 1000 + y * 0.006, mix(0.25, 0.62, inside), page * 1.1, 1 + inside * 0.8);
          lastDraw = now;
        }
      }
      lastY = y;
      dirty = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(wake, SHADER_INTERVAL_MS);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    measure();
    wake();
    const onResize = () => {
      measure();
      wake();
    };
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [mode, reduced]);

  if (scroll) {
    return (
      <div ref={rootRef} className={`${styles.atmosphere} ${styles.scroll}`} aria-hidden="true">
        <div ref={cloudsRef} className={styles.clouds}>
          <div className={`${styles.cloud} ${styles.cloud1}`} />
          <div className={`${styles.cloud} ${styles.cloud2}`} />
          <div className={`${styles.cloud} ${styles.cloud3}`} />
          <div className={`${styles.cloud} ${styles.cloud4}`} />
        </div>

        <div className={styles.glow} />

        {/* The five washes, with no filter definitions: each takes a plain blur
            from the stylesheet. The sixth layer is the film below. */}
        <div ref={markRef} className={styles.mark}>
          {[styles.wash1, styles.wash2, styles.wash3, styles.wash4, styles.wash5].map((wash, index) => (
            <div key={wash} className={`${styles.flare} ${FLARES[index]}`}>
              <div className={`${styles.wash} ${wash}`} />
            </div>
          ))}
        </div>

        <div ref={filmRef} className={styles.film}>
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>
      </div>
    );
  }

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
