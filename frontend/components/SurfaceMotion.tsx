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
 * measures. Writes are batched to one per frame.
 *
 * A phone has no hover, so there it works two other ways (TouchSurfaces):
 * a press lights the surface under the finger, and as the page scrolls, the
 * cards and rows crossing the middle of the screen light up in turn. No
 * tilt on touch: tipping under a finger reads as the page lurching.
 */
export function SurfaceMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Touch mode only on a device with no mouse or trackpad at all (a phone
    // or tablet). A desktop that merely reports touch as its primary input,
    // a touchscreen laptop, keeps the pointer behaviour.
    if (window.matchMedia("(any-hover: none)").matches) {
      return touchSurfaces();
    }

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

    // Chrome fires a synthetic pointermove after a scroll so hover can catch
    // up with what slid under a still cursor; it arrives at the same
    // coordinates. Only a real move lights a surface, so scrolling on a
    // desktop never focuses anything by itself.
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (event.clientX === lastX && event.clientY === lastY) return;
      lastX = event.clientX;
      lastY = event.clientY;
      pending = event;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      pending = null;
      if (hot) cool(hot);
      hot = null;
    };
    // Scrolling moves the page out from under the pointer: let go of what
    // was lit until the mouse moves again.
    const onScroll = () => {
      pending = null;
      if (hot) cool(hot);
      hot = null;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      if (hot) cool(hot);
    };
  }, []);

  return null;
}

/** The surfaces that light up as they scroll through the middle of a phone
 *  screen: cards and rows, not the large panels that hold them. */
const FOCUSABLE = ".tilt, .lift, .data-row, [data-surface]";

function place(el: HTMLElement, x: number, y: number) {
  el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
  el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
  el.style.setProperty("--px", ((x - 0.5) * 2).toFixed(3));
  el.style.setProperty("--py", ((y - 0.5) * 2).toFixed(3));
}

function touchSurfaces(): () => void {
  // 1. A press: light the surface where the finger is, ease off after.
  let pressed: HTMLElement | null = null;
  let release = 0;
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(SURFACES)
        : null;
    if (!target) return;
    window.clearTimeout(release);
    if (pressed && pressed !== target) pressed.removeAttribute("data-pressed");
    pressed = target;
    const rect = target.getBoundingClientRect();
    place(
      target,
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
    target.setAttribute("data-pressed", "");
  };
  const onUp = () => {
    const el = pressed;
    if (!el) return;
    release = window.setTimeout(() => el.removeAttribute("data-pressed"), 450);
  };

  // 2. Scrolling: whatever crosses the middle band of the screen is lit, its
  //    light from the top edge, so the page answers the scroll the way it
  //    answers a mouse.
  const band = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          place(el, 0.5, 0.1);
          el.setAttribute("data-hot", "");
        } else {
          el.removeAttribute("data-hot");
        }
      }
    },
    { rootMargin: "-40% 0px -40% 0px" },
  );
  const watched = new WeakSet<Element>();
  const watch = () => {
    for (const el of document.querySelectorAll(FOCUSABLE)) {
      if (watched.has(el)) continue;
      watched.add(el);
      band.observe(el);
    }
  };
  watch();
  // Cards arrive after their data does, and pages change without a reload.
  let pendingWatch = 0;
  const mutations = new MutationObserver(() => {
    if (pendingWatch) return;
    pendingWatch = window.setTimeout(() => {
      pendingWatch = 0;
      watch();
    }, 200);
  });
  mutations.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerup", onUp, { passive: true });
  document.addEventListener("pointercancel", onUp, { passive: true });
  return () => {
    document.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    band.disconnect();
    mutations.disconnect();
    window.clearTimeout(release);
    window.clearTimeout(pendingWatch);
  };
}
