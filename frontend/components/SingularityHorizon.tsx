"use client";

import * as React from "react";

/**
 * Singularity Horizon, a black hole with a particle accretion ring, in raw
 * WebGL2.
 *
 * Started from a 21st.dev component and has since been rebuilt around three
 * decisions:
 *   1. The ring is tens of thousands of soft point sprites rather than
 *      billboarded streaks. Streaks read as flat and blocky; points with a
 *      gaussian falloff, gathered into concentric bands, read as a ring of
 *      matter.
 *   2. The disc turns as one rigid body at one slow rate. Real discs shear,
 *      inner orbits run faster, which reads on a hero as the ring tearing
 *      itself apart. The rotation angle is integrated per frame, so easing the
 *      rate can never snap the disc to a new angle.
 *   3. Gravitational lensing is faked, not traced. A real black hole bends
 *      light from the far side of the disc up over the top of the shadow (and
 *      a thinner copy under it). Ray-marching that per pixel is far too heavy
 *      for a canvas this size, so the far-side particles are drawn a second
 *      and third time, remapped onto arcs hugging the body. See `uMode`.
 *
 * Everything renders into an HDR target, gets a bloom pass, and is tone
 * mapped, so dense parts of the ring roll off into white instead of
 * clipping. If the browser can't render to float targets it falls back to an
 * 8-bit target; if it can't make render targets at all it draws straight to
 * the canvas with no bloom.
 *
 * The palette is the buttons' liquid chrome: silver particles with a
 * copper-warm inner edge and a scattering of red/blue dispersion, and a body
 * whose limb is a band of drifting chrome, a metal button's rim at planetary
 * scale.
 *
 * Honours prefers-reduced-motion by rendering a single still frame.
 */

export type SingularityState = {
  title: string;
  status: string;
  accent: string;
  velocity: string;
  intensity: number;
  /** Disc rotation, radians per second, the same rate at every radius. */
  orbit: number;
  /** Camera auto-orbit speed, radians per second. */
  spin: number;
  /** Camera distance from the singularity (the horizon is 4). */
  camDistance: number;
  /** Camera height above the disc plane, in the same units. */
  camHeight: number;
  /**
   * On-screen tilt of the ring, degrees. Positive drops its right-hand side.
   * Implemented as camera roll, which only works because the body is a plain
   * sphere, rolling leaves it looking identical and slants only the ring.
   */
  slant: number;
};

export type SingularityHorizonProps = {
  /** Must be a definite length, the canvas fills this box. */
  height?: string;
  states?: SingularityState[];
  /** Milliseconds each state holds before easing into the next. */
  interval?: number;
  hud?: boolean;
  /** Particles in the ring. Drop it on low-end targets. */
  particles?: number;
  /** Drag to orbit the camera. */
  interactive?: boolean;
  /**
   * Most render pixels allowed, see PIXEL_BUDGET. A dimmed background copy
   * can take far fewer: at 40% opacity under a mask, nobody can tell a
   * lower-resolution ring from a sharp one.
   */
  pixelBudget?: number;
  className?: string;
};

/**
 * Mirror's state. A single one on purpose: cycling between states eased the
 * disc back and forth, which read as the ring moving. With one state nothing
 * about the shot changes except the ring turning.
 *
 * The framing follows the black-hole references: a roll of about -20 degrees
 * so the ring rises to the right, and the camera about 8 degrees above the
 * disc (camHeight 4.9 at distance 35.1). That elevation is what puts the near
 * side of the ring across the lower half of the body and leaves the far side
 * for the lensed arc over the top. Edge-on, there is no arc to see.
 *
 * `spin` is 0 so the camera holds still, a camera orbit around a symmetric
 * disc only ever looked like extra rotation on top of `orbit`.
 */
export const MIRROR_SINGULARITY_STATES: SingularityState[] = [
  {
    title: "Ledger",
    status: "Append-only",
    accent: "#dfe1e6",
    velocity: "0.45c",
    intensity: 1,
    orbit: 0.055,
    spin: 0,
    camDistance: 35.1,
    camHeight: 4.9,
    slant: -20,
  },
];

const styles = [
  "@keyframes sg-hud-in { from { opacity: 0 } to { opacity: 1 } }",
  ".sg-hud-in { animation: sg-hud-in 1.2s ease both }",
  "@media (prefers-reduced-motion: reduce) { .sg-hud-in { animation: none } }",
].join("\n");

