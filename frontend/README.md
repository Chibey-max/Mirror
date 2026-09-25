# Mirror frontend

Next.js 16 frontend for the Mirror registry, tape, policies, and vault. It uses Wagmi/Viem with injected-wallet and WalletConnect connectors; RainbowKit was removed to eliminate its vulnerable production dependency tree.

## Local fixture mode

```bash
cp .env.example .env.local
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Keep `NEXT_PUBLIC_MIRROR_MODE=fixture` until live manifests exist. Fixture mode has an unavoidable page banner and `isDeployed` remains false, so simulated content cannot be mistaken for contract-backed state.

## Live mode

These integration steps belong to the frontend owner. The contract/deployment owner hands off
the finalized manifests and verified contract addresses; they do not own frontend configuration
or wallet/UI smoke testing.

1. Confirm the deployment owner has committed finalized `deployments/46630.json` and `deployments/421614.json` manifests derived from mined receipts.
2. Run `npm run sync:deployments`; do not edit `lib/deployments.generated.ts` by hand.
3. Set `NEXT_PUBLIC_MIRROR_MODE=live`, a real WalletConnect project ID, and the public RPC/explorer endpoints.
4. Run `npm run check:abi`, `npm audit --omit=dev`, tests, lint, and a production build.

Live mode throws during build if any Robinhood core address remains zero or WalletConnect configuration is absent. The frontend never receives deployer, admin, runner, or registrar keys.

Prices from TrackRecord use 8 decimals. USDG balances, caps, and notional use 6. Every wallet write requires a successful mined receipt; a status-0 receipt is shown as failure.
