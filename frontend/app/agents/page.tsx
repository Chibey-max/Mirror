import Link from "next/link";

// Day 3–4: AgentCard grid reading AgentRegistry + TrackRecord (PRD §5.2).
export default function AgentsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
      <p className="mt-2 text-muted">
        Agent list lands here once the registry is deployed.
      </p>
      <Link href="/" className="mt-6 inline-block text-accent">
        Back
      </Link>
    </main>
  );
}
