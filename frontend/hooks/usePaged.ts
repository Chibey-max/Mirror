"use client";

import { useState } from "react";

/**
 * One page of a list, newest first, and which way the reader last moved, so
 * the incoming rows can slide in from that side.
 *
 * The page is clamped rather than reset when the list changes: a new fill
 * arriving at the top shouldn't throw a reader off page 3.
 */
export function usePaged<T>(items: T[], pageSize = 8) {
  const [requested, setRequested] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requested, pageCount - 1);

  function goTo(next: number) {
    const target = Math.max(0, Math.min(next, pageCount - 1));
    if (target === page) return;
    setDirection(target > page ? "next" : "prev");
    setRequested(target);
  }

  const start = page * pageSize;
  return {
    page,
    pageCount,
    goTo,
    direction,
    rows: items.slice(start, start + pageSize),
    start,
    /** Rows short of a full page, for keeping the table's height steady. */
    missing: pageCount > 1 ? pageSize - Math.min(pageSize, items.length - start) : 0,
    paged: items.length > pageSize,
    /** Class + per-row delay for the arriving page. */
    rowMotion: (index: number) => ({
      className:
        direction === "next"
          ? "motion-safe:animate-[pageInNext_0.5s_cubic-bezier(0.16,1,0.3,1)_backwards]"
          : "motion-safe:animate-[pageInPrev_0.5s_cubic-bezier(0.16,1,0.3,1)_backwards]",
      style: { animationDelay: `${index * 35}ms` },
    }),
  };
}
