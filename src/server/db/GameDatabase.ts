import { createHash, randomBytes } from "node:crypto";
import { levelProgress, matchReward, seasonId, type LevelProgress, type MatchReward } from "../../shared/progression.ts";
import { nameError } from "../../shared/name.ts";
import { migrate } from "./migrations.ts";
import { openSql, type SqlClient, type SqlQuery } from "./sql.ts";
import { PROVIDERS, type BuyResult, type LeaderboardRow, type Locker, type Profile, type Provider } from "../../shared/api.ts";
import { DEFAULT_LOADOUT, LEVEL_TRACK, cosmeticById, cosmeticBySku, nextUnlock, sanitizeLoadout, type Loadout } from "../../shared/cosmetics.ts";
import type { MatchStats } from "../../shared/matchStats.ts";
import { createMatchStats } from "../../shared/matchStats.ts";
import { DAILY_POOL, WEEKLY_POOL, challengeReward, dailyChallenges, weeklyChallenges, periodKeys, resetTimes, progressFrom, type ChallengeChange, type Challenges, type ChallengeState } from "../../shared/challenges.ts";
import { PLAY_STREAK, UTC_DAY_MS } from "../../shared/constants.ts";

export { PROVIDERS, type LeaderboardRow, type Profile, type Provider };
export type MatchResultLine = { accountId: string; kills: number; assists: number; won: boolean; stats?: MatchStats; medals?: readonly string[]; mapId?: string };
export type GrantedReward = MatchReward & { accountId: string; before: LevelProgress; after: LevelProgress; challenges: ChallengeChange[]; streakDays: number; unlocked: string[] };

type AccountRow = { id: string; name: string; xp: number; ink: number; discord_id: string | null; google_id: string | null; streak_days: number; last_play_day: string; first_win_day: string; reroll_day: string; total_matches: number; total_wins: number; total_kills: number; total_headshots: number; best_streak: number; longest_shot_m: number };
type ChallengeRow = { period_key: string; challenge_id: string; progress: number; done: boolean; maps: string };

async function challengeRows(query: SqlQuery, accountId: string, now: Date): Promise<ChallengeRow[]> {
  const keys = periodKeys(now);
  const rows = await query<ChallengeRow>("SELECT * FROM account_challenges WHERE account_id = $1 AND period_key IN ($2, $3) ORDER BY challenge_id", [accountId, keys.daily, keys.weekly]);
  for (const [key, picks] of [[keys.daily, dailyChallenges(now)], [keys.weekly, weeklyChallenges(now)]] as const) {
    if (rows.some((row) => row.period_key === key)) continue;
    for (const challenge of picks) {
      await query("INSERT INTO account_challenges (account_id, period_key, challenge_id) VALUES ($1, $2, $3)", [accountId, key, challenge.id]);
      rows.push({ period_key: key, challenge_id: challenge.id, progress: 0, done: false, maps: "" });
    }
  }
  return rows.sort((a, b) => a.challenge_id.localeCompare(b.challenge_id));
}

function challengeView(rows: ChallengeRow[], now: Date, rerollDay: string): Challenges {
  const keys = periodKeys(now);
  const states = (key: string): ChallengeState[] => rows.filter((row) => row.period_key === key).sort((a, b) => a.challenge_id.localeCompare(b.challenge_id)).map((row) => {
    const challenge = [...DAILY_POOL, ...WEEKLY_POOL].find((entry) => entry.id === row.challenge_id)!;
    return { id: challenge.id, text: challenge.text, target: challenge.target, progress: row.progress, done: row.done, reward: challengeReward(challenge.id) };
  });
  return { daily: states(keys.daily), weekly: states(keys.weekly), ...resetTimes(now), rerollAvailable: rerollDay !== keys.daily.slice(2) };
}

