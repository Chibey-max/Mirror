"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MetalButton } from "@/components/MetalButton";
import type { Paging } from "@/hooks/usePaged";

/**
 * The foot of a paged list, in the site's own materials.
 *
 * Left, where you are: the page in the display serif, rolling over like an
 * odometer as the rows change, and the entries it holds. Right, the way
 * through: chrome-rimmed previous / next, and the page numbers sitting in a
 * recessed track with a drop of liquid metal (the How-it-works step's
 * material) that flows to the page you pick, stretching as it travels.
 * Above it all, a copper hairline for how far through the tape you are.
 */
export function Pager({
  paging,
  label,
  className = "",
}: {
  paging: Paging;
  /** What's being paged, for screen readers: "Verified tape pages". */
  label: string;
  className?: string;
}) {
  const { page, pageCount, goTo, phase, direction, start, rows, total } = paging;
  const trackRef = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ x: number; w: number } | null>(null);
  // Where the drop is headed: it moves the moment a page is picked, while
  // the rows are still leaving, so it reads as the cause of the turn.
  const [target, setTarget] = useState(page);
  const heading = phase === "idle" ? page : target;

  useLayoutEffect(() => {
    const el = trackRef.current?.querySelector<HTMLElement>(`[data-slot="${heading}"]`);
    if (el) setDrop({ x: el.offsetLeft, w: el.offsetWidth });
  }, [heading, pageCount]);

  function pick(next: number) {
    const clamped = Math.max(0, Math.min(next, pageCount - 1));
    if (clamped === page || phase === "out") return;
    setTarget(clamped);
    goTo(clamped);
  }

  const slots = pageSlots(heading, pageCount);
  const progress = ((page + 1) / pageCount) * 100;
  const numeralMotion =
    phase === "out" ? "pager-numeral-out" : phase === "in" ? "pager-numeral-in" : "";

  return (
    <div className={`relative ${className}`}>
      {/* How far through the tape: a copper hairline that eases along. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-border">
        <span
          className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,transparent,var(--particle-ink)_35%,var(--color-accent))] shadow-[0_0_10px_var(--particle-ink)] transition-[width] duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 pb-4 pt-5">
        <div className="flex items-end gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className="sr-only">Page </span>
            <span className="relative inline-block h-[1.1em] overflow-hidden font-display text-[2.1rem] leading-none tracking-tight text-text">
              <span
                className={`block tabular-nums ${numeralMotion}`}
                data-direction={direction}
              >
                {String(page + 1).padStart(2, "0")}
              </span>
            </span>
            <span className="font-display text-lg italic text-muted">
              of {String(pageCount).padStart(2, "0")}
            </span>
          </div>
          <p className="pb-1 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.12em] text-muted" aria-live="polite">
            Entries{" "}
            <span className="tabular-nums text-text">
              {start + 1}–{start + rows.length}
            </span>
            <br />
            of <span className="tabular-nums">{total}</span>
          </p>
        </div>

        <nav aria-label={label} className="flex items-center gap-3">
          <MetalButton
            tone="neutral"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => pick(page - 1)}
          >
            <Arrow back />
          </MetalButton>

          <div ref={trackRef} className="field relative flex items-center gap-0.5 rounded-full p-1">
            {drop && (
              // The holder glides; the drop inside remounts on each move so
              // its stretch and landing ripple play again.
              <span
                aria-hidden="true"
                className="pager-drop-slot absolute left-0 top-1 h-9"
                style={{ transform: `translateX(${drop.x}px)`, width: drop.w }}
              >
                <span key={heading} className="pager-drop absolute inset-0" />
              </span>
            )}
            {slots.map((slot, index) =>
              slot === "gap" ? (
                <span key={`gap-${index}`} aria-hidden="true" className="w-5 text-center text-muted/70">
                  ·
                </span>
              ) : (
                <button
                  key={slot}
                  type="button"
                  data-slot={slot}
                  onClick={() => pick(slot)}
                  aria-label={`Page ${slot + 1}`}
                  aria-current={slot === page ? "page" : undefined}
                  className={`relative z-10 h-9 min-w-9 rounded-full px-2 font-display text-[15px] tabular-nums transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                    slot === heading ? "text-text" : "text-muted hover:text-text"
                  }`}
                >
                  {slot + 1}
                </button>
              ),
            )}
          </div>

          <MetalButton
            tone="neutral"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount - 1}
            onClick={() => pick(page + 1)}
          >
            <Arrow />
          </MetalButton>
        </nav>
      </div>
    </div>
  );
}

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={`transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        back ? "rotate-180 group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"
      }`}
    >
      <path d="M3 8h9.5M8.5 4 12.5 8l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Which pages get a button, zero-based, with "gap" for skipped runs. */
export function pageSlots(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i);
  const last = pageCount - 1;
  // Near either end, show five in a row so the track never changes width.
  if (page <= 3) return [0, 1, 2, 3, 4, "gap", last];
  if (page >= last - 3) return [0, "gap", last - 4, last - 3, last - 2, last - 1, last];
  return [0, "gap", page - 1, page, page + 1, "gap", last];
}
