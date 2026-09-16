import { DEFAULT_FOV, MASTER_VOLUME, MAX_FOV, MIN_FOV, MOUSE_SENSITIVITY } from "../shared/constants.ts";
export { nameError } from "../shared/name.ts";

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
  keys: KeyBindings;
};

export const DEFAULT_KEYS: KeyBindings = {
  forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD", jump: "Space", crouch: "KeyC",
  draw: "Mouse0", aim: "Mouse2", cancel: "KeyR", melee: "KeyV", grapple: "KeyE", ink: "KeyQ",
  use: "KeyF", dodge: "ShiftLeft", slot1: "Digit1", slot2: "Digit2", slot3: "Digit3", scoreboard: "Tab", menu: "Escape", debug: "F3",
};

const STORAGE_KEY = "bowdle.settings.v1";
const NAME_KEY = "bowdle.name";

export function defaultSettings(): GameSettings {
  return { sensitivity: MOUSE_SENSITIVITY, fov: DEFAULT_FOV, masterVolume: MASTER_VOLUME, boil: true, floatingNotes: true, colorblindSymbols: false, reduceMotion: false, damageNumbers: true, tips: true, keys: { ...DEFAULT_KEYS } };
}

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
      keys: { ...DEFAULT_KEYS, ...parsed.keys },
    };
  } catch { return defaults; }
}

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent<GameSettings>("bowdle-settings", { detail: settings }));
}

export function loadName(): string { return localStorage.getItem(NAME_KEY) ?? ""; }
export function saveName(name: string): void { localStorage.setItem(NAME_KEY, name); }
