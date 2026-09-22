"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/components/MetalButton";

/**
 * Fades and lifts a section in once it's actually on screen, instead of
 * animating everything at once on page load. One IntersectionObserver per
 * instance rather than a scroll listener, cheaper, and it fires once and
 * disconnects rather than tracking position on every frame.
 *
 * Reduced motion shows the content immediately, fully visible, the
 * animation is a flourish on the way in, never a gate on reading it.
 */
export function Reveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [observed, setObserved] = useState(false);
  const reduced = useReducedMotion();
  // Reduced motion needs no observer at all, derived here rather than set
  // from inside the effect, so the effect only ever calls setState from the
  // observer's own callback, never synchronously in its body.
  const visible = reduced || observed;

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setObserved(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: visible ? `${delayMs}ms` : "0ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className={`transition-[opacity,transform] duration-1000 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