async function grantLevelRewards(query: SqlQuery, accountId: string, before: number, after: number): Promise<{ unlocked: string[]; breakdown: MatchReward["breakdown"] }> {
  const unlocked: string[] = []; const breakdown: MatchReward["breakdown"] = [];
  for (const reward of LEVEL_TRACK) {
    if (reward.level <= before || reward.level > after) continue;
    if (reward.itemId) {
      const inserted = await query<{ item_id: string }>("INSERT INTO inventory (account_id, item_id, source) VALUES ($1, $2, 'level') ON CONFLICT (account_id, item_id) DO NOTHING RETURNING item_id", [accountId, reward.itemId]);
      if (inserted.length) unlocked.push(reward.itemId);
    } else breakdown.push({ label: `Level ${reward.level} reward`, xp: 0, ink: reward.ink });
  }
  const ink = breakdown.reduce((sum, line) => sum + line.ink, 0);
  if (ink > 0) await query("UPDATE accounts SET ink = ink + $1 WHERE id = $2", [ink, accountId]);
  return { unlocked, breakdown };
}

const TOKEN_BYTES = 24;
const ID_BYTES = 9;

function hashSecret(secret: string): string { return createHash("sha256").update(secret).digest("hex"); }

/** A token is `<account id>.<secret>`. Only the secret hash is stored, so a database leak cannot sign anyone in. */
function splitToken(token: string): { id: string; secret: string } | undefined {
  const match = /^([A-Za-z0-9_-]{8,32})\.([A-Za-z0-9_-]{16,64})$/.exec(token);
  return match ? { id: match[1]!, secret: match[2]! } : undefined;
}

export class GameDatabase {
  private readonly sql: SqlClient;
  private readonly now: () => Date;

  private constructor(sql: SqlClient, now: () => Date) { this.sql = sql; this.now = now; }

  static async open(options: { sql?: SqlClient; now?: () => Date } = {}): Promise<GameDatabase> {
    const sql = options.sql ?? await openSql();
    await migrate(sql);
    return new GameDatabase(sql, options.now ?? (() => new Date()));
  }

  close(): Promise<void> { return this.sql.close(); }

  currentSeason(): string { return seasonId(this.now()); }

  async createGuest(requestedName: string): Promise<{ token: string; profile: Profile }> {
    const name = nameError(requestedName) ? "Explorer" : requestedName.trim();
    const id = randomBytes(ID_BYTES).toString("base64url");
    const secret = randomBytes(TOKEN_BYTES).toString("base64url");
    await this.sql.query("INSERT INTO accounts (id, name) VALUES ($1, $2)", [id, name]);
    return { token: await this.issueToken(id), profile: (await this.profile(id))! };
  }

  /** Returns the account id for a valid token, or undefined. */
  async authenticate(token: string | undefined): Promise<string | undefined> {
    const parts = token ? splitToken(token) : undefined;
    if (!parts) return undefined;
    // The hash is the lookup key, so a wrong secret never reaches a comparison that could leak timing.
    const rows = await this.sql.query<{ account_id: string }>("SELECT account_id FROM account_tokens WHERE secret_hash = $1", [hashSecret(parts.secret)]);
    if (rows[0]?.account_id !== parts.id) return undefined;
    await this.sql.query("UPDATE accounts SET seen_at = now() WHERE id = $1", [parts.id]);
    return parts.id;
  }

  async profile(accountId: string): Promise<Profile | undefined> {
    const rows = await this.sql.query<AccountRow>("SELECT * FROM accounts WHERE id = $1", [accountId]);
    const account = rows[0];
    if (!account) return undefined;
    const season = seasonId(this.now());
    const stats = (await this.sql.query<{ kills: number; matches: number; wins: number }>(
      "SELECT kills, matches, wins FROM season_stats WHERE season = $1 AND account_id = $2", [season, accountId],
    ))[0];
    return {
      id: account.id, name: account.name, xp: account.xp, ink: account.ink, progress: levelProgress(account.xp), season,
      seasonKills: stats?.kills ?? 0, seasonMatches: stats?.matches ?? 0, seasonWins: stats?.wins ?? 0,
      linked: PROVIDERS.filter((provider) => account[`${provider}_id`] !== null),
      streakDays: account.streak_days,
      career: { matches: account.total_matches, wins: account.total_wins, kills: account.total_kills, headshots: account.total_headshots, bestStreak: account.best_streak, longestShotM: account.longest_shot_m },
      nextUnlock: nextUnlock(levelProgress(account.xp).level),
    };
  }

