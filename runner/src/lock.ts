import { mkdir, open, unlink, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

export class RunnerLock {
  private constructor(
    private readonly path: string,
    private readonly handle: FileHandle,
  ) {}

  static async acquire(path: string): Promise<RunnerLock> {
    try {
      await mkdir(dirname(path), { recursive: true });
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`);
      await handle.sync();
      return new RunnerLock(path, handle);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Runner lock ${path} already exists; verify no process is active before removing it`);
      }
      throw error;
    }
  }

  async release(): Promise<void> {
    await this.handle.close();
    await unlink(this.path);
  }
}
