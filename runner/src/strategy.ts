import type {
  AgentKey,
  FillDecision,
  PriceTick,
  StrategyDefinition,
  Symbol,
} from "./types";

type Position = { symbol: Symbol; size: bigint; entryPrice: bigint; entryTick: number };

function returnBps(current: bigint, previous: bigint): bigint {
  return ((current - previous) * BigInt(10_000)) / previous;
}

function numberSignal(strategy: StrategyDefinition, key: string): number {
  const value = strategy.signal[key];
  if (typeof value !== "number") throw new Error(`Strategy signal ${key} is missing`);
  return value;
}

function applyDecision(positions: Map<Symbol, Position>, decision: FillDecision, price: bigint, tick: number) {
  if (decision.isBuy) {
    positions.set(decision.symbol, {
      symbol: decision.symbol,
      size: decision.size,
      entryPrice: price,
      entryTick: tick,
    });
  } else {
    positions.delete(decision.symbol);
  }
}

function momentum(
  strategy: StrategyDefinition,
  ticks: PriceTick[],
  index: number,
  positions: Map<Symbol, Position>,
): FillDecision[] {
  const current = ticks[index];
  const lookback = numberSignal(strategy, "lookbackTicks");
  const buyThreshold = numberSignal(strategy, "buyReturnBpsGreaterThan");
  const sellThreshold = numberSignal(strategy, "sellOneTickReturnBpsLessThanOrEqual");
  const size = BigInt(strategy.execution.buySizeTokenUnits);
  const decisions: FillDecision[] = [];

  for (const symbol of strategy.universe) {
    const held = positions.get(symbol);
    if (held && index > 0 && returnBps(current.prices[symbol], ticks[index - 1].prices[symbol]) <= sellThreshold) {
      decisions.push({ symbol, isBuy: false, size: held.size });
    } else if (
      !held &&
      index >= lookback &&
      returnBps(current.prices[symbol], ticks[index - lookback].prices[symbol]) > buyThreshold
    ) {
      decisions.push({ symbol, isBuy: true, size });
    }
  }
  return decisions;
}

function meanReversion(
  strategy: StrategyDefinition,
  ticks: PriceTick[],
  index: number,
  positions: Map<Symbol, Position>,
): FillDecision[] {
  const current = ticks[index];
  const lookback = numberSignal(strategy, "lookbackTicks");
  const buyThreshold = numberSignal(strategy, "buyReturnBpsLessThanOrEqual");
  const sellThreshold = numberSignal(strategy, "sellReturnFromEntryBpsGreaterThanOrEqual");
  const maxHolding = numberSignal(strategy, "maxHoldingTicks");
  const size = BigInt(strategy.execution.buySizeTokenUnits);
  const decisions: FillDecision[] = [];

  for (const symbol of strategy.universe) {
    const held = positions.get(symbol);
    if (
      held &&
      (returnBps(current.prices[symbol], held.entryPrice) >= sellThreshold ||
        current.tick - held.entryTick >= maxHolding)
    ) {
      decisions.push({ symbol, isBuy: false, size: held.size });
    } else if (
      !held &&
      index >= lookback &&
      returnBps(current.prices[symbol], ticks[index - lookback].prices[symbol]) <= buyThreshold
    ) {
      decisions.push({ symbol, isBuy: true, size });
    }
  }
  return decisions;
}

function ratio(priceA: bigint, priceB: bigint): bigint {
  return (priceA * BigInt(100_000_000)) / priceB;
}

function pairsRotation(
  strategy: StrategyDefinition,
  ticks: PriceTick[],
  index: number,
  positions: Map<Symbol, Position>,
): FillDecision[] {
  const [symbolA, symbolB] = strategy.universe;
  if (!symbolA || !symbolB) throw new Error("Pairs strategy needs two tokens");
  const lookback = numberSignal(strategy, "ratioLookbackTicks");
  if (index < lookback) return [];

  let total = BigInt(0);
  for (let i = index - lookback; i < index; ++i) {
    total += ratio(ticks[i].prices[symbolA], ticks[i].prices[symbolB]);
  }
  const average = total / BigInt(lookback);
  const currentRatio = ratio(ticks[index].prices[symbolA], ticks[index].prices[symbolB]);
  const deviation = ((currentRatio - average) * BigInt(10_000)) / average;
  const absolute = deviation < 0 ? -deviation : deviation;
  const enter = BigInt(numberSignal(strategy, "enterAbsoluteDeviationBpsGreaterThan"));
  const exit = BigInt(numberSignal(strategy, "exitAbsoluteDeviationBpsLessThanOrEqual"));
  const held = positions.get(symbolA) ?? positions.get(symbolB);

  if (held && absolute <= exit) return [{ symbol: held.symbol, isBuy: false, size: held.size }];
  if (!held && absolute > enter) {
    const lagging = deviation > 0 ? symbolB : symbolA;
    return [{ symbol: lagging, isBuy: true, size: BigInt(strategy.execution.buySizeTokenUnits) }];
  }
  return [];
}

export function decisionsAtTick(
  agent: AgentKey,
  strategy: StrategyDefinition,
  ticks: PriceTick[],
  targetTick: number,
): FillDecision[] {
  if (strategy.execution.maxFillsPerTokenPerOracleRound !== 1) {
    throw new Error("Runner supports exactly one fill per token per oracle round");
  }
  const targetIndex = ticks.findIndex((tick) => tick.tick === targetTick);
  if (targetIndex < 0) throw new Error(`Unknown fixture tick ${targetTick}`);

  const positions = new Map<Symbol, Position>();
  let target: FillDecision[] = [];
  for (let index = 0; index <= targetIndex; ++index) {
    const decisions =
      agent === "pulse"
        ? momentum(strategy, ticks, index, positions)
        : agent === "red"
          ? meanReversion(strategy, ticks, index, positions)
          : pairsRotation(strategy, ticks, index, positions);
    for (const decision of decisions) {
      applyDecision(positions, decision, ticks[index].prices[decision.symbol], ticks[index].tick);
    }
    if (index === targetIndex) target = decisions;
  }
  return target;
}