const HORIZON = 4;
/**
 * Outer edge of the body's chrome rim and haze, in the same units as HORIZON.
 * Close to HORIZON keeps it a thin edge rather than a halo.
 */
const CORE_QUAD = 4.6;
/** Ring extent, in the same units as HORIZON. */
const DISK_INNER = 5;
const DISK_OUTER = 15;
/**
 * Vertical field of view, deliberately narrow, from far back. A wide lens up
 * close magnifies the stretch of ring between the lens and the body.
 *
 * The body's on-screen size depends on camDistance x tan(FOV / 2). The hero's
 * top-edge calc in app/page.tsx assumes that product stays ~6.19, so change
 * the two together.
 */
const FOV = (20 * Math.PI) / 180;
/**
 * Most render pixels allowed. The hero's canvas box is much bigger than the
 * screen (the body sits in a corner and the ring has to reach the far edge),
 * so at full device resolution the HDR target alone ran past 100MB. Particles
 * are soft sprites; rendering slightly under native and letting CSS scale up
 * costs almost nothing visually.
 */
const PIXEL_BUDGET = 3_200_000;

/**
 * The ring's radial structure: [radius, spread, share]. Particles are drawn
 * from these gaussian bands plus a smooth diffuse base, which is what makes
 * it read as a set of rings with gaps rather than one uniform smear. The hot
 * inner edge is the tightest and brightest, as it is on a real disc.
 */
const RING_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [5.25, 0.12, 1.1],
  [5.8, 0.28, 0.9],
  [6.7, 0.38, 0.8],
  [7.9, 0.22, 0.45],
  [9.1, 0.55, 0.6],
  [10.9, 0.35, 0.35],
  [12.6, 0.9, 0.45],
];
const DIFFUSE_SHARE = 0.9;

/**
 * Framing is set by vertical FOV, so a portrait viewport crops the disc off
 * both sides. Dolly out instead of widening the lens.
 */
function fitFor(aspect: number) {
  return aspect < 1 ? Math.min(1 / aspect, 1.6) : 1;
}

/** Seeded PRNG, so the ring has the same structure on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Six floats per particle: radius, angle, height, spare, size, brightness. */
function buildRing(count: number) {
  const rand = mulberry32(0x6d1e);
  const out = new Float32Array(count * 6);
  const total =
    RING_BANDS.reduce((sum, [, , share]) => sum + share, 0) + DIFFUSE_SHARE;

  for (let i = 0; i < count; i++) {
    let pick = rand() * total;
    let r = DISK_INNER + (DISK_OUTER - DISK_INNER) * Math.pow(rand(), 1.7);
    for (const [radius, spread, share] of RING_BANDS) {
      if (pick < share) {
        r = radius + gaussian(rand) * spread;
        break;
      }
      pick -= share;
    }
    r = Math.min(DISK_OUTER, Math.max(DISK_INNER, r));

    // A thin sheet that flares slightly outward.
    const height = gaussian(rand) * (0.03 + 0.012 * (r - DISK_INNER));

    // Mostly fine dust, some grains, a few bright motes.
    const roll = rand();
    let size: number;
    let brightness = 0.24 + rand() * rand() * 0.7;
    if (roll < 0.88) size = 0.8 + rand() * 1.0;
    else if (roll < 0.985) size = 1.8 + rand() * 1.3;
    else {
      size = 3.2 + rand() * 1.8;
      brightness *= 1.8;
    }

    const o = i * 6;
    out[o] = r;
    out[o + 1] = rand() * Math.PI * 2;
    out[o + 2] = height;
    out[o + 3] = rand();
    out[o + 4] = size;
    out[o + 5] = brightness;
  }
  return out;
}

