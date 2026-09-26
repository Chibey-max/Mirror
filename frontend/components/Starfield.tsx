"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/components/MetalButton";

type Star = {
  /** Where it comes to rest, as a fraction of the viewport. */
  x: number;
  y: number;
  /** Where on the ring it starts, as a multiple of the body's on-screen
   *  radius: 1 is the rim itself, higher is out in the disc. */
  band: number;
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
  /** 0 far .. 1 near: how much the star slides with the scroll once it has
   *  landed, so the field has depth instead of sitting on one flat plane. */
  depth: number;
  /** Its slow wander around the landing point: radius in px, angular speed
   *  in rad/s, and where on that loop it starts. */
  driftR: number;
  driftW: number;
  driftPhase: number;
};

const STAR_COUNT = 200;
/** Fewer on the inner pages, where the field is atmosphere behind tables. */
const AMBIENT_COUNT = 150;
/** How far a near star slides per pixel scrolled. */
const PARALLAX = 0.12;
const CHROME = "#dfe1e6";

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  length: number;
};

/**
 * The body's on-screen radius as a fraction of the hero canvas box's height.
 *
 * SingularityHorizon frames by vertical FOV from a fixed distance, so the box
 * always spans 2 x (camDistance x tan(FOV / 2)) ≈ 12.38 world units and the
 * horizon (HORIZON = 4) covers 4 of them. Both numbers are pinned by comments
 * in that component and in page.tsx's hero placement; if either moves, so
 * does this.
 */
const BODY_RADIUS_FRACTION = 4 / 12.38;

/** Mirrors SingularityHorizon's own dolly-out on a portrait canvas. */
function fitFor(aspect: number) {
  return aspect < 1 ? Math.min(1 / aspect, 1.6) : 1;
}

type Ring = { cx: number; cy: number; radius: number };

/**
 * Where the hero's body sits, in PAGE coordinates (scroll-independent).
 *
 * Measured off the hero's own box rather than recomputed from the vw/svh calc
 * in page.tsx: the camera looks at the origin, so the body always lands dead
 * centre of that box. The box sits in page flow, so its page position only
 * changes on resize; it is measured then, and each frame subtracts the scroll
 * offset, instead of reading layout sixty times a second.
 */
function measureRing(): Ring {
  const el = document.querySelector(".hero-canvas-mask");
  if (!el) {
    // Only before the hero has mounted; roughly where it lands on desktop.
    return {
      cx: window.innerWidth * 0.15,
      cy: window.innerHeight * 0.47,
      radius: window.innerHeight * 0.45,
    };
  }
  const rect = el.getBoundingClientRect();
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2 + window.scrollY,
    radius:
      (rect.height * BODY_RADIUS_FRACTION) / fitFor(rect.width / rect.height),
  };
}

/**
 * Random per star, generated client-side after mount rather than during
 * render, so server and client never disagree about where a star is.
 */
function generateStars(count: number): Star[] {
  return Array.from({ length: count }, () => {
    const base = 0.15 + Math.random() * 0.55;
    return {
      x: Math.random(),
      y: Math.random(),
      band: 1 + Math.random() * 0.45,
      size: 1 + Math.random() * 2.4,
      minOpacity: base * 0.35,
      maxOpacity: Math.min(1, base * 1.7),
      duration: 2.4 + Math.random() * 4.5,
      delay: -Math.random() * 6,
      startAt: Math.random() * 0.45,
      glide: 0.35 + Math.random() * 0.6,
      depth: 0.15 + Math.random() * 0.85,
      driftR: 2 + Math.random() * 7,
      driftW: (2 * Math.PI) / (18 + Math.random() * 24),
      driftPhase: Math.random() * Math.PI * 2,
    };
  });
}

