"use client";

import { useId } from "react";
import Link from "next/link";

/**
 * The mark and the wordmark, together.
 *
 * The mark is a distilled version of the hero itself, an open ring with a
 * body caught in its orbit, rather than a generic monogram, so the icon a
 * tab shows and the thing the landing page spends a WebGL scene on are
 * recognisably the same object. Traced with the same chrome-into-copper
 * gradient the nav underline and the buttons' liquid rim use, so the three
 * are read as one material rather than three separate decisions.
 *
 * The wordmark's italic second half echoes the hero's own emphasis
 * ("Every follow *capped*.") instead of inventing a fourth typographic
 * idea, the same Fraunces italic the app already uses for the one word
 * per sentence that matters most.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  // A page-unique gradient id, two instances (header + footer, say) would
  // otherwise collide and both resolve to whichever <defs> paints last.
  const gradientId = `logo-mark-gradient-${useId()}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="flex-none"
    >
      <defs>
        <linearGradient id={gradientId} x1="3" y1="5" x2="27" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2f3f5" />
          <stop offset="0.55" stopColor="#e2a97f" />
          <stop offset="1" stopColor="#5d5f66" />
        </linearGradient>
      </defs>
      <path
        d="M6.5 21.5 A11 11 0 1 1 23.5 8.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20.5" cy="20.5" r="6" fill={`url(#${gradientId})`} />
    </svg>
  );
}

export function Logo({
  markSize = 24,
  textClassName = "text-xl",
}: {
  markSize?: number;
  textClassName?: string;
}) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2"
      aria-label="Mirror, home"
    >
      <LogoMark size={markSize} />
      <span className={`font-display tracking-tight text-text ${textClassName}`}>
        Mir<span className="italic">ror</span>
      </span>
    </Link>
  );
}
