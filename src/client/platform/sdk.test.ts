import { describe, expect, it, vi } from "vitest";
import { portalPolicy } from "./platform.ts";
import { CRAZYGAMES_SDK_URL, POKI_SDK_URL, PlatformBridge, createPlatformSdk, type SdkWindow } from "./sdk.ts";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("portal policy", () => {
  it("keeps money, sign-in redirects and outside links on the web build only", () => {
    expect(portalPolicy("web")).toEqual({ paidShop: true, providerSignIn: true, externalLinks: true, ads: false });
    for (const portal of ["poki", "crazygames"] as const) expect(portalPolicy(portal)).toEqual({ paidShop: false, providerSignIn: false, externalLinks: false, ads: true });
  });
});

describe("Poki SDK", () => {
  it("loads the script, reports loading and gameplay, and pauses for a commercial break", async () => {
    const calls: string[] = [];
    const win: SdkWindow = {};
    const load = vi.fn(async (url: string) => {
      calls.push(`load ${url}`);
      win.PokiSDK = {
        init: async () => { calls.push("init"); },
        gameLoadingFinished: () => { calls.push("loaded"); },
        gameplayStart: () => { calls.push("start"); },
        gameplayStop: () => { calls.push("stop"); },
        commercialBreak: async (onStart) => { onStart?.(); calls.push("ad"); },
      };
    });
    const bridge = new PlatformBridge(createPlatformSdk("poki", win, load));
    bridge.loaded();
    bridge.setPlaying(true);
    bridge.setPlaying(true);
    await bridge.whenReady(); await flush();
    const pauses: boolean[] = [];
    await bridge.adBreak((paused) => pauses.push(paused));
    bridge.setPlaying(true); await flush();
    expect(calls).toEqual([`load ${POKI_SDK_URL}`, "init", "loaded", "start", "stop", "ad", "start"]);
    expect(pauses).toEqual([true, false]);
  });

  it("keeps the game running when the SDK is blocked", async () => {
    const bridge = new PlatformBridge(createPlatformSdk("poki", {}, async () => { throw new Error("blocked"); }));
    bridge.loaded(); bridge.setPlaying(true); bridge.happyTime();
    const pauses: boolean[] = [];
    await bridge.adBreak((paused) => pauses.push(paused));
    expect(pauses).toEqual([]);
  });
});

describe("CrazyGames SDK", () => {
  it("maps loading, gameplay, happy time and midgame ads", async () => {
    const calls: string[] = [];
    const win: SdkWindow = {};
    const load = async (url: string): Promise<void> => {
      calls.push(`load ${url}`);
      win.CrazyGames = { SDK: {
        init: async () => { calls.push("init"); },
        environment: "crazygames",
        game: {
          loadingStart: () => { calls.push("loadingStart"); }, loadingStop: () => { calls.push("loadingStop"); },
          gameplayStart: () => { calls.push("start"); }, gameplayStop: () => { calls.push("stop"); }, happytime: () => { calls.push("happy"); },
        },
        ad: { requestAd: (type, callbacks) => { calls.push(`ad ${type}`); callbacks.adStarted?.(); setTimeout(() => callbacks.adFinished?.(), 5); } },
      } };
    };
    const bridge = new PlatformBridge(createPlatformSdk("crazygames", win, load));
    bridge.loaded(); bridge.setPlaying(true); bridge.happyTime();
    await bridge.whenReady(); await flush();
    const pauses: boolean[] = [];
    await bridge.adBreak((paused) => pauses.push(paused));
    expect(calls).toEqual([`load ${CRAZYGAMES_SDK_URL}`, "init", "loadingStart", "loadingStop", "start", "happy", "stop", "ad midgame"]);
    expect(pauses).toEqual([true, false]);
  });

  it("treats an ad error as the end of the break and a disabled environment as no SDK", async () => {
    const win: SdkWindow = {};
    const sdk = createPlatformSdk("crazygames", win, async () => {
      win.CrazyGames = { SDK: {
        init: async () => undefined, environment: "crazygames",
        game: { loadingStart() {}, loadingStop() {}, gameplayStart() {}, gameplayStop() {}, happytime() {} },
        ad: { requestAd: (_type, callbacks) => callbacks.adError?.(new Error("no fill")) },
      } };
    });
    await sdk.init();
    await expect(sdk.midgameAd(() => undefined)).resolves.toBeUndefined();

    const disabled: SdkWindow = {};
    const off = createPlatformSdk("crazygames", disabled, async () => {
      disabled.CrazyGames = { SDK: {
        init: async () => undefined, environment: "disabled",
        game: { loadingStart() {}, loadingStop() {}, gameplayStart() { throw new Error("should not run"); }, gameplayStop() {}, happytime() {} },
        ad: { requestAd() { throw new Error("should not run"); } },
      } };
    });
    await off.init();
    expect(() => off.gameplayStart()).not.toThrow();
    let started = false;
    await off.midgameAd(() => { started = true; });
    expect(started).toBe(false);
  });
});

describe("web SDK", () => {
  it("does nothing and never shows ads", async () => {
    const load = vi.fn(async () => undefined);
    const bridge = new PlatformBridge(createPlatformSdk("web", {}, load));
    const pauses: boolean[] = [];
    await bridge.adBreak((paused) => pauses.push(paused));
    expect(load).not.toHaveBeenCalled();
    expect(pauses).toEqual([]);
  });
});
