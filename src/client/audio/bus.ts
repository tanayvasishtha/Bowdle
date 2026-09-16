/** Every AudioContext the game opens, so ad breaks can silence all of them at once. */
const contexts = new Set<AudioContext>();
let suspended = false;

export function registerAudioContext(context: AudioContext): void {
  contexts.add(context);
  if (suspended) void context.suspend().catch(() => undefined);
}

export function setAudioSuspended(value: boolean): void {
  suspended = value;
  for (const context of contexts) void (value ? context.suspend() : context.resume()).catch(() => undefined);
}

export function audioSuspended(): boolean { return suspended; }
