"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "@/components/MetalButton";

/** How long the outgoing page takes to settle away before the next arrives. */
const OUT_MS = 340;
/** Each arriving row starts this much after the one above it. */
const IN_STAGGER_MS = 60;
/** One row's arrival; matches pageRowIn in globals.css. */
const IN_MS = 820;

export type PagePhase = "idle" | "out" | "in";

/**
 * One page of a list, newest first, turned in two movements: the rows on
 * screen ease away, then the next page's rows rise in one after another.
 *
 * The page is clamped rather than reset when the list changes: a new fill
 * arriving at the top shouldn't throw a reader off page 3. With reduced
 * motion the page simply changes.
 */
export function usePaged<T>(
  items: T[],
  pageSize = 8,
  /** The top of the list: if it has scrolled out of view, a page turn
   *  brings it back so the new page is read from its first row. */
  anchor?: RefObject<HTMLElement | null>,
) {
  const reduced = useReducedMotion();
  const [requested, setRequested] = useState(0);
  const [phase, setPhase] = useState<PagePhase>("idle");
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const timers = useRef<number[]>([]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requested, pageCount - 1);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function goTo(next: number) {
    const target = Math.max(0, Math.min(next, pageCount - 1));
    if (target === page || phase === "out") return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setDirection(target > page ? "next" : "prev");

    const top = anchor?.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) {
      window.scrollTo({ top: window.scrollY + top - 120, behavior: reduced ? "auto" : "smooth" });
    }

    if (reduced) {
      setRequested(target);
      return;
    }
    setPhase("out");
    timers.current.push(
      window.setTimeout(() => {
        setRequested(target);
        setPhase("in");
        timers.current.push(
          window.setTimeout(() => setPhase("idle"), IN_MS + IN_STAGGER_MS * pageSize),
        );
      }, OUT_MS),
    );
  }

  const start = page * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    page,
    pageCount,
    goTo,
    phase,
    direction,
    rows,
    start,
    total: items.length,
    /** Rows short of a full page, for keeping a table's height steady. */
    missing: pageCount > 1 ? pageSize - rows.length : 0,
    paged: items.length > pageSize,
    /** Class and timing for one row of the page on screen. */
    rowMotion: (index: number) => {
      if (phase === "out") {
        // Leave bottom-up, quickly, so the eye is already back at the top.
        return {
          className: "page-row page-row-out",
          style: { transitionDelay: `${(rows.length - 1 - index) * 22}ms` },
        };
      }
      if (phase === "in") {
        return {
          className: "page-row page-row-in",
          style: { animationDelay: `${index * IN_STAGGER_MS}ms` },
        };
      }
      return { className: "page-row", style: undefined };
    },
  };
}

export type Paging = ReturnType<typeof usePaged>;
