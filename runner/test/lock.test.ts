import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RunnerLock } from "../src/lock";

describe("RunnerLock", () => {
  it("prevents two processes from using one journal and releases cleanly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mirror-lock-"));
    const path = join(directory, "runner.lock");
    const first = await RunnerLock.acquire(path);
    await expect(RunnerLock.acquire(path)).rejects.toThrow("already exists");
    await first.release();
    const second = await RunnerLock.acquire(path);
    await second.release();
  });
});