  async rename(accountId: string, name: string): Promise<boolean> {
    if (nameError(name)) return false;
    const rows = await this.sql.query<{ id: string }>("UPDATE accounts SET name = $1 WHERE id = $2 RETURNING id", [name.trim(), accountId]);
    return rows.length === 1;
  }

  /** Grants each account its reward once per match id. Repeating a match id grants nothing new. */
  async recordMatch(matchId: string, lines: readonly MatchResultLine[]): Promise<GrantedReward[]> {
    const now = this.now(); const season = seasonId(now); const day = periodKeys(now).daily.slice(2);
    return this.sql.transaction(async (query) => {
      const granted: GrantedReward[] = [];
      for (const line of lines) {
        const account = (await query<AccountRow>("SELECT * FROM accounts WHERE id = $1 FOR UPDATE", [line.accountId]))[0];
        if (!account) continue;
        const reward = matchReward(line.stats ?? line, line.medals);
        const inserted = await query<{ account_id: string }>(
          `INSERT INTO match_rewards (match_id, account_id, xp, ink)
           SELECT $1, id, $3, $4 FROM accounts WHERE id = $2
           ON CONFLICT (match_id, account_id) DO NOTHING RETURNING account_id`,
          [matchId, line.accountId, reward.xp, reward.ink],
        );
        if (inserted.length === 0) continue;
        const changes: ChallengeChange[] = [];
        const stats = { ...(line.stats ?? { ...createMatchStats(), kills: line.kills, assists: line.assists, won: line.won }), medals: line.medals };
        const firstWinDay = stats.won ? day : account.first_win_day;
        if (stats.won && account.first_win_day !== day) reward.breakdown.push({ label: "First win of the day", xp: PLAY_STREAK.firstWinXp, ink: PLAY_STREAK.firstWinInk });
        const rows = await challengeRows(query, line.accountId, now);
        for (const row of rows) {
          if (row.done) continue;
          const challenge = [...DAILY_POOL, ...WEEKLY_POOL].find((entry) => entry.id === row.challenge_id)!;
          const maps = row.maps ? row.maps.split(",") : [];
          if (challenge.stat === "mapsWon" && stats.won && line.mapId && !maps.includes(line.mapId)) maps.push(line.mapId);
          const after = Math.min(challenge.target, challenge.stat === "mapsWon" ? maps.length : row.progress + progressFrom(stats, challenge));
          const done = after >= challenge.target;
          await query("UPDATE account_challenges SET progress = $1, done = $2, maps = $3 WHERE account_id = $4 AND period_key = $5 AND challenge_id = $6", [after, done, maps.join(","), line.accountId, row.period_key, row.challenge_id]);
          if (after !== row.progress) changes.push({ id: challenge.id, text: challenge.text, before: row.progress, after, target: challenge.target, done });
          if (done) reward.breakdown.push({ label: `${challenge.id.startsWith("d.") ? "Daily" : "Weekly"}: ${challenge.text}`, ...challengeReward(challenge.id) });
        }
        let streakDays = account.streak_days;
        if (account.last_play_day !== day) {
          const yesterday = periodKeys(new Date(now.getTime() - UTC_DAY_MS)).daily.slice(2);
          streakDays = account.last_play_day === yesterday ? streakDays + 1 : 1;
          reward.breakdown.push({ label: `Streak day ${streakDays}`, xp: 0, ink: PLAY_STREAK.inkPerDay * Math.min(streakDays, PLAY_STREAK.capDays) });
        }
        reward.xp = reward.breakdown.reduce((sum, row) => sum + row.xp, 0);
        reward.ink = reward.breakdown.reduce((sum, row) => sum + row.ink, 0);
        await query("UPDATE accounts SET streak_days = $1, last_play_day = $2, first_win_day = $3 WHERE id = $4", [streakDays, day, firstWinDay, line.accountId]);
        const updated = await query<{ xp: number }>("UPDATE accounts SET xp = xp + $1, ink = ink + $2 WHERE id = $3 RETURNING xp", [reward.xp, reward.ink, line.accountId]);
        await query(
          `INSERT INTO season_stats (season, account_id, kills, matches, wins) VALUES ($1, $2, $3, 1, $4)
           ON CONFLICT (season, account_id) DO UPDATE SET kills = season_stats.kills + EXCLUDED.kills,
             matches = season_stats.matches + 1, wins = season_stats.wins + EXCLUDED.wins`,
          [season, line.accountId, Math.max(0, Math.floor(line.kills) || 0), line.won ? 1 : 0],
        );
        const after = updated[0]!.xp;
        const beforeProgress = levelProgress(after - reward.xp); const afterProgress = levelProgress(after);
        const levels = await grantLevelRewards(query, line.accountId, beforeProgress.level, afterProgress.level);
        reward.breakdown.push(...levels.breakdown); reward.ink += levels.breakdown.reduce((sum, row) => sum + row.ink, 0);
        await query("UPDATE match_rewards SET xp = $1, ink = $2, created_at = $3 WHERE match_id = $4 AND account_id = $5", [reward.xp, reward.ink, now, matchId, line.accountId]);
        await query("UPDATE accounts SET total_matches = total_matches + 1, total_wins = total_wins + $1, total_kills = total_kills + $2, total_headshots = total_headshots + $3, best_streak = GREATEST(best_streak, $4), longest_shot_m = GREATEST(longest_shot_m, $5) WHERE id = $6", [stats.won ? 1 : 0, stats.kills, stats.headshots, stats.bestStreak, stats.longestShotM, line.accountId]);
        granted.push({ accountId: line.accountId, ...reward, before: beforeProgress, after: afterProgress, challenges: changes, streakDays, unlocked: levels.unlocked });
      }
      return granted;
    });
  }

