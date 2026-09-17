import { defineRoom, defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { Encoder } from "@colyseus/schema";
import { apiRouter } from "./api/routes.ts";
import { gameDatabase } from "./db/GameDatabase.ts";
import { TdmRoom } from "./rooms/TdmRoom.ts";
import { QueueRoom } from "./rooms/QueueRoom.ts";

// A full state with nested looks, hazards and Expedition creatures passes the 8 KB default; start larger than growing mid-match.
Encoder.BUFFER_SIZE = 32 * 1024;

export const server = defineServer({
  transport: new WebSocketTransport(),
  // Matchmaking only filters on options a joiner sends, so parties and each public mode get their own room name:
  // a join can never land in a party room or a room of another mode. A party picks its mode when it is created.
  rooms: {
    tdm: defineRoom(TdmRoom).filterBy(["test", "testMapId", "testRoom"]),
    ffa: defineRoom(TdmRoom).filterBy(["test", "testMapId", "testRoom"]),
    relic: defineRoom(TdmRoom).filterBy(["test", "testMapId", "testRoom"]),
    // Expedition runs are co-op; a checkpoint start opens a room of its own.
    expedition: defineRoom(TdmRoom).filterBy(["test", "testMapId", "testRoom", "checkpoint"]),
    party: defineRoom(TdmRoom).filterBy(["party"]),
    ranked: defineRoom(TdmRoom).filterBy(["test", "testMapId", "testRoom"]),
    queue: defineRoom(QueueRoom),
  },
  express: (app) => {
    if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
    app.get("/health", (_req, res) => {
      res.json({ ok: true, region: process.env.REGION || "local" });
    });
    // Portal builds call this API from other origins; Colyseus already answers CORS preflights for every route.
    app.use("/api", apiRouter({ database: gameDatabase }));
    if (process.env.NODE_ENV === "production") {
      app.use(express.static("dist/client"));
    }
  },
});
