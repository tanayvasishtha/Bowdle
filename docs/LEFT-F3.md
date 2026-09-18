# Left after F3 (updated 2026-09-18)

Ship leftovers from the F3 / G13 pass. Status after LEFT-F3:

1. **Attract mode** - done. 30 s idle on the main menu starts a slow orbit over a random match map with showcase explorers; any input returns to the menu.
2. **First-launch benchmark** - done. `runGraphicsBenchmark` samples ~5 s of frames and writes `graphicsPreset` + `graphicsBenchmarked` before the menu.
3. **Loading screen progress / shader warm-up** - done. Online join shows staged progress and calls `Renderer.warmShaders()` before connect.
4. **`npm run og` / `npm run icons`** - done. Generators write `public/og.png` (1200x630) and `public/icons/icon-192.png` / `icon-512.png`.

Verified with `npm run check`.
