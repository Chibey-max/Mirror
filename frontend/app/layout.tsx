import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { NetworkGuard } from "@/components/NetworkGuard";
import { mirrorMode } from "@/lib/config";

/*
 * All three faces are self-hosted from app/fonts (Latin subset, variable,
 * OFL-licensed; licenses alongside). next/font/google downloads them at
 * build time, and when that download failed it silently shipped a fallback
 * serif in place of Fraunces: the page looked broken with only a build
 * warning to show for it. Local files make the typeface part of the build.
 */
const geistSans = localFont({
  src: "./fonts/geist.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
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
const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces.woff2", weight: "600 900", style: "normal" },
    { path: "./fonts/fraunces-italic.woff2", weight: "600 900", style: "italic" },
  ],
  variable: "--font-display",
});

const description =
  "Every trade on-chain, every follow capped. A tamper-proof track record for trading agents on Robinhood Chain Stock Tokens, a hard daily cap, and a kill switch that always returns what you put in.";

// Preview images need an absolute URL. NEXT_PUBLIC_SITE_URL is the public
// address once there is one; Vercel previews supply VERCEL_URL.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mirror: on-chain agent track records",
    template: "%s · Mirror",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "Mirror",
    title: "Mirror: on-chain agent track records",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Mirror: on-chain agent track records",
    description,
  },
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
