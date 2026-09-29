"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/components/MetalButton";
import { ringProjector, type RingProjector } from "@/components/SingularityHorizon";

/**
 * Stars are chrome on black; on paper the same field has to be ink, or the
 * canvas paints white specks onto a white page. Read from the token so the
 * two themes can never drift apart — resolved once per mount, not per frame:
 * getComputedStyle inside the loop forces a style recalculation every frame.
 */
function starColor(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--particle-ink")
      .trim() || "#dfe1e6"
  );
}

/** "#rrggbb" to its channels, for gradient stops that fade to nothing. */
function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [223, 225, 230];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Star = {
  /** Where it comes to rest, as a fraction of the viewport. */
  x: number;
  y: number;
  /** 0 far .. 1 near. Near stars are larger and brighter and slide further
   *  with the scroll, so size, light and motion agree about depth. */
  depth: number;
  size: number;
  minOpacity: number;
  maxOpacity: number;
  duration: number;
  delay: number;
  /** Where in the 0–1 scroll range this star leaves the ring, staggered so
   *  the field peels off in a stream rather than all on one frame. */
  startAt: number;
  /** Seconds this star takes to catch up with the scroll, different per
   *  star, so a single flick sends them out as a drifting cloud rather than
   *  a rigid pattern moving in lockstep. */
  glide: number;
  /** Its slow wander around the landing point: radius in px, angular speed
   *  in rad/s, and where on that loop it starts. */
  driftR: number;
  driftW: number;
  driftPhase: number;
  /** The disc radius (world units) it's shed from, inner bands favoured. */
  ringR: number;
  /** Where on screen it leaves the ring, relative to the body's centre in
   *  page space. Measured from the ring's own projection (placeLaunches). */
  launchX: number;
  launchY: number;
  /** A few of the nearest stars flare with diffraction spikes now and then. */
  glint: boolean;
  glintPeriod: number;
  glintPhase: number;
  /** A few burn a touch cooler, blue-white, on black only. */
  cool: boolean;
  /** A few are more than a point: a pulsar flashing on a steady beat, or a
   *  close pair circling each other. */
  kind: "star" | "pulsar" | "pair";
  /** Seconds per beat (pulsar) or per orbit (pair). */
  beat: number;
  /** A pair's separation, px. */
  pairGap: number;
  /** Where in its beat or orbit it starts. */
  phase: number;
  /** The fast shimmer of the brighter stars, two phases. */
  shimmerA: number;
  shimmerB: number;
};

const STAR_COUNT = 200;
/** Fewer on the inner pages, where the field is atmosphere behind tables. */
const AMBIENT_COUNT = 150;
const GLINTS = 6;
const PULSARS = 3;
const PAIRS = 5;
/** How far a near star slides per pixel scrolled. */
const PARALLAX = 0.12;
/** Extra swirl on each path from ring to rest, zero at both ends. */
const CURL = 0.6;
/** A ledger chain: each link's draw time, the hold, and the fade. */
const LINK_MS = 420;
const CHAIN_HOLD_MS = 2600;
const CHAIN_FADE_MS = 1300;
/**
 * The current the settled field rides: the curl of a stream function made
 * of a few slow travelling waves, so it swirls in broad eddies without ever
 * bunching stars up or thinning them out (a curl has no divergence). Wave
 * numbers per px, angular speeds per second.
 */
const FLOW = [
  { kx: 0.0046, ky: 0.0021, w: 0.041, p: 0.3, a: 1 },
  { kx: -0.0024, ky: 0.0052, w: -0.033, p: 1.9, a: 0.8 },
  { kx: 0.0061, ky: -0.0038, w: 0.027, p: 4.2, a: 0.5 },
];
const FLOW_NORM = FLOW.reduce((sum, f) => sum + f.a * Math.hypot(f.kx, f.ky), 0);
/** px/s along the current, and around the singularity, at the nearest stars. */
const FLOW_SPEED = 11;
const ORBIT_SPEED = 3;
/** Ripples from the singularity: speed px/s, thickness px, push px. */
const WAVE_SPEED = 460;
const WAVE_WIDTH = 70;
const WAVE_PUSH = 7;


type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  length: number;
};

/** A spark drifting off the ring while the page sits at the top. Position
 *  and velocity are relative to the body's centre, so it rides the ring. */
type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
};

type Chain = { nodes: number[]; start: number; fadeFrom: number | null };

/** Mirrors SingularityHorizon's own dolly-out on a portrait canvas. */
function fitFor(aspect: number) {
  return aspect < 1 ? Math.min(1 / aspect, 1.6) : 1;
}

/** The body's on-screen radius as a fraction of the hero box's height:
 *  HORIZON (4) over the vertical span the camera frames, 2 x 35.1 x tan(10°). */
