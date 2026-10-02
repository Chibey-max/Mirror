import { describe, expect, it } from "vitest";
import { capFor, customCaps, parseCapPrefs } from "./capPrefs";

describe("saved caps", () => {
  it("reads nothing from a missing or broken entry", () => {
    expect(parseCapPrefs(null)).toEqual({ agents: {} });
    expect(parseCapPrefs("{not json")).toEqual({ agents: {} });
  });

  it("keeps only positive numbers for real agent ids", () => {
    const prefs = parseCapPrefs(
      JSON.stringify({ general: 120, agents: { 1: 200, 2: -5, 3: "60", x: 40, 4: 0 } }),
    );
    expect(prefs).toEqual({ general: 120, agents: { 1: 200 } });
  });

  it("uses an agent's own cap before the general one", () => {
    const prefs = { general: 100, agents: { 2: 250 } };
    expect(capFor(prefs, 2)).toBe(250);
    expect(capFor(prefs, 3)).toBe(100);
    expect(capFor({ agents: {} }, 3)).toBeUndefined();
  });
});

describe("agents with their own cap", () => {
  it("lists caps that differ from the general one, live follows first", () => {
    const prefs = { general: 100, agents: { 1: 60, 2: 100, 3: 300 } };
    // Agent 1 is followed at 150 on chain, which overrides its saved 60.
    const followed = { 1: 150, 4: 100 };
    expect(customCaps(prefs, followed, 100)).toEqual([
      { agentId: 1, cap: 150, source: "following" },
      { agentId: 3, cap: 300, source: "saved" },
    ]);
  });

  it("is empty when every cap matches", () => {
    expect(customCaps({ general: 80, agents: { 1: 80 } }, { 2: 80 }, 80)).toEqual([]);
  });
});
