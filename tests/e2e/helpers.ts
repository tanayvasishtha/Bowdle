import type { Page } from "@playwright/test";

// Font requests fail without internet (Codex cloud). That is expected and harmless.
const IGNORED_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = `${message.location().url} ${message.text()}`;
    if (IGNORED_HOSTS.some((host) => source.includes(host))) return;
    errors.push(message.text());
  });
  return errors;
}
