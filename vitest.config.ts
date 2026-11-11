import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve(".") } },
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
