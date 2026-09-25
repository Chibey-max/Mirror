import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { NetworkGuard } from "@/components/NetworkGuard";
import { mirrorMode } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Display-only face for headlines and hero-scale numerals. Everything else
 * stays Geist, this isn't a font swap, it's one deliberate accent.
 *
 * Was Instrument Serif, swapped after feedback that the hero read as too
 * thin. Instrument Serif only ships one weight (400); no CSS font-weight
 * makes a single-weight face heavier, the font file itself is thin. Fraunces
 * has a genuine 600-900 range plus an optical-size axis tuned for large
 * display text, which is what "bolder and thicker" actually requires.
 */
const fraunces = Fraunces({
  variable: "--font-display",
  weight: ["600", "700", "900"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mirror: on-chain agent track records",
  description:
    "A tamper-proof on-chain performance ledger for trading agents, with a hard-capped copy vault.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-bg text-text"
      >
        {/* First stop for a keyboard user: past the header straight to the
            page. Invisible until focused. Every page's <main> carries the id. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-text focus:outline focus:outline-1 focus:outline-accent"
        >
          Skip to content
        </a>
        <Providers>
          <NetworkGuard>
            {mirrorMode === "fixture" && (
              <div className="bg-warn px-3 py-1 text-center font-mono text-xs font-bold tracking-wide text-black">
                FIXTURE MODE — simulated data; no live contract writes
              </div>
            )}
            {children}
          </NetworkGuard>
        </Providers>
      </body>
    </html>
  );
}
