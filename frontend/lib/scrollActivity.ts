import { useSyncExternalStore } from "react";

/**
 * Whether the page is being scrolled right now: true from the first scroll
 * event until 180ms after the last. While it's true, <html> carries the
 * `is-scrolling` class, so decorative loops (CSS in globals.css, the metal
 * shaders via useIsScrolling) can hold still and leave the frame to the
 * scroll itself. One listener, shared by every subscriber.
 */
let scrolling = false;
let timer = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function onScroll() {
  if (!scrolling) {
    scrolling = true;
    document.documentElement.classList.add("is-scrolling");
    notify();
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    scrolling = false;
    document.documentElement.classList.remove("is-scrolling");
    notify();
  }, 180);
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("scroll", onScroll, { passive: true });
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("scroll", onScroll);
  };
}

export function useIsScrolling() {
  return useSyncExternalStore(subscribe, () => scrolling, () => false);
}
