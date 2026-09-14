import { defineRoom, defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { TdmRoom } from "./rooms/TdmRoom.ts";

export const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { tdm: defineRoom(TdmRoom) },
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
    if (process.env.NODE_ENV === "production") {
      app.use(express.static("dist/client"));
    }
  },
});
