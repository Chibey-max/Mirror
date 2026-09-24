import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Agents ranked by realised PnL from their on-chain fills. Losing agents stay where the number puts them.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
