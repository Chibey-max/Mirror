"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MetalLayers,
  useMetalShaderSlot,
  useReducedMotion,
} from "@/components/MetalButton";
import { NetworkBadge } from "@/components/NetworkBadge";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/vault", label: "Vault" },
];

/**
 * The one header, on every screen.
 *
 * A pill that hugs its contents rather than a bar spanning the page, wearing
 * the same liquid rim as the buttons — `strip`, because the button settings
 * bunch every highlight into the middle of something this long and thin.
 *
 * Sticky, and in flow, so the hero's canvas — positioned against the page
 * wrapper — is unaffected.
 *
 * The inner pages used to have no navigation at all, only a text "Back" link.
 */
export function SiteHeader() {
  const shader = useMetalShaderSlot();
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-3 z-30 flex flex-col items-center px-4">
      <div className="relative isolate flex h-16 items-center gap-6 rounded-full pr-2.5 pl-7">
        <MetalLayers shader={shader} speed={reduced ? 0 : 0.45} strip />

        <Link
          href="/"
          className="relative z-10 font-display text-xl tracking-tight text-text"
          aria-label="Mirror, home"
        >
          Mirror
        </Link>

        <nav className="relative z-10 hidden items-center gap-5 sm:flex">
          {NAV.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
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
              </Link>
            );
          })}
        </nav>

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
        they sit under it rather than disappearing — without this there is no
        way off the landing page on mobile at all.
      */}
      <nav className="mt-2 flex items-center gap-5 sm:hidden">
        {NAV.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
                active ? "text-text" : "text-muted"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <span aria-hidden="true" className="text-chrome-dim">/</span>
        <NetworkBadge compact />
      </nav>
    </header>
  );
}