const BODY_RADIUS_FRACTION = 4 / 12.38;

type Ring = {
  /** The body's centre, in page coordinates (scroll-independent). */
  cx: number;
  cy: number;
  radius: number;
  /** The hero canvas box, in page coordinates, and its projection. */
  left: number;
  top: number;
  width: number;
  height: number;
  project: RingProjector | null;
  /** Below this page y the hero canvas is masked away (.hero-fade). */
  fadeY: number;
};

/**
 * Where the hero's body and ring sit, in PAGE coordinates. The box sits in
 * page flow, so this only changes on resize; it's measured then, and each
 * frame subtracts the scroll offset instead of reading layout per frame.
 */
function measureRing(): Ring {
  const el = document.querySelector(".hero-canvas-mask");
  if (!el) {
    // Only before the hero has mounted, or on a page without one.
    return {
      cx: window.innerWidth * 0.15,
      cy: window.innerHeight * 0.47,
      radius: window.innerHeight * 0.45,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      project: null,
      fadeY: Infinity,
    };
  }
  const rect = el.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  // .hero-fade's mask starts at 74% of the box on a phone, 82% from sm up.
  const fadeAt = window.innerWidth >= 640 ? 0.82 : 0.74;
  return {
    cx: rect.left + rect.width / 2,
    cy: top + rect.height / 2,
    radius: (rect.height * BODY_RADIUS_FRACTION) / fitFor(rect.width / rect.height),
    left: rect.left,
    top,
    width: rect.width,
    height: rect.height,
    project: ringProjector(rect.width, rect.height),
    fadeY: top + rect.height * fadeAt,
  };
}

/**
 * Random per star, generated client-side after mount rather than during
 * render, so server and client never disagree about where a star is.
 */
function generateStars(count: number): Star[] {
  const stars = Array.from({ length: count }, (): Star => {
    const depth = Math.random();
    const near = depth ** 1.7;
    const base = 0.12 + depth * 0.5 + Math.random() * 0.12;
    return {
      x: Math.random(),
      y: Math.random(),
      depth,
      size: 0.7 + near * 2.5 + Math.random() * 0.3,
      minOpacity: base * 0.4,
      maxOpacity: Math.min(1, base * 1.6),
      duration: 2.4 + Math.random() * 4.5,
      delay: -Math.random() * 6,
      startAt: Math.random() * 0.45,
      glide: 0.35 + Math.random() * 0.6,
      driftR: 2 + Math.random() * 7,
      driftW: (2 * Math.PI) / (18 + Math.random() * 24),
      driftPhase: Math.random() * Math.PI * 2,
      ringR: 5.25 + Math.random() ** 1.6 * 7,
      launchX: 0,
      launchY: 0,
      glint: false,
      glintPeriod: 5 + Math.random() * 5,
      glintPhase: Math.random() * 10,
      cool: Math.random() < 0.12,
      kind: "star",
      beat: 1,
      pairGap: 0,
      phase: Math.random() * 20,
      shimmerA: Math.random() * Math.PI * 2,
      shimmerB: Math.random() * Math.PI * 2,
    };
  });
  // The nearest few carry the flare.
  [...stars]
    .sort((a, b) => b.depth - a.depth)
    .slice(0, GLINTS)
    .forEach((star) => {
      star.glint = true;
    });
  // A few pulsars at middling depth, and a few close pairs among the nearer
  // stars, never the same star as a glint.
  const free = stars.filter((star) => !star.glint);
  free
    .filter((star) => star.depth > 0.35 && star.depth < 0.8)
    .slice(0, PULSARS)
    .forEach((star) => {
      star.kind = "pulsar";
      star.beat = 1.3 + Math.random() * 1.2;
    });
  free
    .filter((star) => star.kind === "star" && star.depth > 0.3)
    .slice(0, PAIRS)
    .forEach((star) => {
      star.kind = "pair";
      star.beat = 7 + Math.random() * 7;
      star.pairGap = 3.5 + Math.random() * 2.5;
    });
  return stars;
}

/** A visible point of the ring, relative to the body's centre in page
 *  space: on the disc at radius r and angle `angle`, or on the lensed arc
 *  over the top. Null if it lands hidden, off screen or in the masked-out
 *  foot of the hero. */
function ringPoint(ring: Ring, r: number, angle: number, onArc: boolean, vw: number) {
  const p = ring.project;
  if (!p) return null;
  const s = onArc ? p.arc(r, Math.cos(angle)) : p.disk(r, angle);
  if (!s) return null;
  const pageX = ring.left + s.x;
  const pageY = ring.top + s.y;
  if (pageX < 8 || pageX > vw - 8 || pageY > ring.fadeY || pageY < 0) return null;
  return { x: pageX - ring.cx, y: pageY - ring.cy };
}

