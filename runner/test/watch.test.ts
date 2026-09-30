import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("worker launch gates", () => {
  it("stops on trial expiry before needing credentials or an RPC", () => {
    try {
      execFileSync(process.execPath, ["--import", "tsx", "src/watch.ts", "--broadcast"], {
        cwd: new URL("..", import.meta.url), encoding: "utf8",
        env: { PATH: process.env.PATH, MARKET_TRIAL_EXPIRES_AT: "2000-01-01T00:00:00Z" }, stdio: "pipe",
      });
      throw new Error("Worker unexpectedly started");
    } catch (error) {
      const failure = error as { status: number; stdout: string };
      expect(failure.status).toBe(1);
      expect(JSON.parse(failure.stdout).message).toContain("trial expired");
    }
  });
  it("requires public-use confirmation before broadcast", () => {
    try {
      execFileSync(process.execPath, ["--import", "tsx", "src/watch.ts", "--broadcast"], {
        cwd: new URL("..", import.meta.url), encoding: "utf8",
        env: { PATH: process.env.PATH, MARKET_TRIAL_EXPIRES_AT: "2099-01-01T00:00:00Z" }, stdio: "pipe",
      });
      throw new Error("Worker unexpectedly started");
    } catch (error) {
      const failure = error as { status: number; stdout: string };
      expect(failure.status).toBe(1);
      expect(JSON.parse(failure.stdout).message).toContain("MARKET_PUBLIC_USE_REFERENCE");
    }
  });
});