const PARTICLE_VERT = `#version 300 es
precision highp float;

in vec4 aSeed;            // x radius, y start angle, z height, w spare random
in vec2 aLook;            // x size in CSS px at the body's depth, y brightness

uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCam;
uniform float uPhase;     // integrated disc rotation, radians
uniform float uIntensity;
uniform float uPx;        // render pixels per CSS pixel
uniform float uRefDepth;  // camera distance: sizes are exact at the body's depth
uniform float uMaxPoint;
uniform float uHorizon;
uniform float uDiskIn;
uniform float uDiskOut;
uniform int uMode;        // 0 direct, 1 lensed over the top, 2 lensed underneath

out vec3 vColor;
out float vAlpha;

void main() {
  float r = aSeed.x;
  float angle = aSeed.y + uPhase;
  vec3 p = vec3(cos(angle) * r, aSeed.z, sin(angle) * r);

  // The camera's screen axes before roll. The lensed arcs are laid out in
  // these, so the view's roll tilts them along with the ring.
  vec3 z = normalize(uCam);
  float hl = length(z.xz);
  vec3 x0 = hl > 1e-5 ? vec3(z.z, 0.0, -z.x) / hl : vec3(1.0, 0.0, 0.0);
  vec3 y0 = cross(z, x0);
  vec3 toward = hl > 1e-5 ? vec3(z.x, 0.0, z.z) / hl : vec3(0.0, 0.0, 1.0);

  // Matter swinging toward the camera brightens.
  vec3 tangent = vec3(-sin(angle), 0.0, cos(angle));
  float doppler = dot(tangent, normalize(uCam - p));

  float lens = 1.0;
  if (uMode != 0) {
    // Only the far half of the disc has a lensed image.
    if (dot(p, toward) >= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 1.0;
      vColor = vec3(0.0);
      vAlpha = 0.0;
      return;
    }
    // Where the particle sits across the disc, -1 at one extreme to 1 at the
    // other. Directly behind the body maps to the top of the arc; the two
    // extremes map to where the arc comes down to meet the ring itself.
    float u = clamp(dot(p, x0) / r, -1.0, 1.0);
    float c = sqrt(max(1.0 - u * u, 0.0));
    float span = r - uDiskIn;
    // The arcs sit in the plane through the body's centre facing the camera,
    // always just outside the horizon radius, so they never land on the body.
    if (uMode == 1) {
      float rho = uHorizon * 1.04 + span * 0.2 + aSeed.z * 0.5;
      p = x0 * (rho * u) + y0 * (rho * c);
      lens = 0.6;
    } else {
      float rho = uHorizon * 1.012 + span * 0.045;
      p = x0 * (rho * u) - y0 * (rho * c);
      lens = 0.22;
    }
    // Ease the arc's ends out where they meet the direct image of the ring,
    // or the join doubles up into a bright knot.
    lens *= 1.0 - 0.7 * pow(abs(u), 6.0);
  }

  // Chrome: a copper-warm white at the inner edge, the primary button's
  // tint, through polished silver out to dull gunmetal.
  float t = clamp((r - uDiskIn) / (uDiskOut - uDiskIn), 0.0, 1.0);
  vec3 hot = vec3(1.0, 0.9, 0.8);
  vec3 mid = vec3(0.86, 0.88, 0.92);
  vec3 cool = vec3(0.3, 0.31, 0.35);
  vec3 color = mix(hot, mid, smoothstep(0.0, 0.12, t));
  color = mix(color, cool, smoothstep(0.12, 1.0, t));
  // The liquid-metal shader splits its highlights into red and blue fringes.
  // A few particles carry the same split, so the ring shares that shimmer.
  if (aSeed.w < 0.03) color *= vec3(1.0, 0.6, 0.56);
  else if (aSeed.w > 0.97) color *= vec3(0.6, 0.76, 1.0);
  vColor = color;

  vec4 clip = uProj * uView * vec4(p, 1.0);
  gl_Position = clip;

  float raw = aLook.x * uPx * uRefDepth / max(clip.w, 0.1);
  gl_PointSize = clamp(raw, 1.0, uMaxPoint);
  // A point narrower than a pixel still rasterises a whole pixel, so dim it
  // by the area it didn't have.
  float cover = raw < 1.0 ? raw * raw : 1.0;

  float radial = mix(1.5, 0.35, t);
  float beam = 1.0 + 0.55 * doppler;
  vAlpha = aLook.y * radial * beam * lens * cover * uIntensity;
}
`;

const PARTICLE_FRAG = `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
out vec4 outColor;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 3.2) * vAlpha;
  outColor = vec4(vColor * a, a);
}
`;

const CORE_VERT = `#version 300 es
precision highp float;

in vec2 aCorner;

uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uSize;

out vec2 vCorner;

void main() {
  vCorner = aCorner;
  vec3 pos = uRight * aCorner.x * uSize + uUp * aCorner.y * uSize;
  gl_Position = uProj * uView * vec4(pos, 1.0);
}
`;

