"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MetalLayers,
  useMetalShaderSlot,
  useReducedMotion,
} from "@/components/MetalButton";
import { Logo } from "@/components/Logo";
import { NetworkBadge } from "@/components/NetworkBadge";
import { PendingTxIndicator } from "@/components/TransactionToasts";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/vault", label: "Vault" },
];

/**
 * Underline every nav link carries: a hairline that scales in from the
 * centre on hover or keyboard focus, in the same chrome-to-copper-to-chrome
 * gradient the buttons' liquid rim uses, the nav's own, much cheaper,
 * answer to the same material. A real WebGL shader per link would blow the
 * page's shared shader-slot budget on decoration; this is CSS.
 *
 * The active page keeps its underline lit without the hover/focus scale-in,
 * so "you're here" reads as settled and "you're about to click" reads as
 * responsive, the same distinction MetalButton draws between idle and
 * pressed.
 */
function NavLink({
  href,
  label,
  active,
  compact = false,
}: {
  href: string;
  label: string;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-1.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] outline-none transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/60 focus-visible:outline-offset-4 ${
        active ? "text-text" : "text-muted hover:text-text"
      }`}
    >
      {!compact && (
        <span
          aria-hidden="true"
          className={`h-1 w-1 rounded-full transition-colors ${
            active ? "bg-accent" : "bg-transparent"
          }`}
        />
      )}
      {label}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-1 left-0 right-0 h-px origin-center bg-[linear-gradient(90deg,transparent,var(--color-chrome)_30%,var(--color-accent)_50%,var(--color-chrome)_70%,transparent)] transition-[transform,opacity] duration-300 ease-out ${
          active
            ? "scale-x-100 opacity-90"
            : "scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-100 group-focus-visible:scale-x-100 group-focus-visible:opacity-100"
        }`}
      />
    </Link>
  );
}

/**
 * The one header, on every screen.
 *
 * A pill that hugs its contents rather than a bar spanning the page, wearing
 * the same liquid rim as the buttons, `strip`, because the button settings
 * bunch every highlight into the middle of something this long and thin.
 *
 * Sticky, and in flow, so the hero's canvas, positioned against the page
 * wrapper, is unaffected. Hides on scroll-down past a small threshold and
 * reappears on scroll-up (or near the top), a long agent tape or the
 * leaderboard table shouldn't spend a sticky header's worth of vertical
 * space the whole way down.
 *
 * The inner pages used to have no navigation at all, only a text "Back" link.
 */
export function SiteHeader() {
  const shader = useMetalShaderSlot();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const hiddenRef = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      const goingDown = y > lastY.current;
      // Never hide near the top, there's nothing to reclaim yet, and a
      // header that vanishes on the first pixel of scroll reads as broken.
      // Only a change re-renders: scroll fires dozens of times a second,
      // and setting the same value still costs a render pass.
      const next = goingDown && y > 96;
      if (next !== hiddenRef.current) {
        hiddenRef.current = next;
        setHidden(next);
      }
      lastY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-3 z-30 flex flex-col items-center px-4 transition-transform ${
        reduced ? "duration-0" : "duration-300"
      } ease-out ${hidden ? "-translate-y-[calc(100%+1rem)]" : "translate-y-0"}`}
    >
      <div className="relative isolate flex h-16 items-center gap-6 rounded-full pr-2.5 pl-7">
        <MetalLayers shader={shader} speed={reduced ? 0 : 0.45} strip />

        <div className="relative z-10">
          <Logo />
        </div>

        <nav className="relative z-10 hidden items-center gap-5 sm:flex">
          {NAV.map(({ href, label }) => (
            <NavLink key={href} href={href} label={label} active={isActive(href)} />
          ))}
        </nav>

        {/* Anything still in flight, wherever it was started from. */}
        <div className="relative z-10 hidden sm:block">
          <PendingTxIndicator />
        </div>

        {/* The live chain, and the way to change it. */}
        <div className="relative z-10 hidden lg:block">
          <NetworkBadge />
        </div>

        <div className="relative z-10">
          <WalletConnectButton />
        </div>
      </div>

      {/*
        The links don't fit in the pill beside the wallet button on a phone, so
        they sit under it rather than disappearing, without this there is no
        way off the landing page on mobile at all.
      */}
      <nav className="mt-2 flex items-center gap-4 sm:hidden">
        {NAV.map(({ href, label }) => (
          <NavLink key={href} href={href} label={label} active={isActive(href)} compact />
        ))}
        <div className="h-3 w-px bg-border" aria-hidden="true" />
        <NetworkBadge compact />
        <PendingTxIndicator />
      </nav>
    </header>
  );
}
