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
  /** Where in the 0–1 scroll range this star leaves the ring — staggered so
   *  the field peels off in a stream rather than all on one frame. */
  startAt: number;
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
 * for free — the box sits in page flow, so its rect rises as the page scrolls
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
    };
  });
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * The ring's own field, spreading out of the hero as you scroll and gathering
 * back into it as you scroll up. A separate layer from SingularityHorizon
 * rather than an extension of its canvas: that component's camera math is
 * tuned to one exact on-screen invariant, and growing it to page height would
 * mean re-deriving that math.
 *
 * Every star moves along a single ray — from the ring's centre, out through
 * the point it settles at. It starts on the rim and slides outward along that
 * ray as scroll progresses, which is what makes the field read as coming out
 * of the ring instead of merely appearing over the page. The ray is recomputed
 * from the ring's live position each frame, so it stays aimed correctly while
 * the hero scrolls away, and the end of the ray is a fixed viewport point, so
 * the settled field stays put instead of scrolling off with the hero.
 *
 * Positions come from a persistent requestAnimationFrame loop that eases a
 * visible progress value toward the scroll-derived target, rather than from a
 * scroll event listener writing raw positions: scroll events arrive in bursts
 * the input device decides on, so writing straight from them snaps between
 * sparse samples instead of flowing.
 */
export function Starfield() {
  const reduced = useReducedMotion();
  const [stars, setStars] = useState<Star[] | null>(null);
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const visibleProgressRef = useRef(0);

  useEffect(() => {
    // Deferred into a callback, not called synchronously in the effect body,
    // so the one-time mount render isn't itself the thing setting state.
    const raf = requestAnimationFrame(() => setStars(generateStars(STAR_COUNT)));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Reduced motion runs no loop at all — every star is already at rest in
    // its final spot, placed in the JSX below.
    if (!stars || reduced) return;

    // How much scrolling it takes to fully spread: a little over one viewport,
    // so most of the travel happens while the ring is still on screen to be
    // seen leaving.
    const range = Math.max(1, window.innerHeight * 1.1);
    // Each star's distance from the ring on the previous frame, so its speed
    // this frame is known. NaN until the first frame has placed it.
    const lastAlong = new Float32Array(stars.length).fill(Number.NaN);

    function frame() {
      const target = Math.min(1, Math.max(0, window.scrollY / range));
      // Ease toward the target rather than snapping to it — 12% of the
      // remaining gap per frame, which settles in a few hundred milliseconds
      // at 60fps but never teleports.
      const current = visibleProgressRef.current;
      const next = current + (target - current) * 0.12;
      visibleProgressRef.current =
        Math.abs(next - target) < 0.0005 ? target : next;
      const progress = visibleProgressRef.current;

      // One layout read for the whole frame, before any writes; everything
      // written below is transform and opacity, which the compositor handles
      // without invalidating layout, so the next frame's read stays cheap.
      const ring = ringGeometry();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const field = stars!;
      for (let i = 0; i < field.length; i++) {
        const el = starRefs.current[i];
        if (!el) continue;
        const star = field[i];
        const local = Math.min(
          1,
          Math.max(0, (progress - star.startAt) / (1 - star.startAt)),
        );
        const eased = easeOutCubic(local);

        const dx = star.x * vw - ring.cx;
        const dy = star.y * vh - ring.cy;
        const distance = Math.hypot(dx, dy) || 1;
        // A star settling close to the centre would have no room to travel if
        // it started out on the rim, so it starts proportionally further in
        // and rises through the ring instead. Either way it only ever moves
        // outward, and never starts past its own destination.
        const from = Math.min(ring.radius * star.band, distance * 0.55);
        const along = from + (distance - from) * eased;
        const x = ring.cx + (dx / distance) * along;
        const y = ring.cy + (dy / distance) * along;

        // A moving star stretches into a streak along its own ray, tail
        // pointing back at the ring — so even a single frame of the motion
        // says where the field is coming from. At rest it's a round dot again.
        const previous = lastAlong[i];
        const speed = Number.isNaN(previous) ? 0 : along - previous;
        lastAlong[i] = along;
        const stretch = 1 + Math.min(Math.abs(speed) * 0.5, 8);
        const heading =
          Math.atan2(dy, dx) + (speed < 0 ? Math.PI : 0);

        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${heading.toFixed(3)}rad) scaleX(${stretch.toFixed(2)})`;
        // Visibility is a function of where the star is, not how far along it
        // is: nothing shows while it is still within the body's silhouette,
        // and it comes up quickly once it clears the rim. So every star is
        // first seen leaving the ring's edge, and scrolling back up puts them
        // out again as they sink into it.
        el.style.opacity = Math.min(
          1,
          Math.max(0, (along - ring.radius) / (ring.radius * 0.15)),
        ).toFixed(3);
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
