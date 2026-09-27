"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/MetalButton";

export type LoopStep = { title: string; short: string; body: string };

const STEP_INTERVAL_MS = 1800;
/** A beat on 06 before the loop starts over, so the end reads as an end. */
const LOOP_REST_MS = 3200;
/** How long a visitor's own click holds the walk before it resumes. */
const RESUME_AFTER_MS = 9000;

/**
 * The six-step loop, horizontal: a numbered track with one shared detail
 * panel underneath rather than six full text blocks side by side, which is
 * what actually makes six steps fit at any width. Once the section enters
 * view, the emphasis walks 01 → 06 on its own, a spotlight, not a read
 * order the visitor has to scroll to discover — then pauses on 06 and
 * starts again, so the loop the copy describes is a loop on screen too.
 * Any circle can be clicked at any time and the walk yields to it; it
 * picks up again a few seconds later, from wherever the visitor left it,
 * rather than stopping for good and leaving a dead section behind.
 *
 * Reduced motion skips all of it and renders the original plain list,
 * every step's full text, visible at once, nothing gated behind an
 * animation or a click.
 */
export function LoopSteps({ steps }: { steps: LoopStep[] }) {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  // Starts the sequence once, the first time the section is actually seen.
  useEffect(() => {
    if (reduced) return;
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  /*
   * The walk. Wrapping on the last step rather than stopping is what makes
   * it a loop; the longer rest there keeps 06 from feeling like a step the
   * eye skipped. The trailing fill line clears on the wrap, so the track
   * re-draws from 01 instead of snapping back fully lit.
   */
  useEffect(() => {
    if (!started || !autoplay || reduced) return;
    const last = active >= steps.length - 1;
    const timer = setTimeout(
      () => setActive((i) => (i >= steps.length - 1 ? 0 : i + 1)),
      last ? LOOP_REST_MS : STEP_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [started, autoplay, active, steps.length, reduced]);

  /*
   * A click wins, but only for a while. Without this the section stops dead
   * at whichever step was tapped and never moves again, which reads as
   * broken on a page where everything else is still alive.
   */
  useEffect(() => {
    if (autoplay || reduced) return;
    const timer = setTimeout(() => setAutoplay(true), RESUME_AFTER_MS);
    return () => clearTimeout(timer);
  }, [autoplay, reduced]);

  if (reduced) {
    return (
      <ol className="relative mx-auto mt-10 flex max-w-2xl flex-col gap-0">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-5 pb-10 last:pb-0">
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-px bg-border"
              />
            )}
            <span className="tabular relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full border border-border bg-surface font-mono text-sm text-chrome">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="pt-1.5">
              <h3 className="font-display text-xl">{step.title}</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div ref={sectionRef} className="mt-10">
      {/* The track: numbered circles, a fill line between them, short labels. */}
      <ol className="relative flex items-start justify-between overflow-x-auto px-1 pb-1 sm:overflow-visible">
        {steps.map((step, index) => {
          const lit = started && index <= active;
          const isActive = started && index === active;
          return (
            <li
              key={step.title}
              className="relative flex min-w-[64px] flex-1 flex-col items-center gap-2 sm:min-w-0"
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-[calc(50%+18px)] top-[18px] h-px w-[calc(100%-36px)] bg-border"
                >
                  <span
                    className="block h-full bg-[linear-gradient(90deg,var(--color-chrome-dim),var(--color-accent))] transition-[width] duration-500 ease-out"
                    style={{ width: lit ? "100%" : "0%" }}
                  />
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setAutoplay(false);
                  setActive(index);
                  setStarted(true);
                }}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${step.title}`}
                className={`tabular relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full border font-mono text-xs outline-none transition-all duration-500 ease-out focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/60 focus-visible:outline-offset-4 sm:h-10 sm:w-10 sm:text-sm ${
                  isActive
                    ? "scale-[1.15] border-accent bg-accent/15 text-accent"
                    : lit
                      ? "border-chrome-dim bg-surface text-chrome"
                      : "border-border bg-surface text-muted"
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </button>
              <span
                className={`text-center font-mono text-[9px] uppercase tracking-[0.06em] transition-colors duration-500 sm:text-[10px] ${
                  isActive ? "text-accent" : lit ? "text-text" : "text-muted"
                }`}
              >
                {step.short}
              </span>
            </li>
          );
        })}
      </ol>

      {/* The shared detail panel, every step's content stacked in the same
          grid cell, crossfading via opacity so nothing reflows as the
          emphasis moves. */}
      <div className="relative mx-auto mt-8 grid max-w-xl text-center">
        {steps.map((step, index) => (
          <div
            key={step.title}
            aria-hidden={index !== active}
            className={`[grid-area:1/1] transition-[opacity,transform] duration-500 ease-out ${
              index === active
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-1 opacity-0"
            }`}
          >
            <h3 className="font-display text-2xl">{step.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-muted text-balance">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
