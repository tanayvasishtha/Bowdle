import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests never start the dev game server.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/server/**/*.test.ts", "tests/purity.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
