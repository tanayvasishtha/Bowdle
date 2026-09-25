import { loadSettings, saveSettings, type GameSettings } from "../settings.ts";
import { applyMix, audioBuses } from "./bus.ts";

const MUSIC_KEY = "KeyM";
let installed = false;

/** Applies the volume settings to the buses, follows later changes, and lets M switch the music on and off. */
export function installAudioMix(): void {
  if (installed) return;
  installed = true;
  applyMix(loadSettings());
  // Open the audio device now, behind the loading screen. Opening it can block for half a second, and done lazily it
  // landed on the first click or the first shot of a match. It stays suspended (no audio processing) until the first
  // click or key resumes it, the same moment the browser would allow sound anyway.
  void audioBuses()?.context.suspend().catch(() => undefined);
  window.addEventListener("bowdle-settings", (event) => applyMix((event as CustomEvent<GameSettings>).detail));
  window.addEventListener("keydown", (event) => {
    if (event.code !== MUSIC_KEY || event.repeat) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const settings = loadSettings();
    saveSettings({ ...settings, music: !settings.music });
  });
}
