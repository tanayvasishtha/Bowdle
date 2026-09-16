import { defineConfig } from "vite";
import { colyseus } from "colyseus/vite";

const PORTALS = ["poki", "crazygames"] as const;
type Portal = (typeof PORTALS)[number];
const isPortal = (mode: string): mode is Portal => (PORTALS as readonly string[]).includes(mode);

// "split" mode runs the client alone; the server then runs via `npm run dev:server`.
// "poki" and "crazygames" build portal bundles: relative asset paths, the portal SDK, and the bowdle.io game server.
export default defineConfig(({ mode }) => {
  const portal = isPortal(mode) ? mode : undefined;
  return {
    plugins: mode === "split" || portal ? [] : [colyseus({ serverEntry: "./src/server/app.config.ts" })],
    base: portal ? "./" : "/",
    define: {
      "import.meta.env.VITE_PLATFORM": JSON.stringify(portal ?? process.env.VITE_PLATFORM ?? "web"),
      ...(portal ? { "import.meta.env.VITE_SERVER_URL": JSON.stringify(process.env.VITE_SERVER_URL ?? "https://bowdle.io") } : {}),
    },
    server: { port: 5173 },
    build: { outDir: portal ? `dist/${portal}` : "dist/client", emptyOutDir: true, target: "es2022" },
  };
});
