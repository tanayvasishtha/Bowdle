import { MAX_FOV, MIN_FOV } from "../../shared/constants.ts";
import { consumeSignInFragment, ensureAccount, reportFunnel } from "../account.ts";
import { checkpointFor } from "../../shared/sim/waves.ts";
import { courseDone } from "../game/course.ts";
import { onlineSearch, type GameMode } from "../../shared/sim/modes.ts";
import { EXPEDITION_HANDICAPS, type ExpeditionHandicapId } from "../../shared/constants.ts";
import { music } from "../audio/music.ts";
import { musicIntensity } from "../audio/spatial.ts";
import { ACTION_LABELS, ACTIONS, CROSSHAIR_COLORS, CROSSHAIR_SIZE, CROSSHAIR_STYLES, TEAM_PALETTE_NAMES, keyLabel, loadName, loadSettings, nameError, saveName, saveSettings, type Action, type GameSettings } from "../settings.ts";
import { showLeaderboard, showProfile } from "./profile.ts";
import { featureEnabled } from "../../shared/features.ts";
import { armAttractIdle } from "./attract.ts";
import { platform } from "../platform/sdk.ts";
import { showPartyPanel } from "./party.ts";
import { configuredRegions, formatPingMs, probeRegions } from "../regions.ts";
import { FPS_CAPS, GRAPHICS_PRESETS } from "../../shared/graphics.ts";

const LABELS: Record<Action, string> = ACTION_LABELS;
const codeLabel = keyLabel;

export function installMenuStyles(container: HTMLElement): void {
  if (document.querySelector("#bowdle-menu-style")) return;
  const style = document.createElement("style"); style.id = "bowdle-menu-style";
  style.textContent = `.bowdle-menu,.bowdle-panel{position:absolute;inset:0;display:grid;place-content:center;text-align:center;color:#4a3527;font-family:'Gochi Hand',cursive;background:linear-gradient(#acd9df,#efe3c6)}.bowdle-menu:before,.bowdle-panel:before{content:'';position:absolute;inset:0;background-image:linear-gradient(#4a352712 1px,transparent 1px),linear-gradient(90deg,#4a352712 1px,transparent 1px);background-size:32px 32px;pointer-events:none}.bowdle-menu>* ,.bowdle-panel>*{position:relative}.bowdle-menu h1{font:84px 'Permanent Marker';margin:0;transform:rotate(-2deg)}.bowdle-menu p{font-size:25px;margin:0 0 24px}.bowdle-menu button,.bowdle-panel button{display:block;min-width:260px;margin:10px auto;padding:10px 28px;border:3px solid #4a3527;background:#efe3c6;color:#4a3527;font:28px 'Gochi Hand';cursor:pointer;box-shadow:5px 5px 0 #d2531f}.bowdle-panel{z-index:20;background:#efe3c6f5;overflow:auto;padding:24px;box-sizing:border-box}.bowdle-panel h2{font:48px 'Permanent Marker';margin:8px}.bowdle-panel label{display:block;font-size:22px;margin:10px}.bowdle-panel input[type=range]{width:280px;margin-left:12px}.bowdle-bindings{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:6px;max-width:720px}.bowdle-bindings .bowdle-binding{font-size:18px;min-width:0;margin:0;box-shadow:none}.bowdle-name input{font:28px 'Gochi Hand';padding:8px;border:3px solid #4a3527;background:#fffaf0}.bowdle-error{min-height:25px;color:#d2531f;font-size:20px}.bowdle-level{font:34px 'Permanent Marker'}.bowdle-xp{width:320px;height:14px;margin:6px auto;border:3px solid #4a3527;background:#fffaf0}.bowdle-xp>div{height:100%;background:#e3b23c}.bowdle-small{font-size:19px;margin:4px}.bowdle-ink{font-size:26px;margin:6px;color:#8a5a12}.bowdle-table{margin:8px auto;border-collapse:collapse;font-size:21px;min-width:420px}.bowdle-table td,.bowdle-table th{border-bottom:2px dashed #4a352755;padding:4px 12px}.bowdle-profile input[data-field]{font:24px 'Gochi Hand';padding:4px 8px;border:3px solid #4a3527;background:#fffaf0}.bowdle-legal{margin-top:18px;font-size:20px}.bowdle-legal a{color:#4a3527}.bowdle-party h3{font-size:26px;margin:12px 0 0}.bowdle-party-code{font:56px 'Permanent Marker';letter-spacing:10px;margin:8px}.bowdle-party input[data-field]{display:block;justify-self:center;margin:6px auto;font:30px 'Gochi Hand';letter-spacing:6px;text-transform:uppercase;width:220px;text-align:center;padding:6px;border:3px solid #4a3527;background:#fffaf0}.bowdle-toast{position:absolute;left:50%;top:18px;transform:translateX(-50%);padding:8px 18px;border:3px solid #4a3527;background:#efe3c6;font-size:22px;z-index:30}`;
  // The hidden attribute must always win: several overlays set display in their inline style, which used to keep them on screen.
  style.textContent += "[hidden]{display:none!important}";
  // Settings grew past one screen: it starts at the top and scrolls.
  style.textContent += ".bowdle-settings{place-content:start center;overflow-y:auto;padding:24px 0}";
  // Everything after Play sits in two columns so the menu fits one screen.
  style.textContent += ".bowdle-menu .bowdle-name{display:block;font-size:22px;margin:8px auto 4px}.bowdle-menu .bowdle-name input{display:block;margin:6px auto;font:28px 'Gochi Hand';padding:8px 12px;border:3px solid #4a3527;background:#fffaf0;text-align:center;min-width:240px}.bowdle-menu .bowdle-gear{position:absolute;top:18px;right:18px;min-width:52px;padding:6px 10px;font-size:28px;box-shadow:3px 3px 0 #d2531f}.bowdle-menu .bowdle-status{font-size:22px;min-height:28px;color:#8a5a12}.bowdle-menu button[data-action=training],.bowdle-menu button[data-action=play],.bowdle-menu button[data-action=lobby]{min-width:300px;font-size:34px;padding:14px 32px}.bowdle-settings summary{font:26px 'Permanent Marker';cursor:pointer;margin:12px}";
  style.textContent += ".bowdle-menu-grid{display:grid;grid-template-columns:repeat(2,260px);gap:0 18px;justify-content:center}.bowdle-menu .bowdle-menu-grid button{margin:8px 0}";
  container.append(style);
}