  async challenges(accountId: string, now: Date = this.now()): Promise<Challenges> {
    return this.sql.transaction(async (query) => {
      const account = (await query<AccountRow>("SELECT * FROM accounts WHERE id = $1 FOR UPDATE", [accountId]))[0];
      if (!account) throw new Error("Account unavailable");
      return challengeView(await challengeRows(query, accountId, now), now, account.reroll_day);
    });
  }

  async rerollDaily(accountId: string, id: string): Promise<Challenges | undefined> {
    const now = this.now(); const key = periodKeys(now).daily; const day = key.slice(2);
    return this.sql.transaction(async (query) => {
      const account = (await query<AccountRow>("SELECT * FROM accounts WHERE id = $1 FOR UPDATE", [accountId]))[0];
      if (!account || account.reroll_day === day) return undefined;
      const rows = await challengeRows(query, accountId, now);
      const row = rows.find((entry) => entry.period_key === key && entry.challenge_id === id);
      if (!row || row.done) return undefined;
      const replacement = DAILY_POOL.find((entry) => !rows.some((current) => current.period_key === key && current.challenge_id === entry.id))!;
      await query("DELETE FROM account_challenges WHERE account_id = $1 AND period_key = $2 AND challenge_id = $3", [accountId, key, id]);
      await query("INSERT INTO account_challenges (account_id, period_key, challenge_id) VALUES ($1, $2, $3)", [accountId, key, replacement.id]);
      await query("UPDATE accounts SET reroll_day = $1 WHERE id = $2", [day, accountId]);
      row.challenge_id = replacement.id; row.progress = 0; row.done = false; row.maps = "";
      return challengeView(rows, now, day);
    });
  }

  async leaderboard(season = seasonId(this.now()), limit = 50): Promise<LeaderboardRow[]> {
    const rows = await this.sql.query<{ name: string; kills: number; wins: number; matches: number; xp: number }>(
      `SELECT a.name, s.kills, s.wins, s.matches, a.xp FROM season_stats s JOIN accounts a ON a.id = s.account_id
       WHERE s.season = $1 ORDER BY s.kills DESC, s.wins DESC, a.created_at ASC LIMIT $2`,
      [season, Math.max(1, Math.min(100, Math.floor(limit)))],
    );
    return rows.map((row, index) => ({ rank: index + 1, name: row.name, kills: row.kills, wins: row.wins, matches: row.matches, level: levelProgress(row.xp).level }));
  }

