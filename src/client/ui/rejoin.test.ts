import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveRejoinTicket, loadRejoinTicket, clearRejoinTicket } from "./rejoin.ts";

const memory = new Map<string, string>();
const sessionStorageStub = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
  clear: () => { memory.clear(); },
};

describe("N3 rejoin ticket", () => {
  beforeEach(() => {
    memory.clear();
    Object.defineProperty(globalThis, "sessionStorage", { value: sessionStorageStub, configurable: true });
  });
  afterEach(() => { clearRejoinTicket(); memory.clear(); });

  it("round-trips a fresh ticket and expires an old one", () => {
    saveRejoinTicket({ roomId: "r1", reconnectionToken: "tok", mode: "tdm", savedAt: Date.now() });
    expect(loadRejoinTicket()?.reconnectionToken).toBe("tok");
    clearRejoinTicket();
    saveRejoinTicket({ roomId: "r1", reconnectionToken: "old", mode: "tdm", savedAt: Date.now() - 60_000 });
    expect(loadRejoinTicket()).toBeUndefined();
  });
});
