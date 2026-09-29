import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arbitrumSepolia, robinhoodTestnet } from "./chains";
import { walletConnectProjectId } from "./config";

const projectId = walletConnectProjectId();
// The page's own origin once in a browser (WalletConnect checks the
// metadata URL against the site that opened the request); the deployment's
// on the server, where no connection is ever made.
const origin =
  typeof window === "undefined"
    ? "https://mirror-onchain.vercel.app"
    : window.location.origin;

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, arbitrumSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId,
      showQrModal: true,
      // What a phone wallet shows when asked to approve the connection:
      // Mirror, not a generic "WalletConnect" request from nowhere.
      metadata: {
        name: "Mirror",
        description: "On-chain agent track records, every follow capped.",
        url: origin,
        icons: [`${origin}/icon.svg`],
      },
    }),
  ],
  transports: {
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
    [arbitrumSepolia.id]: http(arbitrumSepolia.rpcUrls.default.http[0]),
  },
  ssr: true,
});
