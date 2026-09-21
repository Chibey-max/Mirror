"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/components/MetalButton";

type Star = {
  /** Resting position once fully emerged, in viewport percent. */
  x: number;
  y: number;
  /** Where this star sits while still "in" the ring — a small scattered
   *  cluster near the hero's body, not one shared point, so the return
   *  trip reads as gathering back into the ring rather than collapsing
   *  onto a single pixel. */
  originX: number;
  originY: number;
  size: number;
  minOpacity: number;
  maxOpacity: number;
  duration: number;
  delay: number;
  /** Where in the 0–1 scroll range this star starts moving — staggered so
   *  they leave the ring in a stream, not all at once on the same frame. */
  startAt: number;
};

const STAR_COUNT = 140;

/**
 * Roughly where the hero's body sits on screen (viewport %) — the point
 * every star's journey starts and ends at. Matches SingularityHorizon's own
 * "top-left corner, top edge 20px below the page top" placement closely
 * enough for this purpose; getting it exactly right would mean reading the
 * hero's camera math, which is more precision than a background layer
 * needs.
 */
const ORIGIN = { x: 34, y: 11 };

/**
 * Random per star, generated client-side after mount rather than during
 * render, so server and client never disagree about where a star is —
 * `Math.random()` in a render body is a guaranteed hydration mismatch the
 * moment this runs on the server.
 */
function generateStars(count: number): Star[] {
  return Array.from({ length: count }, () => {
    const base = 0.15 + Math.random() * 0.55;
    return {
      x: Math.random() * 100,
      y: Math.random() * 100,
      originX: ORIGIN.x + (Math.random() - 0.5) * 14,
      originY: ORIGIN.y + (Math.random() - 0.5) * 8,
      size: 1 + Math.random() * 2.4,
      minOpacity: base * 0.35,
      maxOpacity: Math.min(1, base * 1.7),
      duration: 2.4 + Math.random() * 4.5,
      delay: -Math.random() * 6,
      startAt: Math.random() * 0.6,
    };
  });
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * The ring's own field, flowing out past the fold as you scroll — and
 * flowing back in as you scroll back up. Built separately from
 * SingularityHorizon rather than by extending its canvas: that component's
 * camera math is tuned to one exact on-screen invariant (§ its own
 * comments), and growing it to page height would mean re-deriving that math
 * for a shot nobody asked for. This is a much cheaper, second layer, fixed
 * behind everything.
 *
 * The first version of this only chased scroll position — a `scroll` event
 * listener that jumped every star straight to wherever the raw scrollY math
 * said it should be. That tracks correctly, but it isn't motion: a native
 * scroll event fires however often the browser and input device feel like
 * (choppy on a fast trackpad flick, dense on a slow one), and with nothing
 * smoothing between updates, each jump just snaps — which reads as "it
 * appeared," not "it flowed."
 *
 * This version runs a persistent requestAnimationFrame loop instead of
 * reacting to scroll events at all. Every frame it computes a target
 * progress from the current scrollY, and eases a separate, visible
 * progress value toward that target by a fixed fraction of the remaining
 * distance — the standard "critically damped follow" used for exactly this
 * kind of trailing motion. The visible value is what actually drives every
 * star's position, so it moves at a smooth, bounded rate every single frame
 * regardless of how scroll events happen to be batched, and it keeps
 * easing for a few frames after the scroll gesture itself has stopped,
 * which is the difference between "tracking scroll" and "flowing."
 */
export function Starfield() {
  const reduced = useReducedMotion();
  const [stars, setStars] = useState<Star[] | null>(null);
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const visibleProgressRef = useRef(0);

  useEffect(() => {
    // Deferred into a callback, not called synchronously in the effect body
    // — same shape Reveal uses its IntersectionObserver callback for, so
    // the one-time mount render isn't itself the thing setting state.
    const raf = requestAnimationFrame(() => setStars(generateStars(STAR_COUNT)));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!stars) return;

    if (reduced) {
      // No loop at all — every star already sits at rest in its final
      // spot (set in the JSX below), so there's nothing to animate toward.
      return;
    }

    // How much scrolling it takes to fully emerge — a little more than one
    // viewport, so the flow is still happening as the hero itself scrolls
    // out of view rather than finishing instantly.
    const range = Math.max(1, window.innerHeight * 1.15);

    function frame() {
      const target = Math.min(1, Math.max(0, window.scrollY / range));
      // Ease the visible value toward the target rather than snapping to
      // it — a fixed 12% of the remaining gap per frame, which at 60fps
      // settles in a few hundred milliseconds but never teleports.
      const current = visibleProgressRef.current;
      const next = current + (target - current) * 0.12;
      visibleProgressRef.current = Math.abs(next - target) < 0.0005 ? target : next;
      const progress = visibleProgressRef.current;

      stars!.forEach((star, i) => {
        const el = starRefs.current[i];
        if (!el) return;
        const local = Math.min(
          1,
          Math.max(0, (progress - star.startAt) / (1 - star.startAt)),
        );
        const eased = easeOutCubic(local);
        const x = star.originX + (star.x - star.originX) * eased;
        const y = star.originY + (star.y - star.originY) * eased;
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
        // Near the ring a star is a speck; fully out, its real size —
        // opacity stays the twinkle's alone, so the two properties never
        // collide over the same visual.
        el.style.transform = `scale(${0.15 + eased * 0.85})`;
      });

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
          className={`absolute rounded-full bg-chrome ${reduced ? "" : "animate-[twinkle_var(--star-duration)_ease-in-out_infinite]"}`}
          style={
            {
              // Reduced motion: sit at rest in the final scattered position,
              // full-grown, from the very first frame — nothing to scroll
              // for. Otherwise start at the ring; the rAF loop above takes
              // over from there, every frame, not just on scroll events.
              left: `${reduced ? star.x : star.originX}%`,
              top: `${reduced ? star.y : star.originY}%`,
              transform: reduced ? undefined : "scale(0.15)",
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: reduced ? star.maxOpacity : star.minOpacity,
              "--star-min": star.minOpacity,
              "--star-max": star.maxOpacity,
              "--star-duration": `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
