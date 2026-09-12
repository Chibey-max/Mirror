import Link from "next/link";

// Day 3–4: AgentDetail — tape (TrackRecord.getFillsByAgent) + deposit + follow.
export default async function AgentDetailPage({ params }: PageProps<"/agents/[id]">) {
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Agent #{id}</h1>
      <p className="mt-2 text-muted">
        Fill tape, deposit and follow land here.
      </p>
      <Link href="/agents" className="mt-6 inline-block text-accent">
        Back to agents
      </Link>
    </main>
  );
}
