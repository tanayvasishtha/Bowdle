import { DEFAULT_FOV, MASTER_VOLUME, MAX_FOV, MIN_FOV, MOUSE_SENSITIVITY } from "../shared/constants.ts";
import { FPS_CAPS, GRAPHICS_PRESETS, type FpsCap, type GraphicsPreset } from "../shared/graphics.ts";
import { AUDIO_MIX } from "./render/look.ts";
export { nameError } from "../shared/name.ts";

export const CROSSHAIR_STYLES = ["circle", "dot", "cross"] as const;
export type CrosshairStyle = typeof CROSSHAIR_STYLES[number];
export const CROSSHAIR_COLORS = ["sepia", "sunInk", "gold", "moonInk", "parchment"] as const;
export type CrosshairColor = typeof CROSSHAIR_COLORS[number];
export const TEAM_PALETTE_NAMES = ["default", "deuteranopia", "protanopia", "tritanopia"] as const;
export type TeamPaletteName = typeof TEAM_PALETTE_NAMES[number];
export const CROSSHAIR_SIZE = { min: 12, max: 48, default: 36 } as const;

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? value as T : fallback;
}

export const ACTION_LABELS = {
  forward: "Move forward", back: "Move back", left: "Move left", right: "Move right", jump: "Jump", crouch: "Crouch / slide",
  draw: "Draw / fire", aim: "Aim", cancel: "Cancel draw", melee: "Dagger", grapple: "Grapple (hold to reel)", ink: "Ink cloud", use: "Use", dodge: "Dodge", slot1: "Broadhead arrow", slot2: "Scatter arrows", slot3: "Tether arrow",
  scoreboard: "Scoreboard", menu: "Menu", debug: "Debug overlay",
} as const;

/** How a bound key reads on screen. */
export function keyLabel(code: string): string {
  if (code === "Mouse0") return "Left mouse";
  if (code === "Mouse2") return "Right mouse";
  if (code.startsWith("Mouse")) return `Mouse ${code.slice(5)}`;
  if (code === "ShiftLeft") return "Left Shift";
  return code.replace("Key", "").replace("Digit", "");
}

export const ACTIONS = ["forward", "back", "left", "right", "jump", "crouch", "draw", "aim", "cancel", "melee", "grapple", "ink", "use", "dodge", "slot1", "slot2", "slot3", "scoreboard", "menu", "debug"] as const;
export type Action = typeof ACTIONS[number];
export type KeyBindings = Record<Action, string>;

export type GameSettings = {
  sensitivity: number;
  fov: number;
  masterVolume: number;
  boil: boolean;
  floatingNotes: boolean;
  colorblindSymbols: boolean;
  /** Turns off head bob, roll, shake, speed streaks and FOV kicks. */
  reduceMotion: boolean;
  damageNumbers: boolean;
  /** Short hints about unused moves during the first matches. */
  tips: boolean;
  musicVolume: number;
  effectsVolume: number;
  ambienceVolume: number;
  /** Music on or off; M toggles it. */
  music: boolean;
  /** Screen-edge marks for footsteps, shots and boulders. */
  soundIndicators: boolean;
  invertY: boolean;
  /** Look speed multiplier while aiming, for mouse and pad. */
  aimSensitivity: number;
  /** Stick look speed multiplier. */
  gamepadSensitivity: number;
  /** Draw and aim toggle on each press instead of acting while held. */
  trackpadMode: boolean;
  crosshairStyle: CrosshairStyle;
  crosshairSize: number;
  crosshairColor: CrosshairColor;
  teamPalette: TeamPaletteName;
  keys: KeyBindings;
  /** Empty string means auto-pick the lowest ping. */
  preferredRegion: string;
  graphicsPreset: GraphicsPreset;
  fpsCap: FpsCap;
  /** True after the first-launch benchmark or a manual preset pick. */
  graphicsBenchmarked: boolean;
};

export const DEFAULT_KEYS: KeyBindings = {
  forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD", jump: "Space", crouch: "KeyC",
  draw: "Mouse0", aim: "Mouse2", cancel: "KeyR", melee: "KeyV", grapple: "KeyE", ink: "KeyQ",
  use: "KeyF", dodge: "ShiftLeft", slot1: "Digit1", slot2: "Digit2", slot3: "Digit3", scoreboard: "Tab", menu: "Escape", debug: "F3",
};

const STORAGE_KEY = "bowdle.settings.v1";
const NAME_KEY = "bowdle.name";

