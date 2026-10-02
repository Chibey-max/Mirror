"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MetalButton } from "@/components/MetalButton";

/**
 * Page numbers with a highlight that glides to the current page rather than
 * jumping, and previous / next in the site's metal buttons.
 *
 * Seven slots at most: the first and last page always, the current one with
 * a neighbour each side, and an ellipsis where pages are skipped, so the bar
 * keeps its width however long the tape grows.
 */
export function Pager({
  page,
  pageCount,
  onChange,
  label,
}: {
  /** Zero-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** What's being paged, for screen readers: "Verified tape pages". */
  label: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [glide, setGlide] = useState<{ x: number; w: number } | null>(null);

  // Measured, not computed: an ellipsis makes slot positions uneven.
  useLayoutEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>("[aria-current='page']");
    if (active) setGlide({ x: active.offsetLeft, w: active.offsetWidth });
  }, [page, pageCount]);

  const slots = pageSlots(page, pageCount);

  return (
    <nav aria-label={label} className="flex items-center gap-1.5">
      <MetalButton
        tone="quiet"
        size="icon-sm"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <Chevron flip />
      </MetalButton>

      <div ref={listRef} className="relative flex items-center gap-1">
        {glide && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-8 rounded-full border border-accent/30 bg-[var(--row-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_6px_16px_-10px_var(--panel-hover-shadow)] transition-[transform,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${glide.x}px)`, width: glide.w }}
          />
        )}
        {slots.map((slot, index) =>
          slot === "gap" ? (
            <span key={`gap-${index}`} aria-hidden="true" className="w-6 text-center font-mono text-xs text-muted">
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              onClick={() => onChange(slot)}
              aria-label={`Page ${slot + 1}`}
              aria-current={slot === page ? "page" : undefined}
              className={`relative h-8 min-w-8 rounded-full px-2 font-mono text-xs tabular-nums transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                slot === page ? "text-text" : "text-muted hover:text-text"
              }`}
            >
              {slot + 1}
            </button>
          ),
        )}
      </div>

      <MetalButton
        tone="quiet"
        size="icon-sm"
        aria-label="Next page"
        disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
      >
        <Chevron />
      </MetalButton>
    </nav>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      className={flip ? "rotate-180" : undefined}
    >
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Which pages get a button, zero-based, with "gap" for skipped runs. */
export function pageSlots(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i);
  const last = pageCount - 1;
  // Near either end, show five in a row so the bar never shrinks.
  if (page <= 3) return [0, 1, 2, 3, 4, "gap", last];
  if (page >= last - 3) return [0, "gap", last - 4, last - 3, last - 2, last - 1, last];
  return [0, "gap", page - 1, page, page + 1, "gap", last];
}

/** "1–8 of 24": which rows this page holds. */
export function Showing({ start, shown, total }: { start: number; shown: number; total: number }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted" aria-live="polite">
      <span className="tabular-nums text-text">
        {start + 1}–{start + shown}
      </span>{" "}
      of <span className="tabular-nums">{total}</span>
    </p>
  );
}