function choice<T extends string>(name: string, options: readonly T[], current: T, labels: Record<T, string>): string {
  return `<select data-setting="${name}">${options.map((option) => `<option value="${option}"${option === current ? " selected" : ""}>${labels[option]}</option>`).join("")}</select>`;
}

export function showSettings(container: HTMLElement, onClose: () => void): void {
  let settings = loadSettings();
  const panel = document.createElement("section");
  panel.className = "bowdle-panel bowdle-settings";
  panel.innerHTML = `<h2>Settings</h2>
    <label>Mouse sensitivity <input data-setting="sensitivity" type="range" min="0.0005" max="0.012" step="0.0005" value="${settings.sensitivity}"></label>
    <label><input data-setting="invertY" type="checkbox" ${settings.invertY ? "checked" : ""}> Invert vertical look</label>
    <label>Field of view <output>${settings.fov}</output><input data-setting="fov" type="range" min="${MIN_FOV}" max="${MAX_FOV}" step="1" value="${settings.fov}"></label>
    <label>Master volume <input data-setting="masterVolume" type="range" min="0" max="1" step="0.05" value="${settings.masterVolume}"></label>
    <label>Quality <select data-setting="graphicsPreset">${GRAPHICS_PRESETS.map((preset) => `<option value="${preset}"${settings.graphicsPreset === preset ? " selected" : ""}>${preset[0]!.toUpperCase()}${preset.slice(1)}</option>`).join("")}</select></label>
    <h3>Bindings</h3><div class="bowdle-bindings"></div>
    <details data-launch-settings><summary>More options</summary>
    <label>Vertical look <input data-setting="verticalSensitivity" type="range" min="0.5" max="2" step="0.05" value="${settings.verticalSensitivity}"></label>
    <label><input data-setting="boil" type="checkbox" ${settings.boil ? "checked" : ""}> Animated ink boil</label>
    <label><input data-setting="floatingNotes" type="checkbox" ${settings.floatingNotes ? "checked" : ""}> Floating map notes</label>
    <label><input data-setting="colorblindSymbols" type="checkbox" ${settings.colorblindSymbols ? "checked" : ""}> Team symbols</label>
    <label><input data-setting="reduceMotion" type="checkbox" ${settings.reduceMotion ? "checked" : ""}> Reduce motion</label>
    <label><input data-setting="damageNumbers" type="checkbox" ${settings.damageNumbers ? "checked" : ""}> Damage numbers</label>
    <label>Music <input data-setting="musicVolume" type="range" min="0" max="1" step="0.05" value="${settings.musicVolume}"></label>
    <label>Effects <input data-setting="effectsVolume" type="range" min="0" max="1" step="0.05" value="${settings.effectsVolume}"></label>
    <label>Ambience <input data-setting="ambienceVolume" type="range" min="0" max="1" step="0.05" value="${settings.ambienceVolume}"></label>
    <label><input data-setting="music" type="checkbox" ${settings.music ? "checked" : ""}> Music (M)</label>
    <label><input data-setting="soundIndicators" type="checkbox" ${settings.soundIndicators ? "checked" : ""}> Sound indicators</label>
    <label><input data-setting="tips" type="checkbox" ${settings.tips ? "checked" : ""}> Tips for new players</label>
    <label>Aim sensitivity <input data-setting="aimSensitivity" type="range" min="0.3" max="1.5" step="0.05" value="${settings.aimSensitivity}"></label>
    <label>Gamepad sensitivity <input data-setting="gamepadSensitivity" type="range" min="0.3" max="2" step="0.05" value="${settings.gamepadSensitivity}"></label>
    <label><input data-setting="trackpadMode" type="checkbox" ${settings.trackpadMode ? "checked" : ""}> Trackpad mode (click to draw, click to release)</label>
    <label>Crosshair ${choice("crosshairStyle", CROSSHAIR_STYLES, settings.crosshairStyle, { circle: "Circle", dot: "Dot", cross: "Cross" })}</label>
    <label>Crosshair size <input data-setting="crosshairSize" type="range" min="${CROSSHAIR_SIZE.min}" max="${CROSSHAIR_SIZE.max}" step="2" value="${settings.crosshairSize}"></label>
    <label>Crosshair color ${choice("crosshairColor", CROSSHAIR_COLORS, settings.crosshairColor, { sepia: "Ink brown", sunInk: "Sun orange", gold: "Gold", moonInk: "Moon blue", parchment: "Paper" })}</label>
    <label>Team colors ${choice("teamPalette", TEAM_PALETTE_NAMES, settings.teamPalette, { default: "Standard", deuteranopia: "Deuteranopia", protanopia: "Protanopia", tritanopia: "Tritanopia" })}</label>
    <label>FPS cap <select data-setting="fpsCap">${FPS_CAPS.map((cap) => `<option value="${cap}"${settings.fpsCap === cap ? " selected" : ""}>${cap === 0 ? "Unlimited" : String(cap)}</option>`).join("")}</select></label>
    <h3>Region</h3>
    <label>Server region <select data-setting="preferredRegion"><option value="">Auto (lowest ping)</option></select></label>
    <p class="bowdle-small" data-testid="region-pings">Probing regions...</p>
    </details><button data-action="done">Done</button>`;
  const bindings = panel.querySelector<HTMLDivElement>(".bowdle-bindings")!;
  for (const action of ACTIONS) {
    const button = document.createElement("button");
    button.className = "bowdle-binding"; button.dataset.bind = action; button.textContent = `${LABELS[action]} · ${codeLabel(settings.keys[action])}`;
    button.addEventListener("click", () => {
      button.textContent = `${LABELS[action]} · press a key`;
      const accept = (event: KeyboardEvent | MouseEvent): void => {
        event.preventDefault();
        const code = event instanceof KeyboardEvent ? event.code : `Mouse${event.button}`;
        settings = { ...settings, keys: { ...settings.keys, [action]: code } }; saveSettings(settings); button.textContent = `${LABELS[action]} · ${codeLabel(code)}`;
        window.removeEventListener("keydown", accept); window.removeEventListener("mousedown", accept);
      };
      window.addEventListener("keydown", accept, { once: true }); window.addEventListener("mousedown", accept, { once: true });
    });
    bindings.append(button);
  }
  const update = (): void => {
    const number = (name: string): number => Number(panel.querySelector<HTMLInputElement>(`[data-setting=${name}]`)!.value);
    const checked = (name: string): boolean => panel.querySelector<HTMLInputElement>(`[data-setting=${name}]`)!.checked;
    const picked = <T extends string>(name: string): T => panel.querySelector<HTMLSelectElement>(`[data-setting=${name}]`)!.value as T;
    settings = { ...settings, sensitivity: number("sensitivity"), fov: number("fov"), masterVolume: number("masterVolume"), musicVolume: number("musicVolume"), effectsVolume: number("effectsVolume"), ambienceVolume: number("ambienceVolume"), music: checked("music"), soundIndicators: checked("soundIndicators"), invertY: checked("invertY"), verticalSensitivity: number("verticalSensitivity"), aimSensitivity: number("aimSensitivity"), gamepadSensitivity: number("gamepadSensitivity"), trackpadMode: checked("trackpadMode"), crosshairStyle: picked("crosshairStyle"), crosshairSize: number("crosshairSize"), crosshairColor: picked("crosshairColor"), teamPalette: picked("teamPalette"), preferredRegion: picked("preferredRegion"), graphicsPreset: picked("graphicsPreset"), fpsCap: Number(picked("fpsCap")) as typeof settings.fpsCap, graphicsBenchmarked: true, boil: checked("boil"), floatingNotes: checked("floatingNotes"), colorblindSymbols: checked("colorblindSymbols"), reduceMotion: checked("reduceMotion"), damageNumbers: checked("damageNumbers"), tips: checked("tips") };
    panel.querySelector("output")!.textContent = String(settings.fov); saveSettings(settings);
  };
  panel.addEventListener("input", update);
  panel.querySelector("[data-action=done]")!.addEventListener("click", () => { panel.remove(); onClose(); });
  const regionSelect = panel.querySelector<HTMLSelectElement>("[data-setting=preferredRegion]");
  const pingLine = panel.querySelector("[data-testid=region-pings]");
  if (regionSelect) {
    for (const region of configuredRegions()) {
      const option = document.createElement("option");
      option.value = region.id;
      option.textContent = region.label ?? region.id;
      regionSelect.append(option);
    }
    regionSelect.value = settings.preferredRegion ?? "";
    void probeRegions().then((pings) => {
      if (!pingLine) return;
      pingLine.textContent = pings.length === 0 ? "Single region" : pings.map((row) => `${row.label ?? row.id}: ${formatPingMs(row.pingMs)}`).join(" / ");
    });
  }
container.append(panel);
}

