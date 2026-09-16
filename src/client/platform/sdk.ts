import { PLATFORM, type Platform } from "./platform.ts";

/** The calls portals expect. The web build implements them as no-ops. */
export type PlatformSdk = {
  readonly name: Platform;
  init(): Promise<void>;
  loadingStart(): void;
  loadingDone(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happyTime(): void;
  /** Resolves when the ad (if any) is over. Never rejects. */
  midgameAd(onStart: () => void): Promise<void>;
};

export const POKI_SDK_URL = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
export const CRAZYGAMES_SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const SDK_LOAD_TIMEOUT_MS = 8000;

type PokiGlobal = {
  init(): Promise<unknown>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<unknown>;
};

type CrazyAdCallbacks = { adStarted?: () => void; adFinished?: () => void; adError?: (error: unknown) => void };
type CrazyGlobal = {
  init(): Promise<unknown>;
  environment?: string;
  game: { loadingStart(): void; loadingStop(): void; gameplayStart(): void; gameplayStop(): void; happytime(): void };
  ad: { requestAd(type: "midgame" | "rewarded", callbacks: CrazyAdCallbacks): void };
};

export type SdkWindow = { PokiSDK?: PokiGlobal; CrazyGames?: { SDK?: CrazyGlobal } };
export type ScriptLoader = (url: string) => Promise<void>;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${url}`));
    document.head.append(script);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("SDK timed out")), ms))]);
}

const noop = (): void => undefined;

function webSdk(): PlatformSdk {
  return {
    name: "web", init: async () => undefined, loadingStart: noop, loadingDone: noop,
    gameplayStart: noop, gameplayStop: noop, happyTime: noop, midgameAd: async () => undefined,
  };
}

/** Portal SDK calls are guarded: an ad blocker or a failed script must never break the game. */
function guard(call: () => void): void { try { call(); } catch { /* the portal SDK is unavailable */ } }

function pokiSdk(win: SdkWindow, load: ScriptLoader): PlatformSdk {
  let sdk: PokiGlobal | undefined;
  return {
    name: "poki",
    async init() {
      try { await withTimeout(load(POKI_SDK_URL), SDK_LOAD_TIMEOUT_MS); await withTimeout(win.PokiSDK!.init(), SDK_LOAD_TIMEOUT_MS); sdk = win.PokiSDK; } catch { sdk = undefined; }
    },
    loadingStart: noop,
    loadingDone: () => guard(() => sdk?.gameLoadingFinished()),
    gameplayStart: () => guard(() => sdk?.gameplayStart()),
    gameplayStop: () => guard(() => sdk?.gameplayStop()),
    happyTime: noop,
    async midgameAd(onStart) {
      if (!sdk) return;
      try { await sdk.commercialBreak(onStart); } catch { /* no ad this time */ }
    },
  };
}

function crazyGamesSdk(win: SdkWindow, load: ScriptLoader): PlatformSdk {
  let sdk: CrazyGlobal | undefined;
  return {
    name: "crazygames",
    async init() {
      try {
        await withTimeout(load(CRAZYGAMES_SDK_URL), SDK_LOAD_TIMEOUT_MS);
        const candidate = win.CrazyGames?.SDK;
        await withTimeout(candidate!.init(), SDK_LOAD_TIMEOUT_MS);
        sdk = candidate?.environment === "disabled" ? undefined : candidate;
      } catch { sdk = undefined; }
    },
    loadingStart: () => guard(() => sdk?.game.loadingStart()),
    loadingDone: () => guard(() => sdk?.game.loadingStop()),
    gameplayStart: () => guard(() => sdk?.game.gameplayStart()),
    gameplayStop: () => guard(() => sdk?.game.gameplayStop()),
    happyTime: () => guard(() => sdk?.game.happytime()),
    midgameAd(onStart) {
      const current = sdk;
      if (!current) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = (): void => resolve();
        try { current.ad.requestAd("midgame", { adStarted: onStart, adFinished: done, adError: done }); } catch { resolve(); }
      });
    },
  };
}

export function createPlatformSdk(platform: Platform, win: SdkWindow, load: ScriptLoader = loadScript): PlatformSdk {
  if (platform === "poki") return pokiSdk(win, load);
  if (platform === "crazygames") return crazyGamesSdk(win, load);
  return webSdk();
}

/**
 * Wraps the platform so gameplay start and stop are only reported on real changes,
 * and ad breaks always mute audio and freeze input for their whole length.
 */
export class PlatformBridge {
  readonly sdk: PlatformSdk;
  private playing = false;
  private isReady = false;
  private loadReported = false;
  private readonly ready: Promise<void>;

  constructor(sdk: PlatformSdk) {
    this.sdk = sdk;
    this.ready = sdk.init().then(() => { sdk.loadingStart(); this.isReady = true; });
  }

  /** Calls straight away once the SDK is up, so the portal sees events in the order they happen. */
  private whenUp(call: () => void): void {
    if (this.isReady) call(); else void this.ready.then(call);
  }

  whenReady(): Promise<void> { return this.ready; }

  loaded(): void {
    if (this.loadReported) return;
    this.loadReported = true;
    this.whenUp(() => this.sdk.loadingDone());
  }

  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.whenUp(() => (playing ? this.sdk.gameplayStart() : this.sdk.gameplayStop()));
  }

  happyTime(): void { this.whenUp(() => this.sdk.happyTime()); }

  async adBreak(pause: (paused: boolean) => void): Promise<void> {
    await this.ready;
    this.setPlaying(false);
    let paused = false;
    const start = (): void => { if (!paused) { paused = true; pause(true); } };
    try { await this.sdk.midgameAd(start); } finally { if (paused) pause(false); }
  }
}

let bridge: PlatformBridge | undefined;

export function platform(): PlatformBridge {
  bridge ??= new PlatformBridge(createPlatformSdk(PLATFORM, window as unknown as SdkWindow));
  return bridge;
}
