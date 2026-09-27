"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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
  const trackRef = useRef<HTMLOListElement>(null);
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
      {/* The track: numbered circles on a hairline, short labels, and the
          swarm (StepSwarm) that carries the emphasis from one to the next. */}
      <ol
        ref={trackRef}
        className="relative flex items-start justify-between overflow-x-auto px-1 pb-1 pt-3 sm:overflow-visible"
      >
        <StepSwarm track={trackRef} active={started ? active : -1} />
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
                  className={`absolute right-[calc(50%+18px)] top-[18px] h-px w-[calc(100%-36px)] transition-colors duration-700 sm:top-5 ${
                    lit ? "bg-chrome-dim/60" : "bg-border"
                  }`}
                />
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
                data-step={index}
                className={`tabular relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full border font-mono text-xs outline-none transition-[transform,color,border-color,background-color] duration-500 ease-out focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/60 focus-visible:outline-offset-4 sm:h-10 sm:w-10 sm:text-sm ${
                  isActive
                    ? "step-liquid scale-[1.18] text-text"
                    : lit
                      ? "border-chrome-dim bg-surface text-chrome"
                      : "border-border bg-surface text-muted"
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </button>
              <span
                className={`text-center font-mono text-[9px] uppercase tracking-[0.06em] transition-colors duration-500 sm:text-[10px] ${
                  isActive ? "text-text" : lit ? "text-chrome" : "text-muted"
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

type Mote = {
  /** How tightly it follows the swarm's centre: low trails behind. */
  follow: number;
  /** Its place in the cloud: angle, distance, and how fast it circles. */
  angle: number;
  reach: number;
  spin: number;
  size: number;
  alpha: number;
};

const MOTES = 56;

/**
 * What carries the emphasis between steps: a cloud of chrome motes, like a
 * bead of mercury, instead of a line filling in. It flows along the track to
 * the active step, stretching out behind itself as it travels (each mote
 * follows the centre at its own lag), and on arrival it gathers into a
 * slow orbit around the active number. On the wrap from 06 back to 01 it
 * sweeps the whole track.
 *
 * One canvas over the track, drawn only while the section is on screen, in
 * the theme's --color-chrome so it's light on black and ink on paper. The
 * step positions are measured from the buttons themselves, so it follows the
 * layout at every width, including the scrolling track on a phone.
 */
function StepSwarm({
  track,
  active,
}: {
  track: RefObject<HTMLOListElement | null>;
  active: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const list = track.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !list || !ctx) return;

    const motes: Mote[] = Array.from({ length: MOTES }, () => ({
      follow: 0.09 + Math.random() * 0.18,
      angle: Math.random() * Math.PI * 2,
      reach: Math.random(),
      spin: (0.4 + Math.random() * 0.9) * (Math.random() < 0.5 ? -1 : 1),
      size: 0.6 + Math.random() * 1.6,
      alpha: 0.35 + Math.random() * 0.6,
    }));
    const mx = new Float32Array(MOTES);
    const my = new Float32Array(MOTES);

    let stops: { x: number; y: number; r: number }[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let ink = "#dfe1e6";

    const measure = () => {
      const box = list.getBoundingClientRect();
      width = list.scrollWidth;
      height = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      stops = [...list.querySelectorAll<HTMLElement>("[data-step]")].map((button) => {
        const b = button.getBoundingClientRect();
        return {
          x: b.left - box.left + list.scrollLeft + b.width / 2,
          y: b.top - box.top + b.height / 2,
          r: b.width / 2,
        };
      });
      ink =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-chrome")
          .trim() || ink;
    };
    measure();

    // The swarm's centre, on a critically damped spring toward its step.
    let cx = stops[0]?.x ?? 0;
    let vx = 0;
    let seeded = false;
    let raf = 0;
    let last = 0;
    let onScreen = false;

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const target = stops[activeRef.current];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (target) {
        if (!seeded) {
          cx = target.x;
          for (let i = 0; i < MOTES; i++) {
            mx[i] = target.x;
            my[i] = target.y;
          }
          seeded = true;
        }
        // Spring toward the step: quick enough to arrive with the step's
        // own splash (about a third of a second), damped so it doesn't
        // overshoot the number.
        const stiffness = 80;
        const damping = 2 * Math.sqrt(stiffness);
        vx += ((target.x - cx) * stiffness - vx * damping) * dt;
        cx += vx * dt;
        const speed = Math.min(1, Math.abs(vx) / 900);
        const seconds = now / 1000;

        ctx.fillStyle = ink;
        for (let i = 0; i < MOTES; i++) {
          const mote = motes[i];
          // Travelling, the cloud is a tight, stretched bead; at rest it
          // opens into a ring just outside the number.
          const ring = target.r + 5 + mote.reach * 5;
          const cloud = 3 + mote.reach * 9;
          const orbit = ring * (1 - speed) + cloud * speed;
          const a = mote.angle + seconds * mote.spin * (0.6 + speed * 2);
          const ox = Math.cos(a) * orbit;
          const oy = Math.sin(a) * orbit * (1 - speed * 0.55);
          // Each mote chases its own point with its own lag, which is what
          // draws the travelling bead out into a tail.
          const k = 1 - Math.pow(1 - mote.follow, dt * 60);
          mx[i] += (cx + ox - mx[i]) * k;
          my[i] += (target.y + oy - my[i]) * k;
          ctx.globalAlpha = mote.alpha * (0.55 + speed * 0.45);
          ctx.beginPath();
          ctx.arc(mx[i], my[i], mote.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (onScreen) raf = requestAnimationFrame(frame);
    };

    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    });
    visibility.observe(list);
    const resize = new ResizeObserver(() => {
      measure();
    });
    resize.observe(list);
    const theme = new MutationObserver(measure);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelAnimationFrame(raf);
      visibility.disconnect();
      resize.disconnect();
      theme.disconnect();
    };
  }, [track]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-20"
    />
  );
}
