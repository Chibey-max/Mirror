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
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-1.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] outline-none transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent/60 focus-visible:outline-offset-4 ${
        active ? "text-text" : "text-muted hover:text-text"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1 w-1 rounded-full transition-colors ${
          active ? "bg-accent" : "bg-transparent"
        }`}
      />
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
    <>
      <header
        className={`sticky top-0 z-30 flex flex-col items-center px-4 pt-3 pb-3 transition-transform ${
          reduced ? "duration-0" : "duration-300"
        } ease-out ${hidden ? "-translate-y-[calc(100%+1rem)]" : "translate-y-0"}`}
      >
        <div className="relative isolate flex h-16 max-w-full items-center gap-3 rounded-full pr-2.5 pl-5 sm:gap-6 sm:pl-7">
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
          On a phone the page links live in the bottom tab bar (below); what's
          left up here is status: the chain and anything still in flight.
        */}
        <div className="mt-2 flex items-center gap-3 sm:hidden">
          <NetworkBadge compact />
          <PendingTxIndicator />
        </div>
      </header>

      {/*
        Outside <header> on purpose: the header hides itself with a transform,
        and a fixed element inside a transformed parent is pinned to that
        parent instead of the screen.
      */}
      <BottomTabBar isActive={isActive} />
    </>
  );
}

const TABS: { href: string; label: string; icon: React.ReactNode }[] = [
  {
    href: "/",
    label: "Home",
    icon: (
      <>
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </>
    ),
  },
  {
    href: "/agents",
    label: "Agents",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    href: "/leaderboard",
    label: "Ranks",
    icon: (
      <>
        <path d="M18 20V10" />
        <path d="M12 20V4" />
        <path d="M6 20v-6" />
      </>
    ),
  },
  {
    href: "/vault",
    label: "Vault",
    icon: (
      <>
        <rect width="18" height="11" x="3" y="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
];

/**
 * Page navigation on a phone, at the bottom of the screen where a thumb can
 * reach it one-handed, instead of a row of small links under the header at
 * the far end of the screen.
 *
 * Always visible, unlike the header, since it's how you move between pages.
 * The same chrome rim as the header, drawn in CSS rather than with a live
 * shader: it sits on screen the whole time, and a second animated WebGL
 * surface costs more than it adds. Body padding for it is in globals.css.
 */
function BottomTabBar({ isActive }: { isActive: (href: string) => boolean }) {
  return (
    <nav
      aria-label="Pages"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-30 sm:hidden"
    >
      <div className="relative isolate mx-auto flex h-16 max-w-md items-stretch rounded-full px-2">
        <MetalLayers shader={false} speed={0} />
        {TABS.map(({ href, label, icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 flex flex-1 flex-col items-center justify-center gap-1 rounded-full font-mono text-[10px] uppercase tracking-[0.1em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 ${
                active ? "text-text" : "text-muted"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={active ? "text-accent" : ""}
              >
                {icon}
              </svg>
              {label}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