// One shader draws the horizon twice: an opaque body that occludes the far
// side of the ring, then a faint additive rim on top of it.
const CORE_FRAG = `#version 300 es
precision highp float;

in vec2 vCorner;

uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;    // origin toward the camera
uniform float uSize;
uniform float uHorizon;
uniform float uIntensity;
uniform float uTime;
uniform bool uGlow;

out vec4 outColor;

void main() {
  float d = length(vCorner) * uSize;

  if (uGlow) {
    // The quad's corners reach past uSize, where edge would exceed 1 and pow()
    // below would be handed a negative base, undefined in GLSL, and it came
    // out as solid white wedges.
    if (d < uHorizon || d > uSize) discard;
    /*
     * The body's edge is the buttons' rim at planetary scale: a thin band of
     * liquid chrome hugging the limb, its highlights drifting slowly round,
     * with red and blue sampled a little apart for the same dispersion. A
     * very faint silver haze outside it keeps the dark body separate from a
     * black page.
     */
    float edge = clamp((d - uHorizon) / (uSize - uHorizon), 0.0, 1.0);
    float band = smoothstep(0.0, 0.05, edge) * (1.0 - smoothstep(0.1, 0.24, edge));
    float haze = pow(1.0 - edge, 6.0) * 0.1;

    float ang = atan(vCorner.y, vCorner.x);
    float warp = sin(ang * 3.0 + uTime * 0.35) * 0.4;
    float phase = ang * 5.0 + warp + uTime * 0.22;
    vec3 stripes = 0.5 + 0.5 * vec3(sin(phase + 0.2), sin(phase), sin(phase - 0.2));
    vec3 chrome = pow(stripes, vec3(5.0)) * 1.05 + 0.08;

    vec3 color = chrome * band * uIntensity + vec3(0.84, 0.86, 0.9) * haze;
    gl_FragDepth = gl_FragCoord.z;
    outColor = vec4(color, max(band, haze));
    return;
  }

  if (d > uHorizon) discard;

  // The quad is flat but the horizon is a sphere, and the near side of the
  // ring has to pass in front of it. Bulge the depth per fragment.
  float bulge = sqrt(max(uHorizon * uHorizon - d * d, 0.0));
  vec3 pos = uRight * vCorner.x * uSize + uUp * vCorner.y * uSize + uForward * bulge;
  vec4 clip = uProj * uView * vec4(pos, 1.0);
  gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;

  // A plain dark body, lit only where it curves away at the limb, so it reads
  // as a sphere rather than a flat black cut-out.
  vec3 n = normalize(pos);
  float facing = pow(1.0 - abs(dot(n, normalize(uForward))), 3.0);
  vec3 silver = vec3(0.78, 0.8, 0.85);
  outColor = vec4(mix(vec3(0.012, 0.012, 0.014), silver * 0.22, facing), 1.0);
}
`;

const SCREEN_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/** Downsample to the bloom target, keeping only what's brighter than uThreshold. */
const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = (texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
          + texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb
          + texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb
          + texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  c *= max(0.0, l - uThreshold) / max(l, 1e-4);
  outColor = vec4(c, 1.0);
}
`;

/** Separable gaussian, five taps placed between texels to get nine. */
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uStep;
void main() {
  vec3 s = texture(uTex, vUv).rgb * 0.2270270;
  s += (texture(uTex, vUv + uStep * 1.3846154).rgb
      + texture(uTex, vUv - uStep * 1.3846154).rgb) * 0.3162162;
  s += (texture(uTex, vUv + uStep * 3.2307692).rgb
      + texture(uTex, vUv - uStep * 3.2307692).rgb) * 0.0702702;
  outColor = vec4(s, 1.0);
}
`;

