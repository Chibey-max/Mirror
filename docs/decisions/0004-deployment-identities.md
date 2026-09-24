# 0004 — Deployment identities

Date: 23 September 2026. Owner: Jason. Applies to both Robinhood Chain testnet (46630) and Arbitrum Sepolia (421614).

Mirror uses four testnet-only EOAs with non-zero, pairwise-distinct addresses. The same four role wallets may be used on both supported testnets, but no role may share a key with another role. None may be a personal wallet or hold real funds.

| Identity | Deployment input | On-chain authority | Operational rule |
| --- | --- | --- | --- |
| Deployer | `DEPLOYER_PRIVATE_KEY` | None after construction | A fresh nonce-zero wallet on both chains. Deploys contracts only; any prior transaction makes the script refuse deployment. |
| PolicyModule admin | `POLICY_ADMIN_PRIVATE_KEY` | `PolicyModule.owner()`; token allowlist and Ownable transfer/renounce | Use for the initial allowlist and later allowlist maintenance. Keep offline except for admin transactions. |
| Runner | `RUNNER_ADDRESS` in the deploy environment; its private key lives only in the runner's ignored environment | Immutable `TrackRecord.runner()` and `CopyVault.runner()` | Online service key. It may record and mirror fills, but cannot administer policy or own/deactivate agents. |
| Agent registrar/owner | `AGENT_REGISTRAR_PRIVATE_KEY` | `AgentRegistry.Agent.owner` for every demo agent; may deactivate those agents | Registers Pulse, Red and Drift and captures their IDs from receipts. It is the emergency brake if the runner is compromised. |

The deploy script must derive the deployer, admin and registrar addresses from their keys, reject a zero `RUNNER_ADDRESS`, and reject every pairwise equality before broadcasting. It must broadcast allowlist calls as the admin and registrations as the registrar. Deployment manifests record the four public addresses and the receipt-derived agent IDs, never private keys.

All four identities need testnet gas for their actual duties: deployer for creation, admin for allowlisting, registrar for registration/deactivation and runner for `recordFill`/`mirrorFill`. Frontend code receives contract addresses only and never receives any of these keys.

The release smoke test uses a fifth, non-privileged testnet-only follower wallet. It is not an
operational role, receives no administrative authority, and is funded only to exercise
mint/deposit/follow/unfollow/withdraw on the primary Robinhood testnet deployment. This preserves
the deployer's deployment-only boundary and keeps the smoke evidence independent of privileged
roles.
