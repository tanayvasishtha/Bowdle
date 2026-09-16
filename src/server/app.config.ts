import { defineRoom, defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { apiRouter } from "./api/routes.ts";
import { gameDatabase } from "./db/GameDatabase.ts";
import { TdmRoom } from "./rooms/TdmRoom.ts";

export const server = defineServer({
  transport: new WebSocketTransport(),
  // Matchmaking only filters on options a joiner sends, so parties get their own room name:
  // a public join can never land in a party room.
  rooms: { tdm: defineRoom(TdmRoom).filterBy(["test", "testMapId", "testRoom"]), party: defineRoom(TdmRoom).filterBy(["party"]) },
  express: (app) => {
    if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
    // Portal builds call this API from other origins; Colyseus already answers CORS preflights for every route.
    app.use("/api", apiRouter({ database: gameDatabase }));
    if (process.env.NODE_ENV === "production") {
      app.use(express.static("dist/client"));
    }
  },
});