  /**
   * Signs in through a provider. If the identity is already linked, returns that account.
   * Otherwise links it to `currentAccountId` when given, or creates a new account.
   */
  async signInWithProvider(provider: Provider, providerId: string, displayName: string, currentAccountId?: string): Promise<{ accountId: string; token?: string }> {
    const column = `${provider}_id`;
    const existing = await this.sql.query<{ id: string }>(`SELECT id FROM accounts WHERE ${column} = $1`, [providerId]);
    if (existing[0]) return existing[0].id === currentAccountId ? { accountId: currentAccountId } : { accountId: existing[0].id, token: await this.issueToken(existing[0].id) };
    if (currentAccountId) {
      const linked = await this.sql.query<{ id: string }>(`UPDATE accounts SET ${column} = $1 WHERE id = $2 AND ${column} IS NULL RETURNING id`, [providerId, currentAccountId]);
      if (linked[0]) return { accountId: linked[0].id };
    }
    const created = await this.createGuest(displayName.slice(0, 16));
    await this.sql.query(`UPDATE accounts SET ${column} = $1 WHERE id = $2`, [providerId, created.profile.id]);
    return { accountId: created.profile.id, token: created.token };
  }

  /** Issues a token for one device. Each device keeps its own token until the account is deleted. */
  private async issueToken(accountId: string): Promise<string> {
    const secret = randomBytes(TOKEN_BYTES).toString("base64url");
    await this.sql.query("INSERT INTO account_tokens (secret_hash, account_id) VALUES ($1, $2)", [hashSecret(secret), accountId]);
    return `${accountId}.${secret}`;
  }

  async grantInk(accountId: string, amount: number): Promise<void> {
    await this.sql.query("UPDATE accounts SET ink = ink + $1 WHERE id = $2", [Math.floor(amount), accountId]);
  }

  async grantXp(accountId: string, amount: number): Promise<Profile | undefined> {
    await this.sql.transaction(async (query) => {
      const account = (await query<{ xp: number }>("SELECT xp FROM accounts WHERE id = $1 FOR UPDATE", [accountId]))[0];
      if (!account) return;
      const xp = Math.max(0, Math.floor(amount));
      if (!Number.isFinite(xp)) throw new Error("Invalid XP grant");
      await query("UPDATE accounts SET xp = xp + $1 WHERE id = $2", [xp, accountId]);
      await grantLevelRewards(query, accountId, levelProgress(account.xp).level, levelProgress(account.xp + xp).level);
    });
    return this.profile(accountId);
  }

  async accountExists(accountId: string): Promise<boolean> {
    return (await this.sql.query("SELECT 1 FROM accounts WHERE id = $1", [accountId])).length === 1;
  }

