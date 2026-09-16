export type Platform = "web" | "poki" | "crazygames";

/** Set at build time with VITE_PLATFORM. */
export const PLATFORM: Platform = ((): Platform => {
  const value = import.meta.env.VITE_PLATFORM;
  return value === "poki" || value === "crazygames" ? value : "web";
})();

export type PortalPolicy = {
  /** Xsolla purchases. Poki forbids in-app purchases; CrazyGames only allows its own invite-only setup. */
  paidShop: boolean;
  /** Discord and Google sign-in leave the page, which portals do not allow. */
  providerSignIn: boolean;
  /** Links to other sites, such as sharing on X. Privacy and terms pages are always allowed. */
  externalLinks: boolean;
  /** Ad breaks between matches. */
  ads: boolean;
};

export function portalPolicy(platform: Platform = PLATFORM): PortalPolicy {
  const web = platform === "web";
  return { paidShop: web, providerSignIn: web, externalLinks: web, ads: !web };
}

export function paidShopAllowed(platform: Platform = PLATFORM): boolean { return portalPolicy(platform).paidShop; }
