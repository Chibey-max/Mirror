# Mirror — Claude Design master prompt

Paste everything below the line into claude.ai/design.

---

Design a **clickable, high-fidelity prototype** for **Mirror**, a web3 app, with **every screen in both desktop (1440×900) and mobile (390×844)** layouts. Hook the screens together so I can click through the whole user journey.

## What Mirror is
Mirror is a tamper-proof, on-chain performance ledger for AI trading agents on **Robinhood Chain testnet**, plus a **hard-capped copy-vault**. A user can follow an agent's trades without ever giving it custody of more than a daily cap they set themselves.

The user: a retail investor who has been burned by edited PnL screenshots on Twitter and Telegram. They want **proof, not promises**.

The product makes three claims, and the UI must make each one obvious:
1. **Verifiable**: every trade ("fill") is a permanent on-chain record with an oracle price and timestamp. Nothing can be edited or deleted, and every fill links to the block explorer.
2. **Capital-safe**: the follower sets a hard daily spend cap, only allowlisted tokens can be traded, and the follower has a kill switch. The agent never holds their money.
3. **Honest**: losing agents are shown just as prominently as winning ones.

## Reference sites (for UX patterns and feel, not to copy)
Study these for layout, interaction patterns and overall feel. Mirror keeps its **own original brand**, so don't copy any site's logo, name, illustrations, exact layouts or trademarked visual elements.

| Site | What to learn from it |
|---|---|
| **Robinhood Crypto**: https://robinhood.com/us/en/crypto/ | The main reference for feel. A huge headline figure, a single clean line chart that changes color with performance, generous negative space, a calm dark premium mood, and one bold accent color |
| **Robinhood app, asset detail pages** | A big price on top, the chart with range pills beneath it, then key stats, then activity. Very little chrome |
| **Coinbase**: https://www.coinbase.com/explore | Asset list rows (name, sparkline, price, % change), clean data tables, and trustworthy, calm fintech copy |
| **Phantom**: https://phantom.com | Mobile-first wallet UX, bottom sheets, friendly transaction confirmations, and clear pending/success states |
| **Uniswap**: https://app.uniswap.org | Minimal centered action cards (amount input, Max, one primary button), inline validation, and how the flow goes from approval to transaction to confirmation |
| **Hyperliquid**: https://app.hyperliquid.xyz | Dense but readable trading tables, live trade feeds, mono numerals, and leaderboard presentation |
| **Polymarket**: https://polymarket.com | Card grids for browsing items (our agent cards), big % figures, and a leaderboard page |
| **Wagmi + WalletConnect**: https://wagmi.sh | The wallet picker and wrong-network switch pattern use the app's own UI over Wagmi connectors |
| **Etherscan / Blockscout**: https://arbitrum.blockscout.com | What the explorer link lands on. Our tx and fill links should feel like a natural hand-off to it |

## Visual direction
Blend the references above into Mirror's own look: **dark, calm, confident, very little chrome**, with the premium, number-first feel of Robinhood Crypto, the tables of Coinbase and Hyperliquid, and the transaction UX of Uniswap and Phantom.

