import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrumSepolia, robinhoodTestnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Mirror",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "MIRROR_DEV",
  chains: [robinhoodTestnet, arbitrumSepolia],
  ssr: true,
});
