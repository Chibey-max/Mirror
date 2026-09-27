"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "@/components/MetalButton";

export type LoopStep = { title: string; short: string; body: string };

const STEP_INTERVAL_MS = 1800;
/** A beat on 06 before the loop starts over, so the end reads as an end. */
const LOOP_REST_MS = 3200;
/** 01 holds longer: after the wrap the swarm is still gathering there. */
const FIRST_HOLD_MS = 3400;
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
      last ? LOOP_REST_MS : active === 0 ? FIRST_HOLD_MS : STEP_INTERVAL_MS,
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
    <div ref={sectionRef} className="relative mt-10">
      {/* Outside the list, so its scatter on the wrap isn't clipped. */}
      <StepSwarm track={trackRef} active={started ? active : -1} />
      {/* The track: numbered circles on a hairline, short labels, and the
          swarm (StepSwarm) that carries the emphasis from one to the next. */}
      <ol
        ref={trackRef}
        className="relative flex items-start justify-between px-1 pb-1 pt-3"
      >
        {steps.map((step, index) => {
          const lit = started && index <= active;
          const isActive = started && index === active;
          return (
            <li
              key={step.title}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-2"
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

/** Motes in the ring, and the ring's gap outside a number's edge. */
const MOTES = 30;
const RING_GAP = 9;
/** One slow turn for the whole ring, radians a second. */
const TURN = 0.55;
/** A hop to the next step, and the wide scatter from 06 back to 01. */
const HOP_MS = 1250;
const SCATTER_MS = 2600;

type Mote = {
  /** Its fixed place on the ring, and a hair in or out for texture. */
  slot: number;
  lane: number;
  size: number;
  alpha: number;
  /** Where it wanders to on a scatter, as a direction and distance. */
  flingAngle: number;
  flingReach: number;
  /** Its own start within a scatter, so they don't leave in a block. */
  lag: number;
};

type Point = { x: number; y: number; r: number };

type Move =
  | { kind: "rest"; to: number }
  | {
      kind: "scatter";
      to: number;
      start: number;
      duration: number;
      /** true: the loop's wide drift across the whole track; false: a hop. */
      wide: boolean;
      /** Where each mote was when this move began, x/y interleaved. */
      origin: Float32Array;
      /** The step it's leaving, whose number the paths curve out around. */
      from: Point;
    };

function easeInOutSine(t: number) {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
}

/**
 * What carries the emphasis between steps: a ring of chrome motes that sits
 * just outside the active number, turning slowly as one. When the step
 * advances, the ring loosens: each mote flows to the next number on its own
 * gentle curve, a little above or below the line, leaving at its own
 * moment, and they settle back into a ring there. From 06 back to 01 the
 * same thing happens wide: the motes drift far apart across the whole
 * track, in every direction, and gather again around 01.
 *
 * Every mote's position is a function of time along a planned path (no
 * per-frame chasing or random jitter), which is what keeps it smooth. One
 * canvas over the track with room above and below for the scatter, drawn
 * only while on screen, in the theme's --color-chrome.
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
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !list || !host || !ctx) return;

    const motes: Mote[] = Array.from({ length: MOTES }, (_, i) => ({
      slot: (i / MOTES) * Math.PI * 2,
      lane: ((i % 3) - 1) * 1.6,
      size: 1 + (i % 3 === 1 ? 0.55 : 0.2) + Math.random() * 0.25,
      alpha: 0.55 + Math.random() * 0.4,
      flingAngle: Math.random() * Math.PI * 2,
      flingReach: 0.45 + Math.random() * 0.55,
      lag: Math.random() * 0.22,
    }));

    // The canvas overhangs the track by PAD above and below, for the scatter.
    const PAD = 90;
    let stops: Point[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let ink = "#dfe1e6";

    const measure = () => {
      const hostBox = host.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      width = hostBox.width;
      height = listBox.height + PAD * 2;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.top = `${listBox.top - hostBox.top - PAD}px`;
      stops = [...list.querySelectorAll<HTMLElement>("[data-step]")].map((button) => {
        const b = button.getBoundingClientRect();
        return {
          x: b.left - hostBox.left + b.width / 2,
          y: b.top - listBox.top + PAD + b.height / 2,
          r: b.width / 2,
        };
      });
      ink =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-chrome")
          .trim() || ink;
    };
    measure();

    // Where mote i sits on the ring around stop `at`, at time t (seconds).
    const ringX = (m: Mote, at: Point, t: number, cx = at.x) =>
      cx + Math.cos(m.slot + t * TURN) * (at.r + RING_GAP + m.lane);
    const ringY = (m: Mote, at: Point, t: number) =>
      at.y + Math.sin(m.slot + t * TURN) * (at.r + RING_GAP + m.lane);

    let move: Move | null = null;
    const px = new Float32Array(MOTES);
    const py = new Float32Array(MOTES);
    let raf = 0;
    let onScreen = false;

    const plan = (next: number, now: number) => {
      if (!move || !stops[next]) {
        move = { kind: "rest", to: next };
        return;
      }
      const current = move.to;
      // The loop's 06 to 01, or any jump back past a neighbour, drifts wide;
      // everything else is a hop. Either way it starts from wherever each
      // mote is right now, so a click mid-move carries on without a jump.
      const wide = next < current - 1 || (current === stops.length - 1 && next === 0);
      const origin = new Float32Array(MOTES * 2);
      for (let i = 0; i < MOTES; i++) {
        origin[i * 2] = px[i];
        origin[i * 2 + 1] = py[i];
      }
      move = {
        kind: "scatter",
        to: next,
        start: now,
        duration: wide ? SCATTER_MS : HOP_MS,
        wide,
        origin,
        from: stops[current] ?? stops[next],
      };
    };

    const frame = (now: number) => {
      raf = 0;
      const t = now / 1000;
      const target = activeRef.current;
      if (target >= 0 && (!move || move.to !== target)) plan(target, now);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = ink;

      if (move && stops[move.to]) {
        const to = stops[move.to];
        for (let i = 0; i < MOTES; i++) {
          const m = motes[i];
          let x: number;
          let y: number;
          let fade = 1;
          if (move.kind === "rest") {
            x = ringX(m, to, t);
            y = ringY(m, to, t);
          } else {
            // A cubic curve: out from where it was, through its own point
            // well away from the track, round to its place on the ring at
            // the new step. Each leaves at its own moment.
            const raw = ((now - move.start) / move.duration - m.lag) / (1 - 0.22);
            const p = easeInOutSine(raw);
            const ox = move.origin[i * 2];
            const oy = move.origin[i * 2 + 1];
            // Every path leaves its number outward and arrives at the next
            // from outside, never through a number: the first control point
            // sits out along the mote's own radius from the step it's
            // leaving, the second out along its radius at the step it's
            // headed for, and both are lifted to the mote's side of the
            // line (above if it started above), so the curve clears the
            // numbers in between as well.
            const from = move.from;
            const R = to.r + RING_GAP;
            const leave = Math.atan2(oy - from.y, ox - from.x);
            const arrive = m.slot + t * TURN;
            const side = Math.sin(leave) < -0.15 ? -1 : Math.sin(leave) > 0.15 ? 1 : Math.sin(m.flingAngle) < 0 ? -1 : 1;
            let out: number;
            let lift: number;
            let spreadX = 0;
            if (move.wide) {
              // Wide: far out, high or low, and across the track.
              out = 50 + m.flingReach * 90;
              lift = 30 + m.flingReach * 60;
              spreadX = width * 0.22 * m.flingReach * Math.cos(m.flingAngle);
            } else {
              // A hop: loosen into a cloud that clears the line.
              out = R * 0.55 + m.flingReach * 12;
              lift = R * 0.9 + m.flingReach * 16;
            }
            const ax = ox + Math.cos(leave) * out + spreadX;
            const ay = oy + Math.sin(leave) * out * 0.6 + side * lift;
            const bx = to.x + Math.cos(arrive) * out - spreadX * 0.6;
            const by = to.y + Math.sin(arrive) * out * 0.6 + side * lift;
            const ex = ringX(m, to, t);
            const ey = ringY(m, to, t);
            const u = 1 - p;
            x = u * u * u * ox + 3 * u * u * p * ax + 3 * u * p * p * bx + p * p * p * ex;
            y = u * u * u * oy + 3 * u * u * p * ay + 3 * u * p * p * by + p * p * p * ey;
            // A little dimmer while spread out, full again once gathered.
            fade = 1 - (move.wide ? 0.4 : 0.25) * Math.sin(Math.PI * p);
            if (raw >= 1 && i === MOTES - 1) move = { kind: "rest", to: move.to };
          }
          px[i] = x;
          py[i] = y;
          ctx.globalAlpha = m.alpha * fade;
          ctx.beginPath();
          ctx.arc(x, y, m.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (onScreen) raf = requestAnimationFrame(frame);
    };

    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen && !raf) raf = requestAnimationFrame(frame);
    });
    visibility.observe(list);
    const resize = new ResizeObserver(measure);
    resize.observe(host);
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
      className="pointer-events-none absolute left-0 z-20"
    />
  );
}
