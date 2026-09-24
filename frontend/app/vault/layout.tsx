import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vault",
  description: "Your deposits, follows, daily caps and every fill mirrored into your vault.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
