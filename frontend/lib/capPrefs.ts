"use client";

import { useSyncExternalStore } from "react";

/**
 * The caps a visitor has chosen, kept in this browser.
 *
 * Two kinds. The general cap, set from the home page, is the default for any
 * agent without one of its own: it pre-fills Follow with cap and the
 * previews, and never sends a transaction. An agent's own cap, set on its
 * page, wins over the general one for that agent.
 *
 * What these are not: the cap on a follow that exists. That one lives in
 * PolicyModule, set when the follow was made, and the chain is the only
 * place it's read from. An agent's saved cap is updated alongside it when a
 * follow is made or its cap changed, so the two agree.
 */
export type CapPrefs = {
  general?: number;
  agents: Record<number, number>;
};

const KEY = "mirror.caps.v1";
const EMPTY: CapPrefs = { agents: {} };
const listeners = new Set<() => void>();

function valid(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Whatever is stored, or nothing: a missing, unreadable or hand-edited
 *  entry is treated as no preference rather than a crash. */
export function parseCapPrefs(raw: string | null): CapPrefs {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as { general?: unknown; agents?: Record<string, unknown> };
    const agents: Record<number, number> = {};
    for (const [id, cap] of Object.entries(data.agents ?? {})) {
      const agentId = Number(id);
      if (Number.isInteger(agentId) && agentId > 0 && valid(cap)) agents[agentId] = cap;
    }
    return { general: valid(data.general) ? data.general : undefined, agents };
  } catch {
    return EMPTY;
  }
}

let cachedRaw: string | null | undefined;
let cached: CapPrefs = EMPTY;

function read(): CapPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode, site data off): nothing saved.
  }
  // The same object while nothing changed, so React doesn't re-render on
  // every subscription check.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseCapPrefs(raw);
  }
  return cached;
}

function write(next: CapPrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not saved, but this tab still shows the choice until it's closed.
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved caps, live: every component reading them updates together. */
export function useCapPrefs(): CapPrefs {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function setGeneralCap(cap: number) {
  if (!valid(cap)) return;
  write({ ...read(), general: cap });
}

/** Saves an agent's own cap, or clears it so the general cap applies again. */
export function setAgentCap(agentId: number, cap: number | undefined) {
  const current = read();
  const agents = { ...current.agents };
  if (valid(cap)) agents[agentId] = cap;
  else delete agents[agentId];
  write({ ...current, agents });
}

/** The cap that applies to an agent: its own, else the general one. */
export function capFor(prefs: CapPrefs, agentId: number): number | undefined {
  return prefs.agents[agentId] ?? prefs.general;
}

export type CustomCap = {
  agentId: number;
  cap: number;
  /** "following": the cap on a live follow, read from the chain.
   *  "saved": chosen on the agent's page, not followed yet. */
  source: "following" | "saved";
};

/**
 * Agents whose cap differs from the general one, the list a visitor is shown
 * before changing it. A live follow's on-chain cap wins over anything saved,
 * because that is the cap the vault will actually enforce.
 */
export function customCaps(
  prefs: CapPrefs,
  followedCaps: Record<number, number>,
  general: number,
): CustomCap[] {
  const ids = new Set([
    ...Object.keys(prefs.agents).map(Number),
    ...Object.keys(followedCaps).map(Number),
  ]);
  const out: CustomCap[] = [];
  for (const agentId of [...ids].sort((a, b) => a - b)) {
    const followed = followedCaps[agentId];
    if (followed !== undefined && followed > 0) {
      if (followed !== general) out.push({ agentId, cap: followed, source: "following" });
      continue;
    }
    const saved = prefs.agents[agentId];
    if (saved !== undefined && saved !== general) out.push({ agentId, cap: saved, source: "saved" });
  }
  return out;
}

/**
 * What one of this agent's trades costs, for sizing a cap in trades rather
 * than dollars: its largest buy so far, rounded up to $10. Round numbers sat
 * below every trade most agents make ($46 to $300 notional on the live tape),
 * so a follower who picked one watched every copy get rejected.
 */
export function tradeUnit(largestBuyUsd: number | undefined): number {
  return largestBuyUsd ? Math.ceil(largestBuyUsd / 10) * 10 : 100;
}

/** The cap that fits `trades` of this agent's largest trades a day. */
export function capForTrades(trades: number, largestBuyUsd: number | undefined): number {
  return Math.max(1, Math.round(trades)) * tradeUnit(largestBuyUsd);
}

/** How many of the agent's largest trades a cap covers, whole trades only. */
export function tradesForCap(cap: number, largestBuyUsd: number | undefined): number {
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  return Math.floor(cap / tradeUnit(largestBuyUsd));
}
