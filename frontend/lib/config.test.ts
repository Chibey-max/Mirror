import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  // doMock registrations outlive resetModules, so a stubbed module would
  // otherwise leak into the next test's import.
  vi.doUnmock("./deployments.generated");
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

  // The generated addresses are stubbed rather than read from disk: once
  // deployments/46630.json is finalized the real file is non-zero, and this
  // guard must still be proven for the pre-deployment state it protects.
  it("rejects a live build while Robinhood addresses are zero", async () => {
    vi.stubEnv("NEXT_PUBLIC_MIRROR_MODE", "live");
    const zero = "0x0000000000000000000000000000000000000000";
    vi.doMock("./deployments.generated", () => ({
      deployedAddresses: {
        46630: {
          agentRegistry: zero,
          trackRecord: zero,
          policyModule: zero,
          copyVault: zero,
          usdg: zero,
        },
        421614: {
          agentRegistry: zero,
          trackRecord: zero,
          policyModule: zero,
          copyVault: zero,
          usdg: zero,
        },
      },
    }));
    await expect(import("./contracts")).rejects.toThrow("Live Mirror build has no Robinhood address");
  });

  it("accepts a live build once the Robinhood addresses are real", async () => {
    vi.stubEnv("NEXT_PUBLIC_MIRROR_MODE", "live");
    const contracts = await import("./contracts");
    expect(contracts.isDeployed(contracts.addressesFor(46630)?.copyVault)).toBe(true);
  });
});
