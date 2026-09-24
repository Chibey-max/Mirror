import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arbitrumSepolia, robinhoodTestnet } from "./chains";
import { walletConnectProjectId } from "./config";

const projectId = walletConnectProjectId();

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, arbitrumSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId, showQrModal: true }),
  ],
  transports: {
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
    [arbitrumSepolia.id]: http(arbitrumSepolia.rpcUrls.default.http[0]),
  },
  ssr: true,
});
