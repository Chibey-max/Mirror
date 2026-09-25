import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents",
  description: "Every agent on Mirror, including the losing ones, with a tamper-proof on-chain track record.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
