/**
 * Metal líquido negro en WebGL. Un solo fragment shader propio (sin librerías):
 * campo de altura con domain warping (ruido de gradiente, 4 octavas), normales
 * por diferencias finitas, reflejo de un estudio procedural (softboxes, tiras
 * de luz) + especular + un velo de película delgada (iridiscencia) muy tenue.
 *
 * Los colores no viven acá: se leen de las variables CSS --gl-* de tokens.css.
 *
 * Usos:
 *  - mountChromeHero(): fondo vivo del hero (pausa fuera de pantalla, resolución
 *    adaptativa, respuesta a puntero y scroll, cuadro fijo con reduced-motion).
 *  - drawChromeStill(): un cuadro estático para las portadas generativas.
 */

import { register } from './active';

type Vec3 = [number, number, number];

const COLOR_VARS = ['--gl-void', '--gl-shadow', '--gl-silver', '--gl-cool', '--gl-pink', '--gl-blue', '--gl-sand'] as const;

function hexToVec3(hex: string): Vec3 {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function readColors(): Vec3[] {
  const cs = getComputedStyle(document.documentElement);
  return COLOR_VARS.map((v) => hexToVec3(cs.getPropertyValue(v)));
}

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPtr;
uniform float uPtrAmt;
uniform float uScroll;
uniform vec2 uSeed;
uniform float uScale;
uniform float uDim;
uniform float uAA;
uniform vec3 cVoid, cShadow, cSilver, cCool, cPink, cBlue, cSand;

vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2. - 1.;
}
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(dot(hash22(i), f), dot(hash22(i + vec2(1., 0.)), f - vec2(1., 0.)), u.x),
             mix(dot(hash22(i + vec2(0., 1.)), f - vec2(0., 1.)), dot(hash22(i + vec2(1., 1.)), f - vec2(1., 1.)), u.x), u.y);
}
const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 3; i++){ s += a * gnoise(p); p = R * p; a *= .5; }
  return s;
}
float fbm4(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 4; i++){ s += a * gnoise(p); p = R * p; a *= .42; }
  return s;
}

