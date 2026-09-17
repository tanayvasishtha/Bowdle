import { Room, matchMaker, type Client } from "colyseus";
import { canQueueRanked, defaultRating, pairQueue, queueOffersUnranked, type QueueSeat } from "../../shared/rating.ts";
import { gameDatabase } from "../db/GameDatabase.ts";
type QueueOptions = { name?: string; token?: string; test?: boolean; rating?: number };
type Seat = QueueSeat & { client: Client; token?: string; name: string };

/** Ranked matchmaking lobby: widen by rating, then seat both into a ranked TDM room with no bots. */
export class QueueRoom extends Room {
  maxClients = 64;
  private seats = new Map<string, Seat>();
  private joinedAt = new Map<string, number>();
  private nowMs = () => Date.now();
  private timer?: ReturnType<typeof setInterval>;

  onCreate(): void {
    this.timer = setInterval(() => this.pulse(), 1000);
    this.onMessage("acceptUnranked", (client: Client) => { void this.sendUnranked(client); });
  }

  async onAuth(_client: Client, options: QueueOptions): Promise<boolean> {
    if (options?.test) return true;
    const token = options?.token;
    if (!token) throw new Error("sign_in_required");
    const db = await gameDatabase();
    const accountId = await db.authenticate(token);
    if (!accountId) throw new Error("sign_in_required");
    const profile = await db.profile(accountId);
    if (!profile) throw new Error("sign_in_required");
    if (!canQueueRanked(profile.progress.level, profile.linked.length > 0)) {
      throw new Error("ranked_locked");
    }
    return true;
  }

  async onJoin(client: Client, options: QueueOptions): Promise<void> {
    const db = await gameDatabase();
    let accountId = `guest-${client.sessionId}`;
    let rating = Number.isFinite(options?.rating) ? Number(options!.rating) : defaultRating().rating;
    let name = options?.name?.trim() || "Explorer";
    if (options?.token) {
      const id = await db.authenticate(options.token);
      if (id) {
        accountId = id;
        rating = (await db.getRating(id)).rating;
        const profile = await db.profile(id);
        if (profile) name = profile.name;
      }
    }
    const now = this.nowMs();
    this.seats.set(client.sessionId, { id: accountId, rating, joinedAtMs: now, client, token: options?.token, name });
    this.joinedAt.set(client.sessionId, now);
    this.pulse();
  }

  onLeave(client: Client): void {
    this.seats.delete(client.sessionId);
    this.joinedAt.delete(client.sessionId);
  }

  onDispose(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Test hook: drive the matchmaker clock without waiting on setInterval. */
  debugSetNow(nowMs: number): void { this.nowMs = () => nowMs; }
  debugPulse(): void { this.pulse(); }

  private pulse(): void {
    const now = this.nowMs();
    for (const [sessionId, joined] of this.joinedAt) {
      const seat = this.seats.get(sessionId);
      if (!seat) continue;
      seat.client.send("queueStatus", {
        waitedMs: now - joined,
        unrankedOffer: queueOffersUnranked(joined, now),
      });
    }
    const list = [...this.seats.values()].map(({ id, rating, joinedAtMs }) => ({ id, rating, joinedAtMs }));
    const paired = pairQueue(list, now);
    if (!paired) return;
    const [a, b] = paired;
    const seatA = [...this.seats.values()].find((s) => s.id === a.id && s.joinedAtMs === a.joinedAtMs);
    const seatB = [...this.seats.values()].find((s) => s.id === b.id && s.joinedAtMs === b.joinedAtMs);
    if (!seatA || !seatB) return;
    void this.launchRanked(seatA, seatB);
  }

  private async launchRanked(a: Seat, b: Seat): Promise<void> {
    this.seats.delete(a.client.sessionId);
    this.seats.delete(b.client.sessionId);
    this.joinedAt.delete(a.client.sessionId);
    this.joinedAt.delete(b.client.sessionId);
    try {
      const room = await matchMaker.createRoom("ranked", { ranked: true });
      for (const seat of [a, b]) {
        const reservation = await matchMaker.reserveSeatFor(room, {
          name: seat.name,
          token: seat.token,
          ranked: true,
        });
        seat.client.send("matched", reservation);
      }
    } catch (error) {
      console.error("ranked match create failed", error);
      const now = this.nowMs();
      for (const seat of [a, b]) {
        seat.joinedAtMs = now;
        this.seats.set(seat.client.sessionId, seat);
        this.joinedAt.set(seat.client.sessionId, now);
      }
    }
  }

  private async sendUnranked(client: Client): Promise<void> {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;
    this.seats.delete(client.sessionId);
    this.joinedAt.delete(client.sessionId);
    const room = await matchMaker.createRoom("tdm", {});
    const reservation = await matchMaker.reserveSeatFor(room, {
      name: seat.name,
      token: seat.token,
    });
    client.send("matched", reservation);
  }
}