/**
 * Where each star leaves the ring: of the ring's visible matter at the
 * star's radius, the point lying most nearly in the direction the star is
 * headed, as seen from the body at the top of the page. Stars bound
 * sideways peel off the ring's long arms, stars bound down off the near
 * side where it crosses in front of the body, stars bound up off the lensed
 * arc over the top. Every one leaves from where the ring's grains are.
 */
function placeLaunches(stars: Star[], ring: Ring, vw: number, vh: number) {
  if (!ring.project) return;
  for (const star of stars) {
    const heading = Math.atan2(star.y * vh - ring.cy, star.x * vw - ring.cx);
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let k = 0; k < 64; k++) {
      const onArc = k >= 48;
      const angle = onArc ? ((k - 48) / 15) * Math.PI : (k / 48) * Math.PI * 2;
      const point = ringPoint(ring, star.ringR, angle, onArc, vw);
      if (!point) continue;
      let diff = Math.atan2(point.y, point.x) - heading;
      diff -= 2 * Math.PI * Math.round(diff / (2 * Math.PI));
      const score = Math.abs(diff);
      if (score < bestScore) {
        bestScore = score;
        best = point;
      }
    }
    // No visible ring at this radius (a tiny screen): leave from the rim.
    star.launchX = best?.x ?? Math.cos(heading) * ring.radius * 1.1;
    star.launchY = best?.y ?? Math.sin(heading) * ring.radius * 1.1;
  }
}