/** Zero speed at both ends: stars lift off the rim and settle, never launch. */
function easeInOutSine(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Extra swirl on each path, in radians, zero at launch and at landing, most
 * in between, so paths bow gently instead of running straight. One direction
 * for every star, so the field swirls together.
 */
const CURL = 0.6;

/**
 * The ring's own field, spreading out of the hero as you scroll and gathering
 * back into it as you scroll up. A separate layer from SingularityHorizon
 * rather than an extension of its canvas: that component's camera math is
 * tuned to one exact on-screen invariant, and growing it to page height would
 * mean re-deriving that math.
 *
 * Every star travels out from the ring's centre toward the point it settles
 * at, starting on the rim, which is what makes the field read as coming out
 * of the ring instead of merely appearing over the page. The path starts
 * slightly curled and straightens as it lands. It ends at a fixed viewport
 * point, so the settled field stays put instead of scrolling off with the
 * hero.
 *
 * Drawn on one fixed canvas, layered just above the hero's canvas so a star
 * can be seen leaving the rim (under it, the opaque planet hid every star
 * until it had cleared the whole box). It used to be 200 DOM elements, each
 * restyled every frame plus a CSS twinkle apiece; one 2D canvas does the same
 * drawing for a fraction of the style and compositing work.
 *
 * Positions come from a requestAnimationFrame loop in which each star glides
 * toward its scroll-derived target on its own time constant, rather than from
 * scroll events writing raw positions: those arrive in bursts the input
 * device decides on, so writing straight from them snaps between samples
 * instead of flowing. While nothing is in flight the loop drops to half
 * rate (~30fps), which the twinkle, the drift and the depth slide all
 * carry smoothly.
 */
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
 * `ambient` is the inner pages' version: no ring to come out of, the field
 * is simply there, drifting, sliding with the scroll by depth, with the odd
 * shooting star, sitting behind the content rather than above the planet.
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
    // viewport, so most of the travel happens while the ring is still on
    // screen to be seen leaving.
    let range = 1;

    const size = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      ring = measureRing();
      range = Math.max(1, vh * 1.1);
    };
    size();

    // Per-star state carried between frames: how far along its path it is
    // showing (NaN until the first frame), where it was drawn, and its
    // smoothed on-screen velocity.
    const shown = new Float32Array(count).fill(Number.NaN);
    const lastX = new Float32Array(count).fill(Number.NaN);
    const lastY = new Float32Array(count);
    const velX = new Float32Array(count);
    const velY = new Float32Array(count);
    let lastTime: number | null = null;
    let lastDraw = 0;
    let raf: number | null = null;
    let settled = false;
    let meteor: Meteor | null = null;
    let nextMeteorAt = performance.now() + 3500 + Math.random() * 4000;

    // Where a star rests right now: its landing point, wandering on its own
    // slow loop, and slid up the screen with the scroll by its depth,
    // wrapping at the edges so the field never empties.
    const restX = (star: Star, t: number) =>
      star.x * vw + Math.cos(t * star.driftW + star.driftPhase) * star.driftR;
    const restY = (star: Star, t: number, scrollY: number, weight: number) => {
      const span = vh + 40;
      const slid = star.y * vh - scrollY * PARALLAX * star.depth * weight;
      const wrapped = ((((slid + 20) % span) + span) % span) - 20;
      return wrapped + Math.sin(t * star.driftW * 0.8 + star.driftPhase) * star.driftR;
    };

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
      gradient.addColorStop(0, `rgba(248,249,252,${0.95 * alpha})`);
      gradient.addColorStop(0.25, `rgba(223,225,230,${0.45 * alpha})`);
      gradient.addColorStop(1, "rgba(223,225,230,0)");
      ctx!.globalAlpha = 1;
      ctx!.strokeStyle = gradient;
      ctx!.lineWidth = 1.3;
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(m.x, m.y);
      ctx!.lineTo(tailX, tailY);
      ctx!.stroke();
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = "#f8f9fc";
      ctx!.beginPath();
      ctx!.arc(m.x, m.y, 1.4, 0, Math.PI * 2);
      ctx!.fill();
      return true;
    }

    const twinkle = (star: Star, t: number) =>
      star.minOpacity +
      (star.maxOpacity - star.minOpacity) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * (t - star.delay)) / star.duration));

    function drawStill() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, vw, vh);
      for (const star of stars) {
        ctx!.fillStyle = CHROME;
        ctx!.globalAlpha = star.maxOpacity;
        ctx!.beginPath();
        ctx!.arc(star.x * vw, star.y * vh, star.size / 2, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function frame(now: number) {
      raf = null;
      // Real elapsed time, so the glide is the same speed at 60Hz and 120Hz;
      // capped so returning to a background tab doesn't jump a whole second.
      const dt = lastTime == null ? 1 / 60 : Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const scrollY = window.scrollY;
      const progress = Math.min(1, Math.max(0, scrollY / range));
      const cx = ring.cx;
      const cy = ring.cy - scrollY;
      const velocityFollow = 1 - Math.exp(-dt / 0.12);
      const seconds = now / 1000;

      // At rest, the only motion left is the twinkle and the slow drift,
      // which every other frame carries fine.
      if (settled && now - lastDraw < 32) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, vw, vh);

      let moving = false;
      for (let i = 0; i < count; i++) {
        const star = stars[i];

        // Each star chases its own point on the scroll with its own lag, so
        // the scroll wheel's bursts are absorbed rather than passed through,
        // and the field fans out unevenly the way a real cloud would.
        const target = ambient
          ? 1
          : Math.min(1, Math.max(0, (progress - star.startAt) / (1 - star.startAt)));
        const previous = shown[i];
        const current = Number.isNaN(previous)
          ? target
          : previous + (target - previous) * (1 - Math.exp(-dt / star.glide));
        shown[i] = current;
        if (Math.abs(target - current) > 1e-4) moving = true;
        const eased = easeInOutSine(current);

        // Launch point: fixed to the ring itself, in the direction of where
        // the star lands as seen from the top of the page, so until it lifts
        // off a star rides with the ring exactly.
        const launchDx = star.x * vw - cx;
        const launchDy = star.y * vh - ring.cy;
        const launchAngle = Math.atan2(launchDy, launchDx);
        // A star landing close to the centre would have no room to travel if
        // it launched out on the rim, so it starts proportionally further in
        // and rises through the ring instead.
        const launchRadius = Math.min(
          ring.radius * star.band,
          Math.hypot(launchDx, launchDy) * 0.55,
        );

        // Landing point: fixed to the screen, seen from where the ring is now,
        // plus the star's drift, and its depth slide once it has mostly
        // landed (weighted by how far along it is, so a star in flight
        // isn't pulled around by it).
        const landX = restX(star, seconds);
        const landY = restY(star, seconds, scrollY, ambient ? 1 : eased);
        const landDx = landX - cx;
        const landDy = landY - cy;
        const landAngle = Math.atan2(landDy, landDx);
        const landRadius = Math.hypot(landDx, landDy);

        // Travel in polar coordinates around the ring's centre, so the path
        // arcs out and around the ring rather than cutting across it, with a
        // slight extra curl that unwinds as it lands.
        let turn = landAngle - launchAngle;
        turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
        const angle = launchAngle + turn * eased + CURL * (1 - eased) ** 2 * eased;
        const along = launchRadius + (landRadius - launchRadius) * eased;
        const x = ambient ? landX : cx + Math.cos(angle) * along;
        const y = ambient ? landY : cy + Math.sin(angle) * along;

        // Streak length follows a smoothed velocity rather than this frame's
        // raw step, so it grows and relaxes gradually instead of flickering
        // with every notch of the wheel.
        if (!Number.isNaN(lastX[i])) {
          velX[i] += (x - lastX[i] - velX[i]) * velocityFollow;
          velY[i] += (y - lastY[i] - velY[i]) * velocityFollow;
        }
        lastX[i] = x;
        lastY[i] = y;
        const speed = Math.hypot(velX[i], velY[i]) / (dt * 60);
        // The drift alone never counts as moving: it's always on.
        if (speed > 0.35) moving = true;

        // Nothing shows inside the body's silhouette; a star fades up over
        // the next half-radius as it clears the rim, growing into its full
        // size as it does.
        // It also fades in over the first stretch of its own journey, so a
        // star waiting on the rim (the top of the page) isn't drawn at all
        // and the field reads as leaving the ring, not parked around it.
        const visible = ambient
          ? 1
          : smoothstep((along - ring.radius) / (ring.radius * 0.5)) *
            smoothstep(current / 0.12);
        if (visible <= 0.002) continue;
        if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20) continue;

        const grow = 0.5 + 0.5 * visible;
        const radius = (star.size / 2) * grow;
        const stretch = 1 + Math.min(speed * 0.3, 3.5);
        ctx!.fillStyle = CHROME;
        ctx!.globalAlpha = visible * twinkle(star, seconds);
        ctx!.beginPath();
        if (stretch < 1.05) {
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
      }

      if (drawMeteor(dt, now)) moving = true;
      // The loop keeps running for the drift and the shooting stars (the
      // browser pauses it with the tab), at half rate while nothing is in
      // flight.
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
      return () => window.removeEventListener("resize", onResize);
    }

    const wake = () => {
      settled = false;
      if (raf == null) {
        lastTime = null;
        raf = requestAnimationFrame(frame);
      }
    };
    const onResize = () => {
      size();
      wake();
    };
    // The hero's box can move without a window resize (fonts landing,
    // the header settling), so the ring is re-measured when it does.
    const hero = document.querySelector(".hero-canvas-mask");
    const observer = hero ? new ResizeObserver(onResize) : null;
    if (hero) observer!.observe(hero);

    raf = requestAnimationFrame(frame);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [reduced, ambient]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 h-full w-full ${ambient ? "-z-20" : "z-[1]"}`}
    />
  );
}
