"use client";

import { useEffect } from "react";

/** Everything that answers the pointer: panels, table and list rows, and
 *  anything opted in with data-surface. Overlays are .panel-static. */
const SURFACES = ".panel:not(.panel-static), .data-row, [data-surface]";

/**
 * One pointer listener for every surface on the page, instead of a handler
 * per component (most of them are server components and can't have one).
 *
 * It finds the surface under the pointer, the innermost one, so hovering a
 * table row lights that row and not the whole table, and writes where the
 * pointer is into CSS custom properties on it:
 *
 *   --gx, --gy  pointer position in %, for the spotlight and edge light
 *   --px, --py  the same as -1..1, for the parallax on .pop elements
 *   --rx, --ry  tilt in degrees, only on .tilt cards
 *
 * and marks it data-hot. Everything visual is CSS in globals.css; this only
 * measures. Writes are batched to one per frame. Mouse only: a touch has no
 * hover, and tilting under a finger reads as the page lurching.
 */
export function SurfaceMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let hot: HTMLElement | null = null;
    let pending: PointerEvent | null = null;
    let raf = 0;

    const cool = (el: HTMLElement) => {
      el.removeAttribute("data-hot");
      for (const [name, value] of [
        ["--rx", "0deg"],
        ["--ry", "0deg"],
        ["--px", "0"],
        ["--py", "0"],
      ]) {
        el.style.setProperty(name, value);
      }
    };

    const apply = () => {
      raf = 0;
      const event = pending;
      if (!event) return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(SURFACES)
          : null;
      if (target !== hot) {
        if (hot) cool(hot);
        hot = target;
        hot?.setAttribute("data-hot", "");
      }
      if (!hot) return;

      const rect = hot.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      const style = hot.style;
      style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
      style.setProperty("--px", ((x - 0.5) * 2).toFixed(3));
      style.setProperty("--py", ((y - 0.5) * 2).toFixed(3));
      if (hot.classList.contains("tilt")) {
        // Top edge tips away when the pointer is near it, like pressing on
        // a card lying on a table.
        style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
        style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pending = event;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      pending = null;
      if (hot) cool(hot);
      hot = null;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      if (hot) cool(hot);
    };
  }, []);

  return null;
}
