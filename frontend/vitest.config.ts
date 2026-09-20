import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    // Same "@/" root the Next build and tsconfig use, so tests import the
    // modules by the paths the app does.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
