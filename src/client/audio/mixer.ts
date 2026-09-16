import { loadSettings, saveSettings, type GameSettings } from "../settings.ts";
import { applyMix } from "./bus.ts";

const MUSIC_KEY = "KeyM";
let installed = false;

/** Applies the volume settings to the buses, follows later changes, and lets M switch the music on and off. */
export function installAudioMix(): void {
  if (installed) return;
  installed = true;
  applyMix(loadSettings());
  window.addEventListener("bowdle-settings", (event) => applyMix((event as CustomEvent<GameSettings>).detail));
  window.addEventListener("keydown", (event) => {
    if (event.code !== MUSIC_KEY || event.repeat) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const settings = loadSettings();
    saveSettings({ ...settings, music: !settings.music });
  });
}
