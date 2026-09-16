export type ServerMetricSnapshot = { rooms: number; players: number; averageTickMs: number };

export class ServerMetrics {
  private rooms = 0;
  private players = 0;
  private tickTotalMs = 0;
  private tickCount = 0;

  roomOpened(players: number): void { this.rooms += 1; this.players += players; }
  roomClosed(players: number): void { this.rooms = Math.max(0, this.rooms - 1); this.players = Math.max(0, this.players - players); }
  playerDelta(change: number): void { this.players = Math.max(0, this.players + change); }
  tick(durationMs: number): void { this.tickTotalMs += durationMs; this.tickCount += 1; }
  takeSnapshot(): ServerMetricSnapshot {
    const snapshot = { rooms: this.rooms, players: this.players, averageTickMs: this.tickCount === 0 ? 0 : this.tickTotalMs / this.tickCount };
    this.tickTotalMs = 0; this.tickCount = 0; return snapshot;
  }
}

export const serverMetrics = new ServerMetrics();
