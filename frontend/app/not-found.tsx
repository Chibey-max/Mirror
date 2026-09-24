import { MetalButton } from "@/components/MetalButton";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { PageHeader } from "@/components/PageHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <div className="relative overflow-x-clip">
      <PageAtmosphere />
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="outline-none mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10"
      >
        <PageHeader
          eyebrow="404"
          title="Nothing recorded here"
          description="This page doesn't exist. Every agent, fill and follow on Mirror lives on-chain, and the ledger below is where to find them."
        />
        <div className="mt-8 flex flex-wrap gap-2">
          <MetalButton href="/agents" tone="primary">
            Browse agents
          </MetalButton>
          <MetalButton href="/" tone="quiet">
            Back to Mirror
          </MetalButton>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
