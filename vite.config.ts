import { defineConfig } from "vite";
import { colyseus } from "colyseus/vite";

// "split" mode runs the client alone; the server then runs via `npm run dev:server`.
export default defineConfig(({ mode }) => ({
  plugins: mode === "split" ? [] : [colyseus({ serverEntry: "./src/server/app.config.ts" })],
  server: { port: 5173 },
  build: { outDir: "dist/client", emptyOutDir: true, target: "es2022" },
}));
