"use client";

import { useSyncExternalStore } from "react";

type MirrorTheme = "nocturne" | "prism";

const STORAGE_KEY = "mirror-theme";

/** Prism (light) unless Nocturne has been chosen, matching the theme script
 *  in app/layout.tsx that sets it before the first paint. */
function getTheme(): MirrorTheme {
  if (typeof document === "undefined") return "prism";
  return document.documentElement.dataset.theme === "nocturne"
    ? "nocturne"
    : "prism";
}

function setTheme(theme: MirrorTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "prism" ? "light" : "dark";
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new Event("mirror-theme-change"));
}

function subscribeTheme(notify: () => void) {
  window.addEventListener("mirror-theme-change", notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener("mirror-theme-change", notify);
    window.removeEventListener("storage", notify);
  };
}

function Icon({ theme }: { theme: MirrorTheme }) {
  if (theme === "prism") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 2.75v2.1M12 19.15v2.1M4.85 4.85l1.48 1.48M17.67 17.67l1.48 1.48M2.75 12h2.1M19.15 12h2.1M4.85 19.15l1.48-1.48M17.67 6.33l1.48-1.48"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M20.1 14.6A7.85 7.85 0 0 1 9.4 3.9 8.3 8.3 0 1 0 20.1 14.6Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * One round button, not a switch.
 *
 * A sliding track with both icons and a label states the mode twice and
 * takes the width of a nav item to do it. A single icon showing the mode you
 * would go to is the smaller, more common shape, and it survives being
 * dropped into the header pill next to the wallet button or the mobile row.
 *
 * Both icons stay mounted and the pair rotates as one: the moon turns up and
 * out as the sun turns in, so the change reads as one object turning rather
 * than a swap.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "prism");

  const nextTheme = theme === "nocturne" ? "prism" : "nocturne";
  const label = `Switch to ${nextTheme === "prism" ? "Prism" : "Nocturne"} mode`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={theme === "prism"}
      onClick={() => {
        setTheme(nextTheme);
      }}
      className={`relative isolate grid shrink-0 place-items-center rounded-full border border-border bg-surface/88 text-muted shadow-[0_10px_28px_-18px_var(--theme-shadow)] outline-none transition-[border-color,background-color,color,box-shadow] duration-300 hover:border-chrome-dim hover:text-text focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        compact ? "h-8 w-8" : "h-9 w-9"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 grid place-items-center transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          theme === "nocturne"
            ? "opacity-100 rotate-0 scale-100"
            : "opacity-0 -rotate-90 scale-50"
        }`}
      >
        <Icon theme="nocturne" />
      </span>
      <span
        aria-hidden="true"
        className={`absolute inset-0 grid place-items-center transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          theme === "prism"
            ? "opacity-100 rotate-0 scale-100"
            : "opacity-0 rotate-90 scale-50"
        }`}
      >
        <Icon theme="prism" />
      </span>
    </button>
  );
}