  async locker(accountId: string): Promise<Locker | undefined> {
    const account = (await this.sql.query<{ ink: number; loadout_bow: string; loadout_trail: string; loadout_outfit: string; loadout_effect: string }>(
      "SELECT ink, loadout_bow, loadout_trail, loadout_outfit, loadout_effect FROM accounts WHERE id = $1", [accountId],
    ))[0];
    if (!account) return undefined;
    const owned = (await this.sql.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE account_id = $1 ORDER BY acquired_at", [accountId])).map((row) => row.item_id);
    // Re-check on read too, so a refunded or retired item can never stay equipped.
    const loadout = sanitizeLoadout({ bow: account.loadout_bow, trail: account.loadout_trail, outfit: account.loadout_outfit, effect: account.loadout_effect }, new Set(owned));
    return { ink: account.ink, owned, loadout };
  }

  async loadout(accountId: string): Promise<Loadout> {
    return (await this.locker(accountId))?.loadout ?? { ...DEFAULT_LOADOUT };
  }

  /** Equips only items the account owns; anything else falls back to that slot's default. */
  async setLoadout(accountId: string, requested: Partial<Record<keyof Loadout, string>>): Promise<Loadout | undefined> {
    const current = await this.locker(accountId);
    if (!current) return undefined;
    const loadout = sanitizeLoadout({ ...current.loadout, ...requested }, new Set(current.owned));
    await this.sql.query(
      "UPDATE accounts SET loadout_bow = $1, loadout_trail = $2, loadout_outfit = $3, loadout_effect = $4 WHERE id = $5",
      [loadout.bow, loadout.trail, loadout.outfit, loadout.effect, accountId],
    );
    return loadout;
  }

  async buyWithInk(accountId: string, itemId: string): Promise<BuyResult> {
    const item = cosmeticById(itemId);
    if (!item) return { ok: false, reason: "unknown_item" };
    if (!("ink" in item.price)) return { ok: false, reason: "not_for_ink" };
    const cost = item.price.ink;
    const outcome = await this.sql.transaction(async (query) => {
      const inserted = await query(
        "INSERT INTO inventory (account_id, item_id, source) SELECT id, $2, 'ink' FROM accounts WHERE id = $1 AND ink >= $3 ON CONFLICT DO NOTHING RETURNING item_id",
        [accountId, item.id, cost],
      );
      if (inserted.length === 1) {
        await query("UPDATE accounts SET ink = ink - $1 WHERE id = $2", [cost, accountId]);
        return "bought" as const;
      }
      const owned = await query("SELECT 1 FROM inventory WHERE account_id = $1 AND item_id = $2", [accountId, item.id]);
      return owned.length === 1 ? "owned" as const : "poor" as const;
    });
    if (outcome !== "bought") return { ok: false, reason: outcome };
    return { ok: true, locker: (await this.locker(accountId))! };
  }

  async createOrder(orderId: string, accountId: string, sku: string): Promise<void> {
    await this.sql.query("INSERT INTO orders (order_id, account_id, sku, status) VALUES ($1, $2, $3, 'created') ON CONFLICT (order_id) DO NOTHING", [orderId, accountId, sku]);
  }

  /**
   * Grants the items of a paid order. Safe to call again for the same order: Xsolla retries webhooks.
   * Returns the item ids newly granted.
   */
  async fulfillOrder(orderId: string, accountId: string, skus: readonly string[]): Promise<string[]> {
    const items = skus.map((sku) => cosmeticBySku(sku)).filter((item) => item !== undefined);
    return this.sql.transaction(async (query) => {
      const account = await query("SELECT 1 FROM accounts WHERE id = $1", [accountId]);
      if (account.length === 0) return [];
      const previous = await query<{ status: string }>("SELECT status FROM orders WHERE order_id = $1", [orderId]);
      if (previous[0]?.status === "paid" || previous[0]?.status === "canceled") return [];
      await query(
        `INSERT INTO orders (order_id, account_id, sku, status) VALUES ($1, $2, $3, 'paid')
         ON CONFLICT (order_id) DO UPDATE SET status = 'paid', account_id = EXCLUDED.account_id, updated_at = now()`,
        [orderId, accountId, skus.join(",")],
      );
      const granted: string[] = [];
      for (const item of items) {
        const rows = await query("INSERT INTO inventory (account_id, item_id, source, order_id) VALUES ($1, $2, 'xsolla', $3) ON CONFLICT DO NOTHING RETURNING item_id", [accountId, item.id, orderId]);
        if (rows.length === 1) granted.push(item.id);
      }
      return granted;
    });
  }

  /** Refund or chargeback: removes what the order granted. Returns the item ids removed. */
  async cancelOrder(orderId: string): Promise<string[]> {
    return this.sql.transaction(async (query) => {
      await query(
        `INSERT INTO orders (order_id, sku, status) VALUES ($1, '', 'canceled')
         ON CONFLICT (order_id) DO UPDATE SET status = 'canceled', updated_at = now()`,
        [orderId],
      );
      const removed = await query<{ item_id: string }>("DELETE FROM inventory WHERE order_id = $1 RETURNING item_id", [orderId]);
      return removed.map((row) => row.item_id);
    });
  }

  /** Removes the account and everything tied to it. */
  async deleteAccount(accountId: string): Promise<boolean> {
    const rows = await this.sql.query<{ id: string }>("DELETE FROM accounts WHERE id = $1 RETURNING id", [accountId]);
    return rows.length === 1;
  }
}

let shared: Promise<GameDatabase> | undefined;

/** The process-wide database, opened on first use so rooms without accounts never pay for it. */
export function gameDatabase(): Promise<GameDatabase> {
  shared ??= GameDatabase.open().catch((error: unknown) => { shared = undefined; throw error; });
  return shared;
}

export async function closeGameDatabase(): Promise<void> {
  const current = shared; shared = undefined;
  if (current) await (await current).close();
}
