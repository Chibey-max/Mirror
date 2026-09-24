"use client";

import { useEffect, useState } from "react";

/**
 * The "i" trigger + explanatory panel TrustBadge invented, extracted so it
 * has exactly one implementation (briefing §09.F: "TrustBadge already has a
 * toggle; extract that, do not grow a second pattern").
 *
 * Click toggles it open; losing focus closes it, no hover state, so it
 * works the same on a phone as a desktop.
 */
export function InfoTooltip({
  text,
  label = "Why this matters",
}: {
  text: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="text-muted transition hover:text-text"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-chrome-dim text-[10px] leading-none">
          i
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-64 panel rounded-2xl p-3 text-xs text-muted">
          {text}
        </div>
      )}
    </div>
  );
}

const COPIED_RESET_MS = 1600;

/**
 * A hash or address, truncated for reading, click-to-copy for verifying,
 * design prompt §5's "full strategy hash, copyable" and briefing §09.F,
 * which asks for one component covering the strategy hash, the oracle round
 * id, and any other truncated address rather than a bespoke click handler
 * wherever one shows up.
 *
 * Copies the FULL value, never the truncated display string, the point is
 * pasting something a judge can look up, and a truncated hash isn't that.
 */
export function CopyableHash({
  value,
  display,
  label = "Copy the full value",
}: {
  /** The complete value copied to the clipboard. */
  value: string;
  /** What's shown before copying, defaults to first 6 / last 4 of `value`. */
  display?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access can be denied (permissions, insecure context),
      // fails quietly rather than showing a confirmation that didn't happen.
    }
  }

  const shown = display ?? `${value.slice(0, 6)}…${value.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={value}
      className="tabular inline-flex items-center gap-1.5 text-inherit outline-none transition-colors hover:text-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/60 focus-visible:outline-offset-2"
    >
      <span className="truncate">{copied ? "Copied" : shown}</span>
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="flex-none opacity-60"
      >
        {copied ? (
          <path
            d="M5 12.5 10 17.5 19 7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
      </svg>
    </button>
  );
}
