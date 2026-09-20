import { WalletConnectButton } from "@/components/WalletConnectButton";
import { SiteHeader } from "@/components/SiteHeader";
import { SingularityHorizon } from "@/components/SingularityHorizon";
import { ProductPreview } from "@/components/ProductPreview";
import { MetalButton } from "@/components/MetalButton";
import { TapeTicker } from "@/components/TapeTicker";

function IconLedger() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10h8M8 14h8M8 18h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 19 6v6c0 4.4-3 7.6-7 8.5-4-.9-7-4.1-7-8.5V6l7-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12.2l2.1 2.1L15.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const claims = [
  {
    title: "Verifiable",
    body: "Every fill is an on-chain event with an oracle price and a timestamp, written to a ledger with no edit or delete function.",
    Icon: IconLedger,
  },
  {
    title: "Capped",
    body: "You set a daily spend cap per agent. The vault enforces it on-chain, and you hold the kill switch.",
    Icon: IconShield,
  },
  {
    title: "Honest",
    body: "Losing agents are listed as plainly as winning ones. No cherry-picked tape.",
    Icon: IconEye,
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      {/*
        The body sits in the top-left corner with its top edge 20px below the
        top of the page. The camera always looks at the origin, so the body
        lands dead centre of this box however it is sized — position the box
        and the body follows.

        Anchored to the page wrapper, not the hero section: the section starts
        wherever the header ends, so a top offset measured from it would move
        every time the header's height did.

        Vertical: the body's diameter is a fixed fraction of the box height
        (horizon radius / (camera distance x tan(fov/2))), so "top edge at
        20px" is 20px + radius - half the box — hence the calc against svh.
        Changing camDistance in SingularityHorizon moves the top edge.

        Horizontal: an offset from the viewport centre. The box is much wider
        than the screen so the rings still reach the right-hand edge.

        Smaller box on narrow viewports on purpose. The component dollies the
        camera out on a portrait canvas so the rings aren't cropped off both
        sides, which at the desktop size made the body wider than a phone.
      */}
      <div className="hero-canvas-mask pointer-events-none absolute left-[calc(50%-20vw)] top-[calc(20px-30.7svh)] z-0 h-[115svh] w-[170vw] -translate-x-1/2 sm:left-[calc(50%-35vw)] sm:top-[calc(20px-25.6svh)] sm:h-[145svh] sm:w-[180vw]">
        <SingularityHorizon height="100%" />
      </div>

      <SiteHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 px-5 py-10 sm:px-10 sm:py-12">
        <section className="relative flex min-h-[92svh] flex-col items-center pt-[36svh] pb-2 text-center sm:pt-[18svh]">
          {/*
            The copy sits in its own stacking context above the canvas, which
            is positioned at z-0 and would otherwise paint over ordinary
            in-flow content whatever the DOM order.
          */}
          <div className="relative z-10 flex flex-col items-center">
            {/*
              A scrim, only behind the copy. The body's chrome limb runs right
              through the first words of the paragraph, and at reading size
              that edge is brighter than the muted text crossing it. Dimming a
              soft ellipse under the words keeps both the composition and the
              rim — moving the copy or the body would have changed the shot.
            */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-[14%] -inset-y-12 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.62)_45%,transparent_72%)]"
            />

            <div className="relative z-10 flex items-center gap-2.5 rounded-full border border-border bg-black/85 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="whitespace-nowrap">Live on Robinhood Chain testnet</span>
              <span className="hidden text-chrome-dim sm:inline">/</span>
              <span className="hidden whitespace-nowrap sm:inline">Contracts verified</span>
            </div>

            <h1 className="font-display relative z-10 mt-7 max-w-[16ch] text-5xl font-black leading-[0.95] tracking-[-0.03em] text-text text-balance sm:text-7xl">
              Every trade on&#8209;chain. Every follow{" "}
              <em className="italic">capped</em>.
            </h1>

            <p className="relative z-10 mt-7 max-w-xl text-lg leading-relaxed text-muted text-balance">
              The trust layer for copy-trading Robinhood Stock Tokens — a
              tamper-proof track record, a hard daily cap, and a kill switch that
              always returns exactly what you put in.
            </p>

            <div className="relative z-10 mt-9 flex flex-wrap items-center justify-center gap-3">
              <WalletConnectButton />
              <MetalButton href="/agents">
                Browse agents, read-only
              </MetalButton>
            </div>

            <div className="relative z-10 mt-16 flex flex-col items-center gap-4">
              <span className="text-xs text-muted">
                Built on the stack it settles against
              </span>
              <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3 text-sm text-muted/70">
                <span className="font-display text-lg">Robinhood Chain</span>
                <span className="font-display text-lg">Arbitrum</span>
                <span className="tabular text-base">USDG</span>
                <span className="font-display text-lg">Chainlink</span>
              </div>
            </div>

          </div>

          <TapeTicker className="relative z-10 mt-14" />
        </section>

        <section>
          <ProductPreview />
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {claims.map(({ title, body, Icon }) => (
            <div
              key={title}
              className="panel flex flex-col gap-3 rounded-3xl p-6"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-chrome">
                <Icon />
              </span>
              <h2 className="font-display text-2xl">{title}</h2>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-5 pb-8 pt-4 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 border-t border-border pt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          <span>Deployed on Robinhood Chain testnet &middot; chain 46630</span>
          <span>Contracts verified &middot; open source</span>
        </div>
      </footer>
    </div>
  );
}