- **Theme**: near-black background (#0A0B0D), slightly raised surfaces (#131518 and #1B1E22), hairline borders (#23272C), off-white text (#F2F3F5), muted text (#8A9099).
- **Accent**: one electric green for gains, primary actions and "verified" (around #00E28A). Coral red for losses, reverts and kill (around #FF5A4E). Amber only for warnings like wrong network or pending (around #FFB547). No other colors.
- **Typography**: a distinctive grotesk for UI and headlines (for example Instrument Sans or General Sans; avoid Inter and Roboto), and a monospace with tabular figures (JetBrains Mono or Geist Mono) for numbers, addresses, hashes and prices. **Big numerals** for balances and PnL (48–72px on desktop).
- **Charts**: thin single-line price and PnL charts with no gridlines, a soft gradient fade under the line, a scrubbable crosshair and time-range pills (1H · 1D · 1W · ALL). The line is green if up and red if down.
- **Motion**: subtle only. Numbers tick when a balance updates, new rows slide into tables, and modals rise as bottom sheets on mobile.
- **Icons**: thin stroke icons in one consistent set. No emoji.
- **Logo**: a simple original wordmark "Mirror", optionally with a mark of two mirrored strokes or a reflected chevron.
- **Avoid**: gradient-heavy backgrounds, glassmorphism overload, cards with colored left borders, and stock "AI robot" imagery.

## Sample data (use it consistently across every screen)
- **Network**: Robinhood Chain Testnet (chain ID 46630)
- **Stablecoin**: USDG (6 decimals). **Stock tokens**: mNVDA, mAAPL, mTSLA
- **Agents** (exactly 3):
  - **Pulse**: momentum strategy, **winner**. +18.4% all-time, 142 fills. Model version `pulse-v1.2`, strategy hash `0x8d32…d0c3`
  - **Red**: mean-reversion strategy, **the loser, shown honestly**. −11.7% all-time, 128 fills. Model version `red-v1.0`, strategy hash `0xacbf…69f9`
  - **Drift**: pairs strategy, roughly flat. +1.2%, 37 fills. Model version `drift-v1.0`, strategy hash `0xe394…a573`
- **Wallet**: `0x9F2c…41aB`. Wallet USDG 250.00, vault free balance 150.00, allocated to Pulse 50.00
- **Example fill**: BUY 0.42 mNVDA @ $128.41 · 2 min ago · block #1,284,392 · tx `0x5c1e…a9f0`

## Screens (every one in desktop and mobile)

### 1. Landing / connect (`/`)
- The hero states the one-line promise, for example: **"Every trade on-chain. Every follow capped. No screenshots."** A short sub-line explains the verifiable track record and hard-capped copy-trading on Robinhood Chain.
- One primary CTA: **Connect wallet**.
- A live strip shows the three agents with sparkline, PnL and fill count, including Red in red.
- A "How it works" section with three beats matching the three claims: Verifiable, Capped, Honest.
- A trust footer: "Deployed on Robinhood Chain testnet · Contracts verified · Open source", with explorer links.
- **Connect wallet control**: offer an injected browser wallet and WalletConnect, with an explicit wrong-network switch state.

### 2. Wrong-network guard
- If the wallet is on the wrong chain (for example Ethereum mainnet), block the whole app with an overlay: "You're on Ethereum. Mirror runs on Robinhood Chain testnet." It needs one big button, **Switch to Robinhood Chain testnet**. No instructions to read.
- States: default, switching (spinner), and "Network not found in wallet → Add network".

### 3. App shell
- **Desktop**: top nav with the logo, Agents, Leaderboard, a network pill (green dot + "Robinhood Testnet") and a wallet chip showing the address and vault balance.
- **Mobile**: compact header plus a bottom tab bar (Agents · Leaderboard · Vault).
- A persistent **Vault summary**: free balance, total allocated, and Deposit and Withdraw buttons.
- A **Get test USDG** faucet button for empty wallets (it mints mock USDG).

### 4. Agent list (`/agents`)
- One card per agent: name, strategy type, short strategy hash (mono), fill count, all-time PnL (big, colored), a sparkline, and a "Following" badge if the user follows it.
- **Red must be clearly visible, never hidden or pushed down.** Give it a clear "Losing agent" tag. It's a deliberate trust signal.
- Sort control: PnL · Fills · Newest.
- States: loading skeletons, and an empty/error state (RPC unreachable).

### 5. Agent detail (`/agents/[id]`), shown for Pulse and for Red
- Header: agent name, strategy type, model version, full strategy hash (copyable), registered date, and a status (Active or Deactivated).
- A **big PnL figure plus a line chart** with range pills.
- A **TrustBadge** near the top: "✓ 142 fills · 0 edits · verified through block #1,284,392", with a small "Why this matters" tooltip ("The ledger has no edit or delete function").
- **Fill tape (AgentTapeTable)**: token, side (BUY in green / SELL in red), size, price, time, and an **explorer link icon on every row**. The explorer links are the proof, so make them clearly visible. Paginated, with new rows animating in live.
- On mobile the tape becomes stacked rows, each still with its own explorer link.
- The primary CTA is **Follow Pulse**. If the user already follows it, show their follow panel instead: cap, spent today (progress bar against the cap), allocation, and a **Kill switch**.

### 6. Deposit modal (bottom sheet on mobile)
- Amount input in USDG with a Max button and the wallet balance shown.
- Two steps with a visible stepper: **1. Approve USDG → 2. Deposit**.
- Separate states for each step: idle, waiting for the wallet signature, pending on-chain (with a tx link), success ("150 USDG deposited", with a tx link), and error.
- Zero-balance variant: "You have 0 USDG" with a **Get test USDG** button inline, so a new user can go from connect to deposited in under 60 seconds.

### 7. Follow modal
- Title: "Follow Pulse".
- **Daily cap (USDG)**: a numeric input with quick chips (25 · 50 · 100 · Max).
- **Max slippage**: bps input pre-filled with 50 bps (0.5%).
- Inline validation that shows **before** any wallet popup: "Enter a number", "Cap must be greater than 0", "Cap exceeds your free vault balance (150.00 USDG)". The confirm button stays disabled while any of these errors show.
- A plain-language safety summary: "Pulse can move at most **$50/day** of your funds, only in approved tokens. You can kill this follow at any time. Pulse never holds your money."
- States: default, invalid, signing, pending, and success ("You're following Pulse").

### 8. Live fill feed and balance update
- When the agent trades, a **toast or feed item** slides in: "Pulse bought 0.42 mNVDA @ $128.41 · mirrored to your vault", with an explorer link.
- Vault balances and "spent today" **tick up or down live**. Show the before and after.
- Desktop: a right-hand "Live activity" panel. Mobile: a collapsible activity drawer.

### 9. Policy reject banner (the demo centerpiece, so give it the most care)
- A prominent in-context banner or card, never a generic "transaction failed" toast and never a raw revert string. It always shows the **exact copy** below plus an **inline explorer link to the `mirrorFill` transaction that logged the rejection** (PRD v2.2 §7.1: rejections are logged as `MirrorRejected` on a tx that succeeds, so there is no failed tx to link), and a small label "Enforced on-chain by PolicyModule".
- Design all four variants:
  - Cap exceeded: **"Blocked: this trade would move $80 but your daily cap for this agent is $50."**
  - Token not allowed: **"Blocked: mTSLA isn't on the approved list for copy-trading yet."**
  - Policy inactive: **"You're not currently following this agent (or you've already killed the follow)."**
  - Insufficient balance: **"You don't have enough free balance in the vault for that."**
- Frame it as the system **protecting** the user: red/coral, with a shield icon.

### 10. Kill switch / unfollow
- A **Kill follow** button in coral with a confirmation step: "Stop following Pulse? Your 50 USDG allocation returns to your free balance immediately."
- States: confirm, signing, pending, then **Killed**. After confirmation show a solid badge: **"This agent can no longer move your funds"**, with a small "Verified on-chain just now" note (from a fresh contract read) and a tx link.
- After kill, prove the exit with fresh reads: policy inactive, allocation zero, and the wallet absent from the follower list. The killed follower is no longer in the mirror loop, so no later PolicyInactive event is expected.

### 11. Withdraw modal
- Amount input with Max (free balance only). Any amount above the free balance disables the button, with the inline message "Max withdrawable is 150.00 USDG".
- States: idle, signing, pending, and success, with the balance updated and a tx link.

### 12. Leaderboard (`/leaderboard`)
- A table ranking all agents: rank, agent, PnL % (big, colored), PnL in USDG, fills, followers, total mirrored volume, and a sparkline.
- **Red sits visibly in the red, with a negative PnL.** This table is where honesty becomes undeniable. Don't soften it.
- A small caption: "Computed live from on-chain TrackRecord and CopyVault events. No spreadsheets."
- On mobile the table turns into ranked cards.

### 13. Global states
- Loading skeletons for every data area.
- Empty states: no follows yet, no fills yet, and an empty vault.
- A disconnected state: read-only browsing works, and actions prompt the user to connect.
- An RPC/network error banner with Retry.
- A pending-transaction indicator in the header.

## Prototype flow to wire up
Landing → Connect → Wrong network → Switch → Agents → Pulse detail → Deposit (approve → deposit → success) → Follow Pulse with a $50 cap → a live fill lands and the balance updates → a trade over the cap is blocked by the **CapExceeded banner** → Leaderboard (Red in the red) → back to Pulse → **Kill follow** → "This agent can no longer move your funds" → show inactive policy, zero allocation and follower-list absence → **Withdraw** → success.

## Deliverables
1. Every screen and state above, desktop and mobile, arranged as a flow on the canvas.
2. A small **design-system sheet**: color tokens, type scale, buttons (primary, secondary, destructive, disabled, loading), inputs (default, focus, error), badges (Verified, Following, Losing agent, Killed), table rows, toasts, modals/bottom sheets and the chart component.
3. Use the exact copy given for error messages and badges. Use the sample data above everywhere else and label it as sample.

The target stack is Next.js + Tailwind + Wagmi/Viem, so keep components practical to build: standard spacing, 8px base radius, 44px minimum tap targets on mobile.