export function showMainMenu(container: HTMLElement): void {
  installMenuStyles(container);
  void ensureAccount(loadName() || "Explorer");
  reportFunnel("menuOpened");
  music().setIntensity(musicIntensity("menu", false, Number.POSITIVE_INFINITY));

  const menu = document.createElement("main");
  menu.className = "bowdle-menu";
  menu.dataset.testid = "main-menu";
  const name = loadName();
  menu.innerHTML = `
    <h1>Bowdle</h1>
    <p>Fast bows. Wild jungle. One more match.</p>
    <label class="bowdle-name">Name
      <input data-testid="player-name" maxlength="16" autocomplete="nickname" value="${name.replaceAll('"', "&quot;")}">
    </label>
    <div class="bowdle-error" data-testid="name-error"></div>
    <button data-action="training" data-testid="mode-training">Training</button>
    <button data-action="play" data-testid="mode-play">Play</button>
    <button data-action="lobby" data-testid="mode-lobby">Lobby</button>
    <button data-action="settings" data-testid="open-settings" class="bowdle-gear" title="Settings" aria-label="Settings">⚙</button>
    <p class="bowdle-status" data-testid="menu-status" hidden></p>
    <nav class="bowdle-legal"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a></nav>
  `;
  if (featureEnabled("legacyMenu")) {
    const legacy = document.createElement("div");
    legacy.className = "bowdle-menu-grid";
    legacy.innerHTML = `<button data-action="ranked">Ranked</button><button data-action="ffa">Free for All</button><button data-action="relic">Relic Run</button><button data-action="expedition">Expedition</button><button data-action="party">Play with friends</button><button data-action="practice">Practice</button><button data-action="course">Field course</button><button data-action="locker">Locker</button><button data-action="profile">Profile</button><button data-action="leaderboard">Leaderboard</button>`;
    menu.querySelector(".bowdle-gear")!.before(legacy);
  }
  container.append(menu);
  platform().loaded();
  if (featureEnabled("attractMode")) armAttractIdle(container, menu);

  const status = menu.querySelector<HTMLElement>("[data-testid=menu-status]")!;
  const setStatus = (text: string): void => { status.hidden = !text; status.textContent = text; };
  const nameInput = menu.querySelector<HTMLInputElement>("[data-testid=player-name]")!;
  const nameErrorBox = menu.querySelector<HTMLElement>("[data-testid=name-error]")!;
  const commitName = (): string | undefined => {
    const issue = nameError(nameInput.value);
    nameErrorBox.textContent = issue;
    if (issue) return undefined;
    const trimmed = nameInput.value.trim();
    saveName(trimmed);
    return trimmed;
  };

  const signIn = consumeSignInFragment();
  if (signIn.linked || signIn.failed) {
    const toast = document.createElement("div"); toast.className = "bowdle-toast";
    toast.textContent = signIn.linked ? "Progress saved to your account." : "Sign-in did not finish. Try again later.";
    container.append(toast); setTimeout(() => toast.remove(), 4000);
  }

  const enterOnline = async (mode: GameMode, label: string): Promise<void> => {
    const playerName = commitName();
    if (!playerName) return;
    setStatus(label);
    reportFunnel("modePicked");
    await ensureAccount(playerName);
    location.search = onlineSearch(mode);
  };

  menu.querySelector("[data-action=training]")!.addEventListener("click", () => {
    const playerName = commitName();
    if (!playerName) return;
    reportFunnel("modePicked");
    void ensureAccount(playerName);
    location.search = "?scene=camp";
  });
  menu.querySelector("[data-action=play]")!.addEventListener("click", () => {
    void enterOnline("expedition", "Finding your village…");
  });
  menu.querySelector("[data-action=lobby]")!.addEventListener("click", () => {
    void enterOnline("ffa", "Joining the lobby…");
  });
  menu.querySelector("[data-action=settings]")!.addEventListener("click", () => showSettings(container, () => undefined));

  if (featureEnabled("legacyMenu")) {
    const navigate = (scene: string): void => { location.search = `?scene=${scene}`; };
    const withName = (next: (name: string) => void): void => {
      const playerName = commitName();
      if (playerName) next(playerName);
    };
    const enter = async (playerName: string, party?: string, mode: GameMode = "tdm"): Promise<void> => {
      await ensureAccount(playerName);
      location.search = onlineSearch(mode, party);
    };
    menu.querySelector("[data-action=ranked]")?.addEventListener("click", () => withName((playerName) => {
      void (async () => {
        const account = await ensureAccount(playerName);
        const level = account?.progress.level ?? 0;
        const linked = (account?.linked.length ?? 0) > 0;
        if (level < 10 || !linked) {
          const toast = document.createElement("div"); toast.className = "bowdle-toast";
          toast.textContent = linked ? "Ranked unlocks at level 10." : "Link an account to play Ranked.";
          container.append(toast); setTimeout(() => toast.remove(), 4000);
          return;
        }
        reportFunnel("modePicked"); location.search = onlineSearch("tdm") + "&ranked=1";
      })();
    }));
    menu.querySelector("[data-action=expedition]")?.addEventListener("click", () => withName((playerName) => { reportFunnel("modePicked"); void enter(playerName, undefined, "expedition"); }));
    for (const mode of ["ffa", "relic"] as const) {
      menu.querySelector(`[data-action=${mode}]`)?.addEventListener("click", () => withName((playerName) => { reportFunnel("modePicked"); void enter(playerName, undefined, mode); }));
    }
    menu.querySelector("[data-action=party]")?.addEventListener("click", () => withName((playerName) => {
      reportFunnel("modePicked");
      showPartyPanel(container, (code, mode) => { void enter(playerName, code, mode); });
    }));
    menu.querySelector("[data-action=practice]")?.addEventListener("click", () => navigate("camp"));
    menu.querySelector("[data-action=course]")?.addEventListener("click", () => { location.search = "?scene=camp&course"; });
    menu.querySelector("[data-action=locker]")?.addEventListener("click", () => navigate("locker"));
    menu.querySelector("[data-action=profile]")?.addEventListener("click", () => { void showProfile(container, () => undefined); });
    menu.querySelector("[data-action=leaderboard]")?.addEventListener("click", () => { void showLeaderboard(container, () => undefined); });
  }

  // First launch: name, then Training. Returning players stay on the menu.
  if (!loadName()) {
    nameInput.focus();
  } else if (!courseDone() && !sessionStorage.getItem("bowdle-trained")) {
    // Soft nudge only once per session; the Training button is the front door.
  }
}

export function showDesktopOnly(container: HTMLElement): void {
  container.innerHTML = `<main class="bowdle-menu"><h1>Bowdle</h1><p>Desktop only for now.</p><p>The jungle needs a keyboard and mouse. We’ll save you a bow.</p></main>`;
}
