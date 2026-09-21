"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/components/MetalButton";

type Star = {
  x: number;
  y: number;
  size: number;
  minOpacity: number;
  maxOpacity: number;
  duration: number;
  delay: number;
};

const STAR_COUNT = 160;

/**
 * The ring's own field, extended past the hero — the same particles the
 * hero's WebGL ring is built from, read as though they kept drifting down
 * the page rather than stopping at the fold. Built separately from
 * SingularityHorizon rather than by extending its canvas: that component's
 * camera math is tuned to one exact on-screen invariant (§ its own
 * comments), and growing it to page height would mean re-deriving that math
 * for a shot nobody asked for. This is a much cheaper, second layer:
 * fixed behind everything, visible only where the hero's opaque canvas
 * doesn't already cover — which is to say, from the fold on.
 *
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
      size: 1 + Math.random() * 2.4,
      minOpacity: base * 0.35,
      maxOpacity: Math.min(1, base * 1.7),
      duration: 2.4 + Math.random() * 4.5,
      delay: -Math.random() * 6,
    };
  });
}

export function Starfield() {
  const reduced = useReducedMotion();
  const [stars, setStars] = useState<Star[] | null>(null);

  useEffect(() => {
    // Deferred into a callback, not called synchronously in the effect body
    // — same shape Reveal uses its IntersectionObserver callback for, so
    // the one-time mount render isn't itself the thing setting state.
    const raf = requestAnimationFrame(() => setStars(generateStars(STAR_COUNT)));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!stars) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden"
    >
      {/*
        The ring's own trail: a soft arc of light continuing the hero's
        gradient down past the fold, at a fraction of the hero's opacity —
        presence, not a second copy of the ring.
      */}
      <div className="absolute left-1/2 top-0 h-[140vh] w-[220vw] -translate-x-1/2 opacity-[0.07] [background:radial-gradient(ellipse_60%_35%_at_50%_0%,var(--color-chrome)_0%,var(--color-accent)_38%,transparent_70%)]" />

      {stars.map((star, i) => (
        <span
          key={i}
          className={`absolute rounded-full bg-chrome ${reduced ? "" : "animate-[twinkle_var(--star-duration)_ease-in-out_infinite]"}`}
          style={
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
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
