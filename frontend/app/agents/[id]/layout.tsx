import type { Metadata } from "next";

// Agent names live on-chain and the page reads them client-side, so the
// title uses the id rather than making the server wait on an RPC call.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    // Absolute: the /agents segment's own title stops the root template
    // from reaching this page, so the suffix is spelled out here.
    title: { absolute: `Agent #${id} · Mirror` },
    description: `Agent #${id}'s on-chain fill tape, realised PnL, and a capped follow you can kill at any time.`,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