// Estudio procedural: lo que "ve" el metal al reflejar. Casi todo negro; unas
// pocas fuentes de luz grandes y tiras finas dan los reflejos de lámina.
vec3 studio(vec3 r){
  vec2 e = r.xy;
  float amb = .018 + .05 * smoothstep(-.9, .9, e.y);
  float box = smoothstep(.55, .0, length((e - vec2(-.42, .5)) * vec2(1., 1.7)));
  float box2 = smoothstep(.42, .0, length((e - vec2(.55, -.35)) * vec2(1.4, 1.))) * .8;
  float s1 = smoothstep(.032 * uAA, .0, abs(dot(e, vec2(.82, .57)) - .2));
  float s2 = smoothstep(.02 * uAA, .0, abs(e.x - .46)) * smoothstep(1., .25, abs(e.y - .05));
  float s3 = smoothstep(.02 * uAA, .0, abs(dot(e, vec2(-.6, .8)) + .38)) * .7;
  float rim = smoothstep(.6, 1.1, length(e)) * .6;
  float l = amb + box * .85 + box2 * .5 + s1 * .8 + s2 * .7 + s3 + rim * .3;
  l = clamp(l, 0., 1.4);
  vec3 col = mix(cShadow, mix(cCool, cSilver, smoothstep(.3, 1., l)), smoothstep(.02, .55, l));
  return col * (.15 + .85 * smoothstep(0., .6, l)) * (.6 + .6 * l);
}

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / min(uRes.x, uRes.y);
  vec2 p = uv * uScale + uSeed;
  p.y += uScroll * .7;
  float t = uTime;

  // domain warping en dos pasos: el flujo viscoso
  vec2 b = p * .75;
  vec2 q = vec2(fbm3(b + vec2(0., t * .5)), fbm3(b + vec2(5.2, 1.3) - vec2(t * .4, 0.)));
  vec2 r = vec2(fbm3(b + 2.6 * q + vec2(1.7, 9.2) + t * .3), fbm3(b + 2.6 * q + vec2(8.3, 2.8) - t * .25));
  vec2 w = 1.8 * r;

  // abolladura que sigue al puntero
  float eps = .02;
  vec2 d0 = uv - uPtr;
  vec2 dx = d0 + vec2(eps / uScale, 0.);
  vec2 dy = d0 + vec2(0., eps / uScale);
  float k = uPtrAmt * .5;
  float h  = fbm4(p * .8 + w) + k * exp(-dot(d0, d0) * 9.);
  float hx = fbm4((p + vec2(eps, 0.)) * .8 + w) + k * exp(-dot(dx, dx) * 9.);
  float hy = fbm4((p + vec2(0., eps)) * .8 + w) + k * exp(-dot(dy, dy) * 9.);

  float bump = 2.9 * (1. - .5 * uScroll);
  vec3 n = normalize(vec3(-(hx - h) / eps * bump * .2, -(hy - h) / eps * bump * .2, 1.));
  vec3 refl = vec3(0., 0., -1.) + 2. * n.z * n;
  vec3 col = studio(refl);

  // especular duro (gotas de luz sobre el líquido)
  vec3 L = normalize(vec3(-.42, .5, .76));
  float spec = pow(max(dot(n, normalize(L + vec3(0., 0., 1.))), 0.), 140. / uAA);
  col += cSilver * spec * 1.4;

  // película delgada: rosa / azul / arena, solo en bordes y brillos
  float thick = h * 2.4 + (1. - n.z) * 4.;
  vec3 film = .5 + .5 * cos(6.2832 * (thick + vec3(0., .33, .67)));
  vec3 iris = mix(mix(cPink, cBlue, film.g), cSand, film.b * .45);
  float lum = dot(col, vec3(.33));
  float edge = smoothstep(.02, .22, 1. - n.z);
  col += iris * pow(lum, 1.6) * edge * .55 * (.35 + film.r);

  // negros profundos y curva de contraste
  col = pow(col, vec3(1.7)) * 1.15;
  col = mix(cVoid, col, .96);

  // viñeta y apagado con el scroll
  float vig = smoothstep(1.25, .15, length(uv * vec2(.72, 1.)));
  col *= mix(.5, 1., vig);
  col *= 1. - uDim;
  col += (hash12(gl_FragCoord.xy + uTime) - .5) / 220.;
  gl_FragColor = vec4(max(col, cVoid * .8), 1.);
}
`;

interface DrawParams {
  w: number;
  h: number;
  time: number;
  ptr?: [number, number];
  ptrAmt?: number;
  scroll?: number;
  seed?: [number, number];
  scale?: number;
  dim?: number;
}

class ChromeGL {
  gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private colors: Vec3[];

  constructor(public canvas: HTMLCanvasElement, preserve = false) {
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: preserve, // cuadro fijo (reduced-motion): que el buffer no se descarte
    });
    if (!gl) throw new Error('webgl');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uTime', 'uPtr', 'uPtrAmt', 'uScroll', 'uSeed', 'uScale', 'uDim', 'uAA']) this.u[n] = gl.getUniformLocation(prog, n);
    this.colors = readColors();
    const names = ['cVoid', 'cShadow', 'cSilver', 'cCool', 'cPink', 'cBlue', 'cSand'];
    names.forEach((n, i) => gl.uniform3fv(gl.getUniformLocation(prog, n), this.colors[i]));
  }

  draw(p: DrawParams) {
    const { gl, canvas } = this;
    if (canvas.width !== p.w || canvas.height !== p.h) {
      canvas.width = p.w;
      canvas.height = p.h;
    }
    gl.viewport(0, 0, p.w, p.h);
    gl.uniform2f(this.u.uRes, p.w, p.h);
    gl.uniform1f(this.u.uTime, p.time);
    gl.uniform2f(this.u.uPtr, p.ptr?.[0] ?? 9, p.ptr?.[1] ?? 9);
    gl.uniform1f(this.u.uPtrAmt, p.ptrAmt ?? 0);
    gl.uniform1f(this.u.uScroll, p.scroll ?? 0);
    gl.uniform2f(this.u.uSeed, p.seed?.[0] ?? 0, p.seed?.[1] ?? 0);
    gl.uniform1f(this.u.uScale, p.scale ?? 1.7);
    gl.uniform1f(this.u.uDim, p.dim ?? 0);
    // píxeles gruesos (móvil, portadas chicas): afinar menos las tiras de luz para que no se vean como puntos
    gl.uniform1f(this.u.uAA, Math.min(2.2, Math.max(1, 640 / Math.min(p.w, p.h))));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------------------
   HERO
   --------------------------------------------------------------------------- */
export function mountChromeHero(host: HTMLElement, canvas: HTMLCanvasElement, pointerTarget: HTMLElement = host): boolean {
  let gl: ChromeGL;
  try {
    gl = new ChromeGL(canvas, reduceMotion());
  } catch {
    return false; // sin WebGL: queda el fondo CSS del hero
  }

  const coarse = matchMedia('(pointer: coarse)').matches;
  // Teléfono: hasta DPR 2 (a 1,5 los hilos finos de luz quedaban blandos), pero con un
  // tope de píxeles absoluto; en escritorio el tope sigue en 1,5.
  const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 2 : 1.5);
  const pixelBudget = coarse ? 380_000 : 1_700_000;
  const reduced = reduceMotion();
  // fracción de resolución; arranca en ~0,8 px de canvas por px CSS en teléfono y baja sola si el cuadro se atrasa
  let quality = coarse ? Math.min(0.8, Math.max(0.4, 0.8 / dpr)) : 0.58;
  const minQ = 0.25;
  const maxQ = coarse ? Math.min(0.75, Math.max(0.5, 1 / dpr)) : 0.75;
  let minDt = coarse ? 30 : 15; // ms entre cuadros dibujados (30 fps en móvil, hasta 60 en escritorio)
  let cssW = 1;
  let cssH = 1;
  let t = 9.3; // tiempo del cuadro fijo
  let last = 0;
  let raf = 0;
  let visible = true;
  let live = false;
  let degraded = false; // el teléfono no da abasto ni a 20 fps: queda un cuadro fijo
  let slowWindows = 0;
  const ptr = { x: 9, y: 9, tx: 9, ty: 9, a: 0, ta: 0 };
  const deltas: number[] = []; // intervalos entre callbacks de rAF: si la GPU no da abasto, se estiran
  let vsync = 1000;
  let prevRaf = 0;

  const sizeNow = () => {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
  };
  const frame = (time: number, dim: number) => {
    const s = Math.min(quality * dpr, Math.sqrt(pixelBudget / (cssW * cssH)));
    const portrait = cssH > cssW;
    gl.draw({
      w: Math.max(2, Math.round(cssW * s)),
      h: Math.max(2, Math.round(cssH * s)),
      time,
      ptr: [ptr.x, ptr.y],
      ptrAmt: ptr.a,
      scroll: Math.min(1, window.scrollY / Math.max(1, cssH)),
      seed: [3.1, 1.7],
      scale: portrait ? 1.5 : 1.6,
      dim: dim + (portrait ? 0.2 : 0),
    });
  };
  const dimFor = () => Math.min(0.7, (window.scrollY / Math.max(1, cssH)) * 0.75);

  const reveal = () => {
    if (!live) {
      live = true;
      canvas.classList.add('is-live');
      host.classList.add('is-gl');
    }
  };

  sizeNow();
  frame(t, 0);
  reveal();

  if (reduced) {
    // Cuadro fijo: solo se redibuja si cambia el tamaño.
    new ResizeObserver(() => {
      sizeNow();
      frame(t, 0);
    }).observe(host);
    return true;
  }

  /* ---- Táctil: el dedo abolla el metal, un "dedo fantasma" muestra que se puede y,
     en Android (sin permiso), una inclinación suave del teléfono mueve el reflejo. ---- */
  const touch = { down: false };
  const ghost = { on: false, t0: 0, done: false };
  const tilt = { x: 0, y: 0, live: false };
  const toPtr = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const m = Math.min(r.width, r.height);
    ptr.tx = (e.clientX - r.left - r.width / 2) / m;
    ptr.ty = -(e.clientY - r.top - r.height / 2) / m;
  };
  const stopGhost = () => {
    ghost.on = false;
    ghost.done = true;
  };
  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null || innerWidth > innerHeight) return;
    tilt.x = Math.max(-1, Math.min(1, e.gamma / 40)) * 0.24;
    tilt.y = Math.max(-1, Math.min(1, (e.beta - 55) / 40)) * -0.16;
    tilt.live = true;
  };
  const canTilt =
    coarse && typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission !== 'function';

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const d = prevRaf ? now - prevRaf : 0;
    prevRaf = now;
    if (d > 0 && d < 250) {
      vsync = Math.min(vsync, d);
      deltas.push(d);
    }
    // Resolución adaptativa: si la mediana de rAF supera ~2.2 vsyncs, bajar; si sobra, subir de a poco.
    // Si ya está al mínimo y sigue lento: bajar a 20 fps y, si aun así no alcanza, dejar un cuadro fijo.
    if (deltas.length >= 90) {
      deltas.sort((x, y) => x - y);
      const med = deltas[45];
      deltas.length = 0;
      if (med > Math.max(vsync * 2.2, 24)) {
        if (quality > minQ) quality = Math.max(minQ, quality * 0.8);
        else if (++slowWindows >= 2) {
          slowWindows = 0;
          if (minDt < 50) minDt = 50;
          else {
            degraded = true;
            stop();
            frame(t, dimFor());
            return;
          }
        }
      } else {
        slowWindows = 0;
        if (med < vsync * 1.25 && quality < maxQ) quality = Math.min(maxQ, quality * 1.06);
      }
    }
    if (!last) last = now;
    const dt = now - last;
    if (dt < minDt - 2) return;
    last = now;
    t += Math.min(dt, 100) * 0.00011;
    // Objetivo del puntero: dedo > dedo fantasma > inclinación
    if (!touch.down && ghost.on) {
      const u = (now - ghost.t0) / 2600;
      if (u >= 1) {
        stopGhost();
        ptr.ta = 0;
      } else {
        ptr.tx = 0.26 * Math.cos(u * Math.PI * 1.5 - 0.5);
        ptr.ty = 0.16 * Math.sin(u * Math.PI * 2.2);
        ptr.ta = Math.min(1, Math.sin(u * Math.PI) * 1.6);
      }
    } else if (!touch.down && tilt.live) {
      ptr.tx = tilt.x;
      ptr.ty = tilt.y;
      ptr.ta = 0.5;
    }
    ptr.x += (ptr.tx - ptr.x) * 0.09;
    ptr.y += (ptr.ty - ptr.y) * 0.09;
    ptr.a += (ptr.ta - ptr.a) * 0.05;
    frame(t, dimFor());
  };
  const start = () => {
    if (raf || !visible || document.hidden || degraded) return;
    last = 0;
    prevRaf = 0;
    deltas.length = 0;
    if (canTilt) addEventListener('deviceorientation', onOrient, { passive: true });
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener('deviceorientation', onOrient);
  };

  // Un solo canvas activo a la vez (hero, portadas, moiré): ver active.ts
  const arb = register('hero', start, stop);
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      arb.want(visible);
    },
    { threshold: 0 },
  ).observe(host);

  new ResizeObserver(() => {
    sizeNow();
    if (!raf) frame(t, dimFor());
  }).observe(host);

  pointerTarget.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse') return;
      touch.down = true;
      stopGhost();
      toPtr(e);
      if (ptr.x > 5) {
        ptr.x = ptr.tx;
        ptr.y = ptr.ty;
      }
      ptr.ta = 1;
    },
    { passive: true },
  );
  pointerTarget.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' && !touch.down) return;
      toPtr(e);
      ptr.ta = 1;
    },
    { passive: true },
  );
  const release = () => {
    touch.down = false;
    ptr.ta = 0;
  };
  pointerTarget.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && release(), { passive: true });
  pointerTarget.addEventListener('pointercancel', release, { passive: true });
  pointerTarget.addEventListener('pointerleave', () => (ptr.ta = 0));

  // Dedo fantasma: una sola vez, a los ~3 s si nadie tocó el hero (solo táctil)
  if (coarse) {
    setTimeout(() => {
      if (ghost.done || touch.down || !raf || window.scrollY > cssH * 0.3) return;
      if (ptr.x > 5) {
        ptr.x = 0.3;
        ptr.y = 0;
      }
      ghost.on = true;
      ghost.t0 = performance.now();
    }, 3000);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    host.classList.remove('is-gl');
    canvas.classList.remove('is-live');
    live = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      gl = new ChromeGL(canvas);
      reveal();
      start();
    } catch {
      /* queda el fondo CSS */
    }
  });

  return true;
}

/* ---------------------------------------------------------------------------
   PORTADAS GENERATIVAS (un cuadro por pieza, dibujado en un canvas 2D)
   --------------------------------------------------------------------------- */
let shared: ChromeGL | null | undefined;
function sharedGL(): ChromeGL | null {
  if (shared === undefined) {
    try {
      shared = new ChromeGL(document.createElement('canvas'));
    } catch {
      shared = null;
    }
  }
  return shared;
}

export function drawChromeStill(target: HTMLCanvasElement, seed: [number, number], time: number, scale = 1.5, dim = 0.25): boolean {
  const g = sharedGL();
  const ctx = target.getContext('2d');
  if (!g || !ctx) return false;
  g.draw({ w: target.width, h: target.height, time, seed, scale, ptrAmt: 0, dim });
  ctx.drawImage(g.canvas, 0, 0);
  return true;
}