export function defaultSettings(): GameSettings {
  return { sensitivity: MOUSE_SENSITIVITY, fov: DEFAULT_FOV, masterVolume: MASTER_VOLUME, boil: true, floatingNotes: true, colorblindSymbols: false, reduceMotion: false, damageNumbers: true, tips: true, musicVolume: AUDIO_MIX.defaultMusic, effectsVolume: AUDIO_MIX.defaultEffects, ambienceVolume: AUDIO_MIX.defaultAmbience, music: true, soundIndicators: false, invertY: false, aimSensitivity: 1, gamepadSensitivity: 1, trackpadMode: false, crosshairStyle: "circle", crosshairSize: CROSSHAIR_SIZE.default, crosshairColor: "sepia", teamPalette: "default", keys: { ...DEFAULT_KEYS }, preferredRegion: "", graphicsPreset: "high", fpsCap: 60, graphicsBenchmarked: false };
}

function range(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function unit(value: unknown, fallback: number): number { return range(value, 0, 1, fallback); }

export function loadSettings(): GameSettings {
  const defaults = defaultSettings();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<GameSettings> | null;
    if (!parsed) return defaults;
    return {
      sensitivity: typeof parsed.sensitivity === "number" ? Math.max(0.0005, Math.min(0.008, parsed.sensitivity)) : defaults.sensitivity,
      fov: typeof parsed.fov === "number" ? Math.max(MIN_FOV, Math.min(MAX_FOV, parsed.fov)) : defaults.fov,
      masterVolume: typeof parsed.masterVolume === "number" ? Math.max(0, Math.min(1, parsed.masterVolume)) : defaults.masterVolume,
      boil: parsed.boil ?? defaults.boil,
      floatingNotes: parsed.floatingNotes ?? defaults.floatingNotes,
      colorblindSymbols: parsed.colorblindSymbols ?? defaults.colorblindSymbols,
      reduceMotion: parsed.reduceMotion ?? defaults.reduceMotion,
      damageNumbers: parsed.damageNumbers ?? defaults.damageNumbers,
      tips: parsed.tips ?? defaults.tips,
      musicVolume: unit(parsed.musicVolume, defaults.musicVolume),
      effectsVolume: unit(parsed.effectsVolume, defaults.effectsVolume),
      ambienceVolume: unit(parsed.ambienceVolume, defaults.ambienceVolume),
      music: parsed.music ?? defaults.music,
      soundIndicators: parsed.soundIndicators ?? defaults.soundIndicators,
      invertY: parsed.invertY ?? defaults.invertY,
      aimSensitivity: range(parsed.aimSensitivity, 0.3, 1.5, defaults.aimSensitivity),
      gamepadSensitivity: range(parsed.gamepadSensitivity, 0.3, 2, defaults.gamepadSensitivity),
      trackpadMode: parsed.trackpadMode ?? defaults.trackpadMode,
      crosshairStyle: oneOf(parsed.crosshairStyle, CROSSHAIR_STYLES, defaults.crosshairStyle),
      crosshairSize: range(parsed.crosshairSize, CROSSHAIR_SIZE.min, CROSSHAIR_SIZE.max, defaults.crosshairSize),
      crosshairColor: oneOf(parsed.crosshairColor, CROSSHAIR_COLORS, defaults.crosshairColor),
      teamPalette: oneOf(parsed.teamPalette, TEAM_PALETTE_NAMES, defaults.teamPalette),
      keys: { ...DEFAULT_KEYS, ...parsed.keys },
      preferredRegion: typeof parsed.preferredRegion === "string" ? parsed.preferredRegion : defaults.preferredRegion,
      graphicsPreset: (GRAPHICS_PRESETS as readonly string[]).includes(String(parsed.graphicsPreset)) ? parsed.graphicsPreset as GraphicsPreset : defaults.graphicsPreset,
      fpsCap: (FPS_CAPS as readonly number[]).includes(Number(parsed.fpsCap)) ? Number(parsed.fpsCap) as FpsCap : defaults.fpsCap,
      graphicsBenchmarked: parsed.graphicsBenchmarked === true,
    };
  } catch { return defaults; }
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent<GameSettings>("bowdle-settings", { detail: settings }));
}

export function loadName(): string { return localStorage.getItem(NAME_KEY) ?? ""; }
export function saveName(name: string): void { localStorage.setItem(NAME_KEY, name); }
