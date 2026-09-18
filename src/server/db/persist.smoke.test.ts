import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GameDatabase, closeGameDatabase } from "./GameDatabase.ts";
import { databaseMode, openSql } from "./sql.ts";

const dir = resolve(".data/persist-smoke");

describe("durable database", () => {
  afterAll(async () => {
    await closeGameDatabase().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps a guest account after reopening PGLITE_DIR", async () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    process.env.PGLITE_DIR = dir;
    delete process.env.DATABASE_URL;
    expect(databaseMode()).toBe("pglite");

    const db1 = await GameDatabase.open({ sql: await openSql(process.env) });
    const guest = await db1.createGuest("PersistSmoke");
    const { token, profile } = guest;
    await db1.close();
    await closeGameDatabase();

    const db2 = await GameDatabase.open({ sql: await openSql(process.env) });
    expect(await db2.authenticate(token)).toBe(profile.id);
    expect((await db2.profile(profile.id))?.name).toBe("PersistSmoke");
    await db2.close();
    await closeGameDatabase();
  });
});
