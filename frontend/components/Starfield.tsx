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
};

const STAR_COUNT = 200;

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
 * instead of flowing. While the field is at rest the loop drops to the
 * twinkle's own pace (~30fps), and it stops entirely while every star is
 * still inside the ring.
 */
export function Starfield() {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const stars = generateStars(STAR_COUNT);
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

    const twinkle = (star: Star, t: number) =>
      star.minOpacity +
      (star.maxOpacity - star.minOpacity) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * (t - star.delay)) / star.duration));

    function drawStill() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, vw, vh);
      ctx!.fillStyle = "#dfe1e6";
      for (const star of stars) {
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

      // At rest, the only motion left is the twinkle, which is slow enough
      // that every other frame is plenty.
      if (settled && now - lastDraw < 32) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, vw, vh);
      ctx!.fillStyle = "#dfe1e6";

      let moving = false;
      let anyVisible = false;
      for (let i = 0; i < count; i++) {
        const star = stars[i];

        // Each star chases its own point on the scroll with its own lag, so
        // the scroll wheel's bursts are absorbed rather than passed through,
        // and the field fans out unevenly the way a real cloud would.
        const target = Math.min(
          1,
          Math.max(0, (progress - star.startAt) / (1 - star.startAt)),
        );
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

        // Landing point: fixed to the screen, seen from where the ring is now.
        const landDx = star.x * vw - cx;
        const landDy = star.y * vh - cy;
        const landAngle = Math.atan2(landDy, landDx);
        const landRadius = Math.hypot(landDx, landDy);

        // Travel in polar coordinates around the ring's centre, so the path
        // arcs out and around the ring rather than cutting across it, with a
        // slight extra curl that unwinds as it lands.
        let turn = landAngle - launchAngle;
        turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
        const angle = launchAngle + turn * eased + CURL * (1 - eased) ** 2 * eased;
        const along = launchRadius + (landRadius - launchRadius) * eased;
        const x = cx + Math.cos(angle) * along;
        const y = cy + Math.sin(angle) * along;

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
        if (speed > 0.02) moving = true;

        // Nothing shows inside the body's silhouette; a star fades up over
        // the next half-radius as it clears the rim, growing into its full
        // size as it does.
        // It also fades in over the first stretch of its own journey, so a
        // star waiting on the rim (the top of the page) isn't drawn at all
        // and the field reads as leaving the ring, not parked around it.
        const visible =
          smoothstep((along - ring.radius) / (ring.radius * 0.5)) *
          smoothstep(current / 0.12);
        if (visible <= 0.002) continue;
        if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20) continue;
        anyVisible = true;

        const grow = 0.5 + 0.5 * visible;
        const radius = (star.size / 2) * grow;
        const stretch = 1 + Math.min(speed * 0.3, 3.5);
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

      settled = !moving;
      // Every star tucked inside the ring (the top of the page) and nothing
      // in flight: stop until the next scroll.
      if (!moving && !anyVisible) return;
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
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] h-full w-full"
    />
  );
}