/** Zero speed at both ends: stars lift off the ring and settle, never launch. */
function easeInOutSine(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** The current at (x, y) and time t: a unit-ish velocity, [vx, vy]. */
function flowAt(x: number, y: number, t: number): [number, number] {
  let vx = 0;
  let vy = 0;
  for (const f of FLOW) {
    // Stream function a sin(phase); velocity is its curl.
    const c = f.a * Math.cos(f.kx * x + f.ky * y + f.w * t + f.p);
    vx += c * f.ky;
    vy -= c * f.kx;
  }
  return [vx / FLOW_NORM, vy / FLOW_NORM];
}

/**
 * A shooting star, now and then: a thin streak with a bright head crossing
 * the upper part of the sky, launched at a random angle.
 */
function spawnMeteor(vw: number, vh: number): Meteor {
  const fromLeft = Math.random() < 0.5;
  const angle = ((18 + Math.random() * 22) * Math.PI) / 180;
  const speed = 900 + Math.random() * 600;
  return {
    x: fromLeft ? Math.random() * vw * 0.5 : vw * 0.5 + Math.random() * vw * 0.5,
    y: Math.random() * vh * 0.45,
    vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
    vy: Math.sin(angle) * speed,
    age: 0,
    life: 0.6 + Math.random() * 0.5,
    length: 110 + Math.random() * 120,
  };
}

/**
 * The page's sky, and on the landing page, the ring's own matter.
 *
 * At the top of the landing page the stars are still part of the ring: a
 * few sparks drift off it while it turns. Scroll, and the stars leave it,
 * each from a real point on the ring as drawn (placeLaunches), while the
 * ring itself sheds grains over the same span (SingularityHorizon's
 * shedOnScroll), so the ring thins into the field instead of a field
 * appearing beside a ring that never changes. Scroll back up and both
 * gather again. Each star follows a curled path out around the body to its
 * resting point and lands there; the settled field then has depth (near
 * stars larger, brighter, sliding further with the scroll), wanders slowly,
 * twinkles, and now and then:
 *
 *   - a near star flares with diffraction spikes, as bright stars do in a
 *     telescope's image;
 *   - a shooting star crosses the upper sky;
 *   - a short chain of stars links up, one hairline at a time, holds, and
 *     fades, a ledger of points appended in order, the product's own idea;
 *
 * `ambient` is the inner pages' version: no ring to come out of, the field
 * is simply there, behind the content rather than above the planet.
 *
 * One fixed 2D canvas. Positions come from a requestAnimationFrame loop in
 * which each star glides toward its scroll-derived target on its own time
 * constant, rather than from scroll events writing raw positions (those
 * arrive in bursts, so writing straight from them stutters). While nothing
 * is in flight or rippling, the loop drops to half rate, which the twinkle
 * and the drift carry smoothly.
 */
export function Starfield({ ambient = false }: { ambient?: boolean } = {}) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const stars = generateStars(ambient ? AMBIENT_COUNT : STAR_COUNT);
    const count = stars.length;
    let vw = 0;
    let vh = 0;
    let dpr = 1;
    let ring = measureRing();
    // How much scrolling it takes to fully spread: a little over one
    // viewport, the same span SingularityHorizon sheds its grains over.
    let range = 1;
    // The singularity's centre on the inner pages, in page coordinates.
    // PageAtmosphere places its faded planet exactly as the landing hero
    // does (left 50% - 35vw, top 20px - 25.6svh, 145svh tall from sm; 50% -
    // 20vw, 20px - 30.7svh, 115svh on a phone), so the ripples there come
    // from where that planet sits.
    let hubX = 0;
    let hubY = 0;

    const size = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      // 1.5x is plenty for points this small; 2x on a retina screen was
      // nearly twice the pixels to clear and composite every frame.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      ring = measureRing();
      range = Math.max(1, vh * 1.1);
      if (!ambient) placeLaunches(stars, ring, vw, vh);
      hubX = vw >= 640 ? vw * 0.15 : vw * 0.3;
      hubY = 20 + vh * (vw >= 640 ? 0.469 : 0.268);
    };
    size();

    let ink = starColor();
    let coolInk = ink;
    const readTheme = () => {
      ink = starColor();
      // The cool stars are a black-sky detail; on paper every star is ink.
      coolInk = document.documentElement.dataset.theme === "prism" ? ink : "#d7e3ff";
    };
    readTheme();
    const themeWatcher = new MutationObserver(readTheme);
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Per-star state carried between frames: how far along its path it is
    // showing (NaN until the first frame), where it was last placed, where
    // it was drawn and whether it counts as settled there, and its smoothed
    // on-screen velocity.
    const shown = new Float32Array(count).fill(Number.NaN);
    const lastX = new Float32Array(count).fill(Number.NaN);
    const lastY = new Float32Array(count);
    const drawnX = new Float32Array(count);
    const drawnY = new Float32Array(count);
    const drawn = new Uint8Array(count);
    const velX = new Float32Array(count);
    const velY = new Float32Array(count);
    // How far each star has been carried by the current, px.
    const flowX = new Float32Array(count);
    const flowY = new Float32Array(count);
    let lastTime: number | null = null;
    let lastDraw = 0;
    let raf: number | null = null;
    let settled = false;

    let meteor: Meteor | null = null;
    let nextMeteorAt = performance.now() + 3500 + Math.random() * 4000;
    const embers: Ember[] = [];
    let emberDebt = 0;
    let chain: Chain | null = null;
    let nextChainAt = performance.now() + (ambient ? 3000 : 1500);
    // A ripple from the singularity: when it started, or null between them.
    let wave: number | null = null;
    let nextWaveAt = performance.now() + 5000 + Math.random() * 5000;

    // Where a star rests right now: its landing point, wandering on its own
    // slow loop, and slid up the screen with the scroll by its depth,
    // wrapping at the edges so the field never empties.
    // The current carries it too, and it wraps at every edge, so the field
    // never empties.
    const restX = (i: number, star: Star, t: number) => {
      const span = vw + 40;
      const raw =
        star.x * vw + flowX[i] + Math.cos(t * star.driftW + star.driftPhase) * star.driftR;
      return ((((raw + 20) % span) + span) % span) - 20;
    };
    const restY = (i: number, star: Star, t: number, scrollY: number, weight: number) => {
      const span = vh + 40;
      const slid = star.y * vh + flowY[i] - scrollY * PARALLAX * star.depth * weight;
      const wrapped = ((((slid + 20) % span) + span) % span) - 20;
      return wrapped + Math.sin(t * star.driftW * 0.8 + star.driftPhase) * star.driftR;
    };

    const twinkle = (star: Star, t: number) =>
      star.minOpacity +
      (star.maxOpacity - star.minOpacity) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * (t - star.delay)) / star.duration));

    function drawMeteor(dt: number, now: number) {
      if (!meteor && now >= nextMeteorAt) meteor = spawnMeteor(vw, vh);
      if (!meteor) return false;
      const m = meteor;
      m.age += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const life = m.age / m.life;
      if (life >= 1 || m.x < -300 || m.x > vw + 300 || m.y > vh + 300) {
        meteor = null;
        nextMeteorAt = now + 7000 + Math.random() * 9000;
        return false;
      }
      // Fades in fast and out slow, like a real one burning up.
      const alpha = Math.min(1, life * 6) * (1 - life) ** 1.4;
      const speed = Math.hypot(m.vx, m.vy);
      const tailX = m.x - (m.vx / speed) * m.length;
      const tailY = m.y - (m.vy / speed) * m.length;
      const gradient = ctx!.createLinearGradient(m.x, m.y, tailX, tailY);
      const [r, g, b] = rgbOf(ink);
      gradient.addColorStop(0, `rgba(${r},${g},${b},${0.95 * alpha})`);
      gradient.addColorStop(0.25, `rgba(${r},${g},${b},${0.45 * alpha})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.globalAlpha = 1;
      ctx!.strokeStyle = gradient;
      ctx!.lineWidth = 1.3;
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(m.x, m.y);
      ctx!.lineTo(tailX, tailY);
      ctx!.stroke();
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = ink;
      ctx!.beginPath();
      ctx!.arc(m.x, m.y, 1.4, 0, Math.PI * 2);
      ctx!.fill();
      return true;
    }

    /**
     * Sparks off the ring while it's on screen and the page hasn't scrolled
     * far: a few a second, each from a visible point of the ring,
     * drifting outward with a little of the disc's swirl and fading over a
     * few seconds. The ring looks alive at rest, and it's the hint of what
     * a scroll does.
     */
    function drawEmbers(dt: number, progress: number, cx: number, cy: number) {
      const heroOnScreen = ring.project && cy + ring.height / 2 > 0;
      if (heroOnScreen && progress < 0.55 && embers.length < 22) {
        emberDebt += dt * 3.2;
        while (emberDebt >= 1) {
          emberDebt -= 1;
          const onArc = Math.random() < 0.18;
          // Mostly off the bright inner band, where the ring is densest.
          const r = 5.2 + Math.random() ** 1.8 * 6.5;
          const point = ringPoint(ring, r, Math.random() * Math.PI * 2, onArc, vw);
          if (!point) continue;
          const d = Math.hypot(point.x, point.y) || 1;
          const speed = 14 + Math.random() * 26;
          embers.push({
            x: point.x,
            y: point.y,
            vx: (point.x / d) * speed - (point.y / d) * speed * 0.25,
            vy: (point.y / d) * speed + (point.x / d) * speed * 0.25,
            age: 0,
            life: 2.6 + Math.random() * 1.6,
            size: 0.7 + Math.random() * 0.9,
          });
        }
      }
      ctx!.fillStyle = ink;
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.age += dt;
        if (e.age >= e.life) {
          embers.splice(i, 1);
          continue;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const t = e.age / e.life;
        const x = cx + e.x;
        const y = cy + e.y;
        ctx!.globalAlpha = Math.min(1, 0.9 * Math.sin(Math.PI * t) ** 1.3);
        ctx!.beginPath();
        ctx!.arc(x, y, e.size * (0.8 + t * 0.6), 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    /** Cross-shaped diffraction spikes on a near star, flaring and resting. */
    function drawGlint(x: number, y: number, star: Star, t: number, alpha: number) {
      const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * (t + star.glintPhase)) / star.glintPeriod);
      const flare = wave ** 3;
      if (flare < 0.02) return;
      const reach = star.size * 2 + 11 * flare;
      const [r, g, b] = rgbOf(ink);
      for (const [dx, dy] of [
        [reach, 0],
        [0, reach],
      ]) {
        const gradient = ctx!.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
        gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
        gradient.addColorStop(0.5, `rgba(${r},${g},${b},${0.7 * flare * alpha})`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx!.globalAlpha = 1;
        ctx!.strokeStyle = gradient;
        ctx!.lineWidth = 0.8;
        ctx!.beginPath();
        ctx!.moveTo(x - dx, y - dy);
        ctx!.lineTo(x + dx, y + dy);
        ctx!.stroke();
      }
    }

    /** Starts a chain from a random settled star, linking near neighbours
     *  that carry on in roughly the same direction, three to five long. */
    function startChain(now: number): Chain | null {
      const candidates: number[] = [];
      for (let i = 0; i < count; i++) {
        if (
          drawn[i] &&
          drawnX[i] > 60 &&
          drawnX[i] < vw - 60 &&
          drawnY[i] > 80 &&
          drawnY[i] < vh - 80
        ) {
          candidates.push(i);
        }
      }
      if (candidates.length < 5) return null;
      const nodes = [candidates[Math.floor(Math.random() * candidates.length)]];
      const length = 3 + Math.floor(Math.random() * 3);
      let heading: number | null = null;
      while (nodes.length < length) {
        const from = nodes[nodes.length - 1];
        let pick = -1;
        let pickDist = Infinity;
        for (const j of candidates) {
          if (nodes.includes(j)) continue;
          const dx = drawnX[j] - drawnX[from];
          const dy = drawnY[j] - drawnY[from];
          const d = Math.hypot(dx, dy);
          if (d < 55 || d > 190) continue;
          if (heading !== null) {
            let turn = Math.atan2(dy, dx) - heading;
            turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
            if (Math.abs(turn) > 1.1) continue;
          }
          if (d < pickDist) {
            pickDist = d;
            pick = j;
          }
        }
        if (pick < 0) break;
        heading = Math.atan2(drawnY[pick] - drawnY[from], drawnX[pick] - drawnX[from]);
        nodes.push(pick);
      }
      return nodes.length >= 3 ? { nodes, start: now, fadeFrom: null } : null;
    }

    /** Draws the chain: links growing one after another, each node marked
     *  as it joins with a ring pulsing out from it, then a hold and a fade.
     *  Returns true while it's animating (drawing or fading). */
    function drawChain(now: number) {
      if (!chain) {
        if (now >= nextChainAt) {
          chain = startChain(now);
          if (!chain) nextChainAt = now + 900;
        }
        if (!chain) return false;
      }
      const c = chain;
      const elapsed = now - c.start;
      const built = (c.nodes.length - 1) * LINK_MS;
      // A star that's left the screen breaks the chain early.
      if (c.fadeFrom === null && c.nodes.some((i) => !drawn[i])) c.fadeFrom = now;
      if (c.fadeFrom === null && elapsed > built + CHAIN_HOLD_MS) c.fadeFrom = now;
      const fade = c.fadeFrom === null ? 1 : 1 - (now - c.fadeFrom) / CHAIN_FADE_MS;
      if (fade <= 0) {
        chain = null;
        nextChainAt = now + 4000 + Math.random() * 4000;
        return false;
      }
      ctx!.strokeStyle = ink;
      ctx!.lineCap = "round";
      for (let j = 0; j < c.nodes.length - 1; j++) {
        const p = smoothstep((elapsed - j * LINK_MS) / LINK_MS);
        if (p <= 0) break;
        const a = c.nodes[j];
        const b = c.nodes[j + 1];
        ctx!.globalAlpha = 0.28 * fade;
        ctx!.lineWidth = 0.75;
        ctx!.beginPath();
        ctx!.moveTo(drawnX[a], drawnY[a]);
        ctx!.lineTo(
          drawnX[a] + (drawnX[b] - drawnX[a]) * p,
          drawnY[a] + (drawnY[b] - drawnY[a]) * p,
        );
        ctx!.stroke();
      }
      for (let j = 0; j < c.nodes.length; j++) {
        // Node j joins as the link reaching it lands (node 0 at once).
        const joined = elapsed - j * LINK_MS;
        if (joined < 0) break;
        const i = c.nodes[j];
        ctx!.lineWidth = 0.8;
        ctx!.globalAlpha = 0.45 * fade * smoothstep(joined / 200);
        ctx!.beginPath();
        ctx!.arc(drawnX[i], drawnY[i], 3.2, 0, Math.PI * 2);
        ctx!.stroke();
        const pulse = joined / 800;
        if (pulse < 1) {
          ctx!.globalAlpha = 0.35 * fade * (1 - pulse);
          ctx!.beginPath();
          ctx!.arc(drawnX[i], drawnY[i], 3.2 + pulse * 10, 0, Math.PI * 2);
          ctx!.stroke();
        }
      }
      return elapsed < built + 800 || c.fadeFrom !== null;
    }

    function drawStill() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, vw, vh);
      for (const star of stars) {
        ctx!.fillStyle = star.cool ? coolInk : ink;
        ctx!.globalAlpha = star.maxOpacity;
        ctx!.beginPath();
        ctx!.arc(star.x * vw, star.y * vh, star.size / 2, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function frame(now: number) {
      raf = null;

      // At rest, the only motion left is slow (twinkle, drift, embers),
      // which every other frame carries fine.
      if (settled && now - lastDraw < 32) {
        raf = requestAnimationFrame(frame);
        return;
      }
      // Real elapsed time since the last drawn frame, so motion is the same
      // speed at 60Hz, 120Hz or half rate; capped so returning to a
      // background tab doesn't jump a whole second.
      const step = lastTime == null ? 1 / 60 : Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      lastDraw = now;

      const scrollY = window.scrollY;
      const progress = Math.min(1, Math.max(0, scrollY / range));
      const cx = ring.cx;
      const cy = ring.cy - scrollY;
      const velocityFollow = 1 - Math.exp(-step / 0.12);
      const seconds = now / 1000;
      let moving = false;

      // The singularity, where the ripples start: the hero's body on the
      // landing page, the faded planet's centre on the inner pages. Above
      // the screen once scrolled, so a ripple sweeps down as an arc.
      const hx = ambient ? hubX : cx;
      const hy = ambient ? hubY - scrollY : cy;
      const skySettled = ambient || progress > 0.85;
      if (wave === null && skySettled && now >= nextWaveAt) wave = now;
      let waveR = -Infinity;
      if (wave !== null) {
        waveR = ((now - wave) / 1000) * WAVE_SPEED;
        const far = Math.max(
          Math.hypot(hx, hy),
          Math.hypot(vw - hx, hy),
          Math.hypot(hx, vh - hy),
          Math.hypot(vw - hx, vh - hy),
        );
        if (waveR > far + WAVE_WIDTH * 3) {
          wave = null;
          waveR = -Infinity;
          nextWaveAt = now + 12000 + Math.random() * 8000;
        } else {
          moving = true;
        }
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, vw, vh);

      if (drawMeteor(step, now)) moving = true;
      if (!ambient) drawEmbers(step, progress, cx, cy);

      for (let i = 0; i < count; i++) {
        const star = stars[i];
        drawn[i] = 0;

        // Each star chases its own point on the scroll with its own lag, so
        // the scroll wheel's bursts are absorbed rather than passed through,
        // and the field fans out unevenly the way a real cloud would.
        const target = ambient
          ? 1
          : Math.min(1, Math.max(0, (progress - star.startAt) / (1 - star.startAt)));
        const previous = shown[i];
        const current = Number.isNaN(previous)
          ? target
          : previous + (target - previous) * (1 - Math.exp(-step / star.glide));
        shown[i] = current;
        if (Math.abs(target - current) > 1e-4) moving = true;
        const eased = easeInOutSine(current);

        // Landing point: fixed to the screen, plus the star's drift, and its
        // depth slide once it has mostly landed (weighted by how far along
        // it is, so a star in flight isn't pulled around by it).
        const landX = restX(i, star, seconds);
        const landY = restY(i, star, seconds, scrollY, ambient ? 1 : eased);

        // Carry it along the current, and slowly round the singularity,
        // nearer stars faster, so the drift has depth as well.
        const pace = 0.3 + 0.7 * star.depth;
        const [fx, fy] = flowAt(landX, landY, seconds);
        const ox = landX - hx;
        const oy = landY - hy;
        const od = Math.hypot(ox, oy) || 1;
        flowX[i] += (fx * FLOW_SPEED - (oy / od) * ORBIT_SPEED) * pace * step;
        flowY[i] += (fy * FLOW_SPEED + (ox / od) * ORBIT_SPEED) * pace * step;

        let x: number;
        let y: number;
        if (ambient) {
          x = landX;
          y = landY;
        } else {
          // From its point on the ring (fixed to the ring, so until it lifts
          // off it rides the ring exactly) out to its resting place, in
          // polar coordinates around the body so the path arcs out and
          // around rather than cutting across, with a curl that unwinds as
          // it lands.
          const launchAngle = Math.atan2(star.launchY, star.launchX);
          const launchRadius = Math.hypot(star.launchX, star.launchY);
          const landDx = landX - cx;
          const landDy = landY - cy;
          let turn = Math.atan2(landDy, landDx) - launchAngle;
          turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
          const angle = launchAngle + turn * eased + CURL * (1 - eased) ** 2 * eased;
          const along = launchRadius + (Math.hypot(landDx, landDy) - launchRadius) * eased;
          x = cx + Math.cos(angle) * along;
          y = cy + Math.sin(angle) * along;
        }

        // Streak length follows a smoothed velocity rather than this frame's
        // raw step, so it grows and relaxes gradually instead of flickering
        // with every notch of the wheel.
        // A star wrapping round an edge jumps a whole screen in one frame;
        // that's not motion, so it mustn't streak.
        const wrapped =
          !Number.isNaN(lastX[i]) &&
          (Math.abs(x - lastX[i]) > vw * 0.5 || Math.abs(y - lastY[i]) > vh * 0.5);
        if (wrapped) {
          velX[i] = 0;
          velY[i] = 0;
        } else if (!Number.isNaN(lastX[i])) {
          velX[i] += (x - lastX[i] - velX[i]) * velocityFollow;
          velY[i] += (y - lastY[i] - velY[i]) * velocityFollow;
        }
        lastX[i] = x;
        lastY[i] = y;
        const speed = Math.hypot(velX[i], velY[i]) / (step * 60);
        // The drift alone never counts as moving: it's always on.
        if (speed > 0.35) moving = true;

        // Not drawn until it lifts off, then fading up fast: at the moment
        // it leaves, it's a grain of the ring, small and bright, growing
        // into a star as it travels.
        const visible = ambient ? 1 : smoothstep(current / 0.08);
        if (visible <= 0.002) continue;
        // A ripple passing: pushed out from the singularity and lit as the
        // front goes through, then settling back. The stars are the wave.
        let swell = 0;
        if (wave !== null) {
          const wx = x - hx;
          const wy = y - hy;
          const wd = Math.hypot(wx, wy) || 1;
          const u = (wd - waveR) / WAVE_WIDTH;
          swell = Math.exp(-u * u);
          if (swell > 0.01) {
            const push = WAVE_PUSH * swell * (0.5 + star.depth);
            x += (wx / wd) * push;
            y += (wy / wd) * push;
          }
        }

        if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20) continue;

        const grow = ambient ? 1 : 0.4 + 0.6 * smoothstep(current / 0.4);
        let radius = (star.size / 2) * grow * (1 + 0.35 * swell);
        const stretch = 1 + Math.min(speed * 0.3, 3.5);
        // The brighter stars shimmer fast on top of their slow twinkle, the
        // way real starlight scintillates.
        const shimmer =
          star.depth > 0.62
            ? 1 +
              0.22 *
                Math.sin(seconds * 8.3 + star.shimmerA) *
                Math.sin(seconds * 5.1 + star.shimmerB)
            : 1;
        let alpha = Math.min(
          1,
          visible * twinkle(star, seconds) * shimmer * (1 + 0.9 * swell),
        );

        // A pulsar: a sharp flash on every beat, decaying fast, with a thin
        // ring rippling out from it like a chain node joining.
        let beatPhase = -1;
        if (star.kind === "pulsar" && current > 0.95) {
          beatPhase = ((((seconds + star.phase) % star.beat) + star.beat) % star.beat) / star.beat;
          const flash = Math.exp(-beatPhase * 9);
          alpha = Math.min(1, alpha + 0.65 * flash * visible);
          radius *= 1 + 0.5 * flash;
        }

        ctx!.fillStyle = star.cool ? coolInk : ink;
        ctx!.globalAlpha = alpha;
        ctx!.beginPath();
        if (star.kind === "pair" && stretch < 1.05 && current > 0.95) {
          // A close pair circling each other: two points, the companion
          // smaller and fainter, on a tilted orbit.
          const turn = (2 * Math.PI * (seconds + star.phase)) / star.beat;
          const ex = Math.cos(turn) * star.pairGap * 0.5;
          const ey = Math.sin(turn) * star.pairGap * 0.3;
          ctx!.arc(x + ex, y + ey, radius * 0.85, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.globalAlpha = alpha * 0.75;
          ctx!.beginPath();
          ctx!.arc(x - ex, y - ey, radius * 0.6, 0, Math.PI * 2);
        } else if (stretch < 1.05) {
          ctx!.arc(x, y, radius, 0, Math.PI * 2);
        } else {
          // A streak trailing behind the direction of travel, head at the
          // star's position.
          const length = radius * stretch;
          const heading = Math.atan2(velY[i], velX[i]);
          ctx!.ellipse(
            x - Math.cos(heading) * (length - radius),
            y - Math.sin(heading) * (length - radius),
            length,
            radius,
            heading,
            0,
            Math.PI * 2,
          );
        }
        ctx!.fill();
        if (star.glint && current > 0.95) drawGlint(x, y, star, seconds, alpha);
        if (beatPhase >= 0 && beatPhase < 0.55) {
          const spread = beatPhase / 0.55;
          ctx!.strokeStyle = ink;
          ctx!.lineWidth = 0.7;
          ctx!.globalAlpha = 0.32 * (1 - spread) * visible;
          ctx!.beginPath();
          ctx!.arc(x, y, radius + 2 + spread * 10, 0, Math.PI * 2);
          ctx!.stroke();
        }

        drawnX[i] = x;
        drawnY[i] = y;
        // A star that just wrapped round an edge breaks any chain it's in.
        drawn[i] = current > 0.98 && !wrapped ? 1 : 0;
      }

      // Chains only in a settled sky: fully spread on the landing page.
      if (skySettled) {
        if (drawChain(now)) moving = true;
      } else if (chain) {
        chain = null;
      }

      settled = !moving;
      raf = requestAnimationFrame(frame);
    }

    if (reduced) {
      // No loop: every star at rest in its final spot.
      drawStill();
      const onResize = () => {
        size();
        drawStill();
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        themeWatcher.disconnect();
      };
    }

    const wake = () => {
      settled = false;
      if (raf == null) {
        lastTime = null;
        lastDraw = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const onResize = () => {
      // A phone's address bar sliding in or out mid-scroll changes only the
      // height, by a bar's worth: not worth reallocating the canvas and
      // re-placing every launch for. The canvas stretches the difference.
      if (window.innerWidth === vw && Math.abs(window.innerHeight - vh) < 160) {
        wake();
        return;
      }
      size();
      wake();
    };
    // The hero's box can move without a window resize (fonts landing,
    // the header settling), so the ring is re-measured when it does.
    const hero = document.querySelector(".hero-canvas-mask");
    const observer = hero
      ? new ResizeObserver(() => {
          size();
          wake();
        })
      : null;
    if (hero) observer!.observe(hero);

    raf = requestAnimationFrame(frame);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      themeWatcher.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [reduced, ambient]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`starfield-canvas pointer-events-none fixed inset-0 h-full w-full ${ambient ? "-z-20" : "z-[1]"}`}
    />
  );
}
