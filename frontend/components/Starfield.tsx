"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
 * Where the hero's body is on screen right now, in viewport pixels.
 *
 * Measured off the hero's own box rather than recomputed from the vw/svh calc
 * in page.tsx: the camera looks at the origin, so the body always lands dead
 * centre of that box, and reading the live rect keeps this layer pointing at
 * the ring even if the hero is repositioned. It also gives the scroll offset
 * for free, the box sits in page flow, so its rect rises as the page scrolls
 * and the emission point rises with the ring it belongs to.
 */
function ringGeometry(): Ring {
  const el = document.querySelector(".hero-canvas-mask");
  if (!el) {
    // Only before the hero has mounted; roughly where it lands on desktop.
    return {
      cx: window.innerWidth * 0.15,
      cy: window.innerHeight * 0.47 - window.scrollY,
      radius: window.innerHeight * 0.45,
    };
  }
  const rect = el.getBoundingClientRect();
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
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
 * slightly curled and straightens as it lands. It is recomputed from the
 * ring's live position each frame, so it stays aimed correctly while the hero
 * scrolls away, and it ends at a fixed viewport point, so the settled field
 * stays put instead of scrolling off with the hero.
 *
 * Positions come from a persistent requestAnimationFrame loop in which each
 * star glides toward its scroll-derived target on its own time constant,
 * rather than from a scroll event listener writing raw positions: scroll
 * events arrive in bursts the input device decides on, so writing straight
 * from them snaps between sparse samples instead of flowing.
 */
export function Starfield() {
  const reduced = useReducedMotion();
  const [stars, setStars] = useState<Star[] | null>(null);
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Deferred into a callback, not called synchronously in the effect body,
    // so the one-time mount render isn't itself the thing setting state.
    const raf = requestAnimationFrame(() => setStars(generateStars(STAR_COUNT)));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Reduced motion runs no loop at all, every star is already at rest in
    // its final spot, placed in the JSX below.
    if (!stars || reduced) return;

    // How much scrolling it takes to fully spread: a little over one viewport,
    // so most of the travel happens while the ring is still on screen to be
    // seen leaving.
    const range = Math.max(1, window.innerHeight * 1.1);
    const count = stars.length;
    // Per-star state carried between frames: how far along its path it is
    // showing (NaN until the first frame), where it was drawn, and its
    // smoothed on-screen velocity.
    const shown = new Float32Array(count).fill(Number.NaN);
    const lastX = new Float32Array(count).fill(Number.NaN);
    const lastY = new Float32Array(count);
    const velX = new Float32Array(count);
    const velY = new Float32Array(count);
    let lastTime: number | null = null;

    function frame(now: number) {
      // Real elapsed time, so the glide is the same speed at 60Hz and 120Hz;
      // capped so returning to a background tab doesn't jump a whole second.
      const dt = lastTime == null ? 1 / 60 : Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const progress = Math.min(1, Math.max(0, window.scrollY / range));

      // One layout read for the whole frame, before any writes; everything
      // written below is transform and opacity, which the compositor handles
      // without invalidating layout, so the next frame's read stays cheap.
      const ring = ringGeometry();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const velocityFollow = 1 - Math.exp(-dt / 0.12);

      const field = stars!;
      for (let i = 0; i < count; i++) {
        const el = starRefs.current[i];
        if (!el) continue;
        const star = field[i];

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
        const eased = easeInOutSine(current);

        // Launch point: fixed to the ring itself, in the direction of where
        // the star lands as seen from the top of the page. Measured in page
        // coordinates, so it doesn't change as you scroll, until it lifts
        // off, a star rides with the ring exactly, instead of sliding around
        // the rim as the ring scrolls past a destination pinned to the screen.
        const pageCy = ring.cy + window.scrollY;
        const launchDx = star.x * vw - ring.cx;
        const launchDy = star.y * vh - pageCy;
        const launchAngle = Math.atan2(launchDy, launchDx);
        // A star landing close to the centre would have no room to travel if
        // it launched out on the rim, so it starts proportionally further in
        // and rises through the ring instead.
        const launchRadius = Math.min(
          ring.radius * star.band,
          Math.hypot(launchDx, launchDy) * 0.55,
        );

        // Landing point: fixed to the screen, seen from where the ring is now.
        const landDx = star.x * vw - ring.cx;
        const landDy = star.y * vh - ring.cy;
        const landAngle = Math.atan2(landDy, landDx);
        const landRadius = Math.hypot(landDx, landDy);

        // Travel in polar coordinates around the ring's centre, radius and
        // angle each blend from launch to landing, so the path arcs out and
        // around the ring rather than cutting across it, with a slight extra
        // curl that unwinds as it lands.
        let turn = landAngle - launchAngle;
        turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
        const angle =
          launchAngle + turn * eased + CURL * (1 - eased) ** 2 * eased;
        const along = launchRadius + (landRadius - launchRadius) * eased;
        const x = ring.cx + Math.cos(angle) * along;
        const y = ring.cy + Math.sin(angle) * along;

        // Streak length follows a smoothed velocity rather than this frame's
        // raw step, so it grows and relaxes gradually instead of flickering
        // with every notch of the wheel, and it points wherever the star is
        // actually heading, curve included.
        if (!Number.isNaN(lastX[i])) {
          velX[i] += (x - lastX[i] - velX[i]) * velocityFollow;
          velY[i] += (y - lastY[i] - velY[i]) * velocityFollow;
        }
        lastX[i] = x;
        lastY[i] = y;
        const speed = Math.hypot(velX[i], velY[i]) / (dt * 60);
        const stretch = 1 + Math.min(speed * 0.3, 3.5);
        const heading = Math.atan2(velY[i], velX[i]);

        // Visibility is a function of where the star is, not how far along it
        // is: nothing shows inside the body's silhouette, and it fades up
        // softly over the next half-radius as it clears the rim, growing into
        // its full size as it does, so each star is first seen as a faint
        // speck leaving the ring's edge, and sinks back in on the way up.
        const visible = smoothstep((along - ring.radius) / (ring.radius * 0.5));
        const size = 0.5 + 0.5 * visible;

        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${heading.toFixed(3)}rad) scale(${(stretch * size).toFixed(3)}, ${size.toFixed(3)})`;
        el.style.opacity = visible.toFixed(3);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [stars, reduced]);

  if (!stars) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden"
    >
      {stars.map((star, i) => (
        <span
          key={i}
          ref={(el) => {
            starRefs.current[i] = el;
          }}
          className="absolute left-0 top-0 block origin-right"
          style={{
            width: `${star.size}px`,
            height: `${star.size}px`,
            // Pulls the box back by half its size so the translate above
            // places the star's centre, not its corner.
            marginLeft: `${-star.size / 2}px`,
            marginTop: `${-star.size / 2}px`,
            transform: reduced
              ? `translate3d(${star.x * 100}vw, ${star.y * 100}vh, 0)`
              : undefined,
            // Starts invisible under motion: the loop's first frame places it
            // on the rim, so there is never a frame of stars at the origin.
            opacity: reduced ? star.maxOpacity : 0,
          }}
        >
          {/* The twinkle sits on its own element so the emergence fade on the
              parent multiplies it instead of fighting it for `opacity`. */}
          <span
            className={`block h-full w-full rounded-full bg-chrome ${reduced ? "" : "animate-[twinkle_var(--star-duration)_ease-in-out_infinite]"}`}
            style={
              {
                "--star-min": star.minOpacity,
                "--star-max": star.maxOpacity,
                "--star-duration": `${star.duration}s`,
                animationDelay: `${star.delay}s`,
              } as CSSProperties
            }
          />
        </span>
      ))}
    </div>
  );
}