/**
 * Scene plus bloom, then an exponential tone map: faint colour passes through
 * close to as authored, while the dense inner ring rolls off to white-gold
 * instead of clipping flat.
 */
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
  c = vec3(1.0) - exp(-c * uExposure);
  outColor = vec4(c, 1.0);
}
`;

function compile(
  gl: WebGL2RenderingContext,
  vert: string,
  frag: string,
  attribs: Record<string, number> = {},
) {
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vert],
    [gl.FRAGMENT_SHADER, frag],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("singularity-horizon:", gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  for (const [name, location] of Object.entries(attribs)) {
    gl.bindAttribLocation(program, location, name);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("singularity-horizon:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function perspective(
  out: Float32Array,
  fovy: number,
  aspect: number,
  near: number,
  far: number,
) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}

/**
 * Look at the origin, rolled `roll` radians about the view axis. Also writes
 * the camera basis the billboards need.
 */
function lookAtOrigin(
  out: Float32Array,
  eye: number[],
  roll: number,
  right: number[],
  up: number[],
  forward: number[],
) {
  const len = Math.hypot(eye[0], eye[1], eye[2]) || 1;
  const z = [eye[0] / len, eye[1] / len, eye[2] / len];
  const flat = Math.hypot(z[2], z[0]);
  const x0 = flat > 1e-5 ? [z[2] / flat, 0, -z[0] / flat] : [1, 0, 0];
  const y0 = [
    z[1] * x0[2] - z[2] * x0[1],
    z[2] * x0[0] - z[0] * x0[2],
    z[0] * x0[1] - z[1] * x0[0],
  ];
  // Rotate the screen axes about the view axis. A point on the ring's
  // right-hand end lands at (cos, -sin) of its old screen position, so a
  // positive roll drops that end.
  const c = Math.cos(roll);
  const sn = Math.sin(roll);
  const x = [0, 1, 2].map((i) => c * x0[i] + sn * y0[i]);
  const y = [0, 1, 2].map((i) => -sn * x0[i] + c * y0[i]);
  out.set([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]);
  for (let i = 0; i < 3; i++) {
    right[i] = x[i];
    up[i] = y[i];
    forward[i] = z[i];
  }
}

type Target = {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  depth: WebGLRenderbuffer | null;
  w: number;
  h: number;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export function SingularityHorizon({
  height = "100svh",
  states = MIRROR_SINGULARITY_STATES,
  interval = 12000,
  hud = false,
  particles = 64000,
  interactive = false,
  pixelBudget = PIXEL_BUDGET,
  className = "",
}: SingularityHorizonProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [generation, setGeneration] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  // WebGL setup (shader compile, tens of thousands of particles built on the
  // CPU) is the heaviest thing a page does, and running it in the same task
  // as navigation held the new page's first paint back and stuttered the
  // route change. It waits for an idle moment instead, after the page has
  // painted, and the canvas fades in once its first frame is drawn.
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 600 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setReady(true), 120);
    return () => window.clearTimeout(id);
  }, []);

  const cycle = states.length ? states : MIRROR_SINGULARITY_STATES;
  const current = cycle[index % cycle.length];

  // The render loop reads the target through a ref, so a state change never
  // restarts WebGL. Assigned in an effect, not during render.
  const targetRef = React.useRef(current);
  React.useEffect(() => {
    targetRef.current = current;
  }, [current]);

  React.useEffect(() => {
    if (reduced || cycle.length < 2 || interval <= 0) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % cycle.length),
      interval,
    );
    return () => window.clearInterval(id);
  }, [reduced, cycle.length, interval]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: true,
      powerPreference: "high-performance",
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    const SCREEN = { aPos: 0 };
    const particleProgram = compile(gl, PARTICLE_VERT, PARTICLE_FRAG);
    const coreProgram = compile(gl, CORE_VERT, CORE_FRAG);
    const brightProgram = compile(gl, SCREEN_VERT, BRIGHT_FRAG, SCREEN);
    const blurProgram = compile(gl, SCREEN_VERT, BLUR_FRAG, SCREEN);
    const compositeProgram = compile(gl, SCREEN_VERT, COMPOSITE_FRAG, SCREEN);
    if (!particleProgram || !coreProgram) {
      setFailed(true);
      return;
    }
    const canPost = !!(brightProgram && blurProgram && compositeProgram);

    // --- geometry ---------------------------------------------------------
    const count = Math.max(1, Math.round(particles));
    const ring = buildRing(count);

    const ringBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ringBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ring, gl.STATIC_DRAW);
    const ringVao = gl.createVertexArray();
    gl.bindVertexArray(ringVao);
    const aSeed = gl.getAttribLocation(particleProgram, "aSeed");
    const aLook = gl.getAttribLocation(particleProgram, "aLook");
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aLook);
    gl.vertexAttribPointer(aLook, 2, gl.FLOAT, false, 24, 16);

    const cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const coreVao = gl.createVertexArray();
    gl.bindVertexArray(coreVao);
    const aCorner = gl.getAttribLocation(coreProgram, "aCorner");
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

    // One oversized triangle covers the screen for every post pass.
    const screenBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, screenBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const screenVao = gl.createVertexArray();
    gl.bindVertexArray(screenVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // --- uniforms ---------------------------------------------------------
    const u = (program: WebGLProgram | null, name: string) =>
      program ? gl.getUniformLocation(program, name) : null;
    const pU = {
      proj: u(particleProgram, "uProj"),
      view: u(particleProgram, "uView"),
      cam: u(particleProgram, "uCam"),
      phase: u(particleProgram, "uPhase"),
      intensity: u(particleProgram, "uIntensity"),
      px: u(particleProgram, "uPx"),
      refDepth: u(particleProgram, "uRefDepth"),
      maxPoint: u(particleProgram, "uMaxPoint"),
      horizon: u(particleProgram, "uHorizon"),
      diskIn: u(particleProgram, "uDiskIn"),
      diskOut: u(particleProgram, "uDiskOut"),
      mode: u(particleProgram, "uMode"),
    };
    const cU = {
      proj: u(coreProgram, "uProj"),
      view: u(coreProgram, "uView"),
      right: u(coreProgram, "uRight"),
      up: u(coreProgram, "uUp"),
      forward: u(coreProgram, "uForward"),
      size: u(coreProgram, "uSize"),
      horizon: u(coreProgram, "uHorizon"),
      intensity: u(coreProgram, "uIntensity"),
      time: u(coreProgram, "uTime"),
      glow: u(coreProgram, "uGlow"),
    };
    const bU = {
      tex: u(brightProgram, "uTex"),
      texel: u(brightProgram, "uTexel"),
      threshold: u(brightProgram, "uThreshold"),
    };
    const blU = { tex: u(blurProgram, "uTex"), step: u(blurProgram, "uStep") };
    const kU = {
      scene: u(compositeProgram, "uScene"),
      bloom: u(compositeProgram, "uBloom"),
      strength: u(compositeProgram, "uBloomStrength"),
      exposure: u(compositeProgram, "uExposure"),
    };

    const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as
      | Float32Array
      | null;
    const maxPoint = pointRange ? Math.max(1, pointRange[1]) : 64;

    // --- render targets ---------------------------------------------------
    // Float targets let the additive ring go past 1.0 and be tone mapped
    // instead of clipped. WebGL2 can sample them, but rendering into them
    // needs this extension.
    const floatOk = !!gl.getExtension("EXT_color_buffer_float");
    const internal = floatOk ? gl.RGBA16F : gl.RGBA8;
    const texType = floatOk ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    const makeTarget = (w: number, h: number, withDepth: boolean) => {
      const tex = gl.createTexture();
      const fb = gl.createFramebuffer();
      if (!tex || !fb) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, texType, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0,
      );
      let depth: WebGLRenderbuffer | null = null;
      if (withDepth) {
        depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          gl.DEPTH_ATTACHMENT,
          gl.RENDERBUFFER,
          depth,
        );
      }
      const ok =
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fb);
        if (depth) gl.deleteRenderbuffer(depth);
        return null;
      }
      return { fb, tex, depth, w, h } satisfies Target;
    };
    const dropTarget = (t: Target | null) => {
      if (!t) return;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
      if (t.depth) gl.deleteRenderbuffer(t.depth);
    };

    let scene: Target | null = null;
    let bloomA: Target | null = null;
    let bloomB: Target | null = null;
    let post = false;

    const proj = new Float32Array(16);
    const view = new Float32Array(16);
    const right = [1, 0, 0];
    const up = [0, 1, 0];
    const forward = [0, 0, 1];

    const start = targetRef.current;
    const eased = {
      intensity: start.intensity,
      orbit: start.orbit,
      spin: start.spin,
      distance: start.camDistance,
      height: start.camHeight,
      slant: start.slant,
    };
    let theta = Math.PI * 0.25;
    let heightOffset = 0;
    let phase = 0;
    // Drives the drift of the chrome rim's highlights. Frozen under reduced
    // motion, like the rotation.
    let time = 0;
    let last = 0;
    let raf = 0;
    let pxScale = 1;
    let sizedW = 0;
    let sizedH = 0;
    // Dynamic resolution. The same ring that holds 60fps on a desktop GPU
    // can drop a laptop's integrated one into the 20s, and a slow canvas
    // starves scrolling and every other animation on the page with it. So
    // the loop watches its own frame time: sustained slow frames step the
    // render scale down, sustained headroom steps it back up. Soft sprites
    // hide the difference well; a stutter can't be hidden.
    let quality = 1;
    let avgDt = 1 / 60;
    let lastQualityChange = 0;

    const resize = () => {
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      pxScale = Math.min(dpr, Math.sqrt(pixelBudget / (cssW * cssH))) * quality;
      const w = Math.max(1, Math.round(cssW * pxScale));
      const h = Math.max(1, Math.round(cssH * pxScale));
      // Keyed on the size attempted, not on success: if the targets can't be
      // made at this size, retrying every frame would only reset the canvas
      // every frame too.
      if (w === sizedW && h === sizedH) return;
      sizedW = w;
      sizedH = h;
      canvas.width = w;
      canvas.height = h;

      dropTarget(scene);
      dropTarget(bloomA);
      dropTarget(bloomB);
      scene = bloomA = bloomB = null;
      post = false;
      if (!canPost) return;

      const bw = Math.max(1, w >> 2);
      const bh = Math.max(1, h >> 2);
      scene = makeTarget(w, h, true);
      bloomA = makeTarget(bw, bh, false);
      bloomB = makeTarget(bw, bh, false);
      post = !!(scene && bloomA && bloomB);
    };

    const screenPass = (program: WebGLProgram, target: Target | null) => {
      gl.useProgram(program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
      gl.bindVertexArray(screenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const bindTex = (tex: WebGLTexture, unit: number) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };

    const draw = (now: number) => {
      raf = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      // Only a running loop has a frame rate to judge; reduced motion draws
      // on demand, where the gaps between frames mean nothing.
      if (!reduced) avgDt += (dt - avgDt) * 0.05;
      if (!lastQualityChange) lastQualityChange = now;
      const sinceChange = now - lastQualityChange;
      if (!reduced && avgDt > 1 / 45 && quality > 0.45 && sinceChange > 1200) {
        quality = Math.max(0.45, quality * 0.82);
        lastQualityChange = now;
      } else if (!reduced && avgDt < 1 / 57 && quality < 1 && sinceChange > 5000) {
        quality = Math.min(1, quality * 1.1);
        lastQualityChange = now;
      }
      resize();

      if (!reduced) {
        // Exponential approach, a tween library's job, in one line each.
        const k = 1 - Math.exp(-dt / 1.2);
        const t = targetRef.current;
        eased.intensity += (t.intensity - eased.intensity) * k;
        eased.orbit += (t.orbit - eased.orbit) * k;
        eased.spin += (t.spin - eased.spin) * k;
        eased.distance += (t.camDistance - eased.distance) * k;
        eased.height += (t.camHeight - eased.height) * k;
        eased.slant += (t.slant - eased.slant) * k;
        phase += eased.orbit * dt;
        time += dt;
        theta += eased.spin * dt;
      }

      const aspect = canvas.width / canvas.height;
      const fit = fitFor(aspect);
      const distance = eased.distance * fit;
      const camY = Math.max(
        -distance * 0.9,
        Math.min(distance * 0.9, eased.height * fit + heightOffset),
      );
      const radius = Math.sqrt(Math.max(distance * distance - camY * camY, 16));
      const eye = [Math.cos(theta) * radius, camY, Math.sin(theta) * radius];

      perspective(proj, FOV, aspect, 0.1, 1000);
      lookAtOrigin(view, eye, (eased.slant * Math.PI) / 180, right, up, forward);

      // --- scene ----------------------------------------------------------
      gl.bindFramebuffer(gl.FRAMEBUFFER, post && scene ? scene.fb : null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);

      // 1. Opaque body, depth written so it eclipses the far side.
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.useProgram(coreProgram);
      gl.bindVertexArray(coreVao);
      gl.uniformMatrix4fv(cU.proj, false, proj);
      gl.uniformMatrix4fv(cU.view, false, view);
      gl.uniform3fv(cU.right, right);
      gl.uniform3fv(cU.up, up);
      gl.uniform3fv(cU.forward, forward);
      gl.uniform1f(cU.size, CORE_QUAD);
      gl.uniform1f(cU.horizon, HORIZON);
      gl.uniform1f(cU.intensity, eased.intensity);
      gl.uniform1f(cU.time, time);
      gl.uniform1i(cU.glow, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 2. The ring, additive and depth-tested against the body: direct image,
      //    then the lensed arcs over and under it.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      gl.useProgram(particleProgram);
      gl.bindVertexArray(ringVao);
      gl.uniformMatrix4fv(pU.proj, false, proj);
      gl.uniformMatrix4fv(pU.view, false, view);
      gl.uniform3fv(pU.cam, eye);
      gl.uniform1f(pU.phase, phase);
      gl.uniform1f(pU.intensity, eased.intensity);
      gl.uniform1f(pU.px, pxScale);
      gl.uniform1f(pU.refDepth, distance);
      gl.uniform1f(pU.maxPoint, maxPoint);
      gl.uniform1f(pU.horizon, HORIZON);
      gl.uniform1f(pU.diskIn, DISK_INNER);
      gl.uniform1f(pU.diskOut, DISK_OUTER);
      for (const mode of [0, 1, 2]) {
        gl.uniform1i(pU.mode, mode);
        gl.drawArrays(gl.POINTS, 0, count);
      }

      // 3. Faint rim, always on top.
      gl.disable(gl.DEPTH_TEST);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(coreProgram);
      gl.bindVertexArray(coreVao);
      gl.uniform1i(cU.glow, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);

      // --- bloom + tone map -------------------------------------------------
      if (post && scene && bloomA && bloomB && brightProgram && blurProgram && compositeProgram) {
        gl.useProgram(brightProgram);
        bindTex(scene.tex, 0);
        gl.uniform1i(bU.tex, 0);
        gl.uniform2f(bU.texel, 1 / scene.w, 1 / scene.h);
        gl.uniform1f(bU.threshold, 0.22);
        screenPass(brightProgram, bloomA);

        gl.useProgram(blurProgram);
        gl.uniform1i(blU.tex, 0);
        for (const spread of [1, 2.2]) {
          bindTex(bloomA.tex, 0);
          gl.uniform2f(blU.step, spread / bloomA.w, 0);
          screenPass(blurProgram, bloomB);
          bindTex(bloomB.tex, 0);
          gl.uniform2f(blU.step, 0, spread / bloomB.h);
          screenPass(blurProgram, bloomA);
        }

        gl.useProgram(compositeProgram);
        bindTex(scene.tex, 0);
        bindTex(bloomA.tex, 1);
        gl.uniform1i(kU.scene, 0);
        gl.uniform1i(kU.bloom, 1);
        gl.uniform1f(kU.strength, 1.3);
        gl.uniform1f(kU.exposure, 1.4);
        screenPass(compositeProgram, null);
      }
      gl.bindVertexArray(null);

      if (!shown) {
        shown = true;
        canvas.style.opacity = "1";
      }
      if (!reduced && onScreen) raf = requestAnimationFrame(draw);
    };

    // Under reduced motion nothing loops: frames are drawn on demand.
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    let shown = false;
    // Off screen, the loop stops outright. On inner pages the planet is
    // scrolled away within a screen, and drawing a full HDR frame plus bloom
    // every vsync behind content nobody can see was most of the page's GPU
    // time, time the browser needed for scrolling. `last` is reset so the
    // first frame back doesn't jump by the time spent away.
    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) {
        last = 0;
        kick();
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    visibility.observe(canvas);
    kick();

    const observer = new ResizeObserver(kick);
    observer.observe(canvas);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      if (!interactive) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      heightOffset = Math.max(
        -30,
        Math.min(30, heightOffset + (e.clientY - lastY) * 0.15),
      );
      lastX = e.clientX;
      lastY = e.clientY;
      kick();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
    };
    // A lost context leaves a permanently black canvas unless the whole setup
    // runs again, so ask for the restore and rebuild on the next generation.
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onRestored = () => setGeneration((g) => g + 1);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      visibility.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      dropTarget(scene);
      dropTarget(bloomA);
      dropTarget(bloomB);
      for (const program of [
        particleProgram,
        coreProgram,
        brightProgram,
        blurProgram,
        compositeProgram,
      ]) {
        if (program) gl.deleteProgram(program);
      }
      gl.deleteBuffer(ringBuffer);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteBuffer(screenBuffer);
      gl.deleteVertexArray(ringVao);
      gl.deleteVertexArray(coreVao);
      gl.deleteVertexArray(screenVao);
    };
  }, [particles, interactive, reduced, generation, ready, pixelBudget]);

  return (
    <div
      className={`relative w-full overflow-hidden bg-bg ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <style>{styles}</style>

      {failed ? (
        // No WebGL2: a still of the same subject beats an empty black box.
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, #000 12%, rgba(223,225,230,0.5) 13%, rgba(223,225,230,0.14) 22%, rgba(60,62,68,0.2) 45%, #000 70%)",
          }}
        />
      ) : (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`absolute inset-0 block h-full w-full opacity-0 transition-opacity duration-700 ease-out motion-reduce:transition-none ${
            interactive ? "cursor-grab touch-none active:cursor-grabbing" : ""
          }`}
        />
      )}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {hud && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
          <div key={index} className="sg-hud-in text-center">
            <div className="mb-3 text-[0.8rem] font-light uppercase tracking-[0.5em] opacity-90">
              {current.title}
            </div>
            <div
              className="inline-block rounded-full border px-5 py-1.5 text-[0.6rem] uppercase tracking-[0.25em]"
              style={{
                color: current.accent,
                borderColor: current.accent,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {current.status}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
