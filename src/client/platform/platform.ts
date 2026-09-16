export type Platform = "web" | "poki" | "crazygames";

/** Set at build time with VITE_PLATFORM. Portal builds never show the paid shop. */
export const PLATFORM: Platform = ((): Platform => {
  const value = import.meta.env.VITE_PLATFORM;
  return value === "poki" || value === "crazygames" ? value : "web";
})();

export function paidShopAllowed(platform: Platform = PLATFORM): boolean { return platform === "web"; }
