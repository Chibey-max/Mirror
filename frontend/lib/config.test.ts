import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("release configuration", () => {
  it("requires an explicit mode outside development and tests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_MIRROR_MODE", "");
    await expect(import("./config")).rejects.toThrow("NEXT_PUBLIC_MIRROR_MODE");
  });

  it("requires a WalletConnect project in live mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_MIRROR_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "");
    const config = await import("./config");
    expect(() => config.walletConnectProjectId()).toThrow("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
  });

  it("rejects a live build while Robinhood addresses are zero", async () => {
    vi.stubEnv("NEXT_PUBLIC_MIRROR_MODE", "live");
    await expect(import("./contracts")).rejects.toThrow("Live Mirror build has no Robinhood address");
  });
});
