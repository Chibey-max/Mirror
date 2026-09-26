import { WalletConnectButton } from "@/components/WalletConnectButton";
import { LoopSteps, type LoopStep } from "@/components/LoopSteps";
import { Reveal } from "@/components/Reveal";
import { Starfield } from "@/components/Starfield";
import { SiteFooter } from "@/components/SiteFooter";
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
    contract: "AgentRegistry + TrackRecord",
    body: "Every fill is an on-chain event with an oracle price and a timestamp, written to a ledger with no edit or delete function.",
    Icon: IconLedger,
  },
  {
    title: "Capped",
    contract: "PolicyModule + CopyVault",
    body: "You set a daily spend cap per agent. The vault enforces it on-chain, and you hold the kill switch: an unlock, not a stop, that always returns exactly what you put in.",
    Icon: IconShield,
  },
  {
    title: "Honest",
    contract: "The same ledger, unedited",
    body: "Losing agents are listed as plainly as winning ones, ranked by the same number the winners are. No cherry-picked tape.",
    Icon: IconEye,
  },
];

/**
 * The user-facing half of the on-chain loop (PRD §11's one-page test),
 * turned into the landing page's own walkthrough, the same sequence the
 * demo runs, in the order a first-time visitor would actually hit it.
 */
const loopSteps: LoopStep[] = [
  {
    title: "Connect",
    short: "Connect",
    body: "RainbowKit, switch to Robinhood Chain testnet. Browsing the tape itself never needs a wallet at all.",
  },
  {
    title: "Deposit",
    short: "Deposit",
    body: "USDG into the vault. Approve, then deposit, both re-read from chain once they land, never assumed.",
  },
  {
    title: "Follow, with a cap",
    short: "Follow",
    body: "A daily notional cap per agent, enforced on-chain. Not a setting in a modal, but a number PolicyModule actually checks.",
  },
  {
    title: "Fills land",
    short: "Fills land",
    body: "Every fill mirrors into your vault, gets blocked with the exact cause, or never touches you at all. Never a guess about which.",
  },
  {
    title: "Kill, any time",
    short: "Kill",
    body: "An unlock, not a stop. Unfollow always returns exactly the principal you put in, never a mark-to-market.",
  },
  {
    title: "Withdraw",
    short: "Withdraw",
    body: "Free balance back to your wallet, on your own schedule.",
  },
];

/**
 * What a visitor who already knows this space will compare Mirror to,
 * answered before they have to ask. Framed by category, not by naming
 * other teams' products on our own page.
 */
const contrasts = [
  {
    category: "Copy-trading dashboards and vault managers",
    they: "ask you to trust a screenshot, or a manager's word for it.",
    mirror: "Every fill here is an on-chain event with an oracle snapshot. Nobody, including us, can edit it. The agent never had custody of your funds.",
  },
  {
    category: "“AI decides for you” agents",
    they: "make the trading decision on your behalf.",
    mirror: "Mirror doesn't decide anything. It proves what an agent already did, and enforces a hard cap on what it can do next.",
  },
  {
    category: "Agent-credit and lending rails",
    they: "answer “can this agent borrow.”",
    mirror: "Mirror answers “can I trust this tape enough to follow it, and exactly how much can it cost me if I'm wrong.”",
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <Starfield />
      {/*
        The body sits in the top-left corner with its top edge 20px below the
        top of the page. The camera always looks at the origin, so the body
        lands dead centre of this box however it is sized, position the box
        and the body follows.

        Anchored to the page wrapper, not the hero section: the section starts
        wherever the header ends, so a top offset measured from it would move
        every time the header's height did.

        Vertical: the body's diameter is a fixed fraction of the box height
        (horizon radius / (camera distance x tan(fov/2))), so "top edge at
        20px" is 20px + radius - half the box, hence the calc against svh.
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

      <main id="main-content" tabIndex={-1} className="relative z-10 outline-none mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 px-5 py-10 sm:px-10 sm:py-12">
        <section className="relative flex min-h-[92svh] flex-col items-center pt-[15svh] pb-2 text-center sm:pt-[18svh]">
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
              rim, moving the copy or the body would have changed the shot.
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
              The trust layer for copy-trading Robinhood Stock Tokens: a
              tamper-proof track record, a hard daily cap, and a kill switch that
              always returns exactly what you put in.
            </p>

            {/* Always exactly two buttons on one row: the wallet list sits
                behind Connect wallet, however many wallets the browser
                announces, and the second label shortens on a phone so the
                pair still fits side by side at 320px. */}
            <div className="relative z-10 mt-8 flex items-center justify-center gap-3 sm:mt-9">
              <WalletConnectButton menuAlign="start" />
              <MetalButton href="/agents">
                <span className="sm:hidden">Browse agents</span>
                <span className="hidden sm:inline">Browse agents, read-only</span>
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

        {/*
          The problem, said by name, before the product, the same order the
          demo script opens in. A visitor who doesn't yet know what Mirror is
          should read this and recognise their own experience before seeing
          a single screen of the app.
        */}
        <Reveal>
          <section className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
              The problem
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Every &ldquo;AI trading agent&rdquo; has a PnL screenshot. None of
              them are verifiable.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted text-balance">
              A trader who wants exposure to a specific agent&rsquo;s strategy
              has usually already been burned by an edited or cherry-picked
              tape on Twitter or Telegram. What they want isn&rsquo;t another
              promise. It&rsquo;s a constraint they can check themselves, on an
              explorer, without asking anyone&rsquo;s permission.
            </p>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <div className="mx-auto max-w-xl text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
                The product
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Not a dashboard. A ledger with a demo attached.
              </h2>
            </div>
            <div className="mt-8">
              <ProductPreview />
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="grid gap-4 sm:grid-cols-3">
            {claims.map(({ title, contract, body, Icon }) => (
              <div
                key={title}
                className="lift panel flex flex-col gap-3 rounded-3xl p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-chrome">
                  <Icon />
                </span>
                <h3 className="font-display text-2xl">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{body}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-chrome-dim">
                  {contract}
                </p>
              </div>
            ))}
          </section>
        </Reveal>

        {/*
          PRD §11's one-page test as content: the same sequence the demo
          runs, in order, so a visitor can read the whole loop before ever
          connecting a wallet.
        */}
        <section>
          <Reveal>
            <div className="mx-auto max-w-xl text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
                How the loop runs
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Six steps. Every one of them a chain read.
              </h2>
            </div>
          </Reveal>

          <LoopSteps steps={loopSteps} />
        </section>

        {/*
          Pre-emptive contrasts (briefing §12): say the comparison before the
          visitor makes it themselves. Framed by category rather than naming
          other teams' products on our own page.
        */}
        <section>
          <Reveal>
            <div className="mx-auto max-w-xl text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
                How this is different
              </p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Not a promise. A constraint you can check yourself.
              </h2>
            </div>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {contrasts.map((row, index) => (
              <Reveal key={row.category} delayMs={index * 90}>
                <div className="lift panel flex h-full flex-col gap-3 rounded-3xl p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                    {row.category}
                  </p>
                  <p className="text-sm leading-relaxed text-muted">
                    <span className="text-chrome-dim">They </span>
                    {row.they}
                  </p>
                  <p className="text-sm leading-relaxed text-text">
                    <span className="accent-text font-medium">Mirror </span>
                    {row.mirror}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter wide />
    </div>
  );
}
