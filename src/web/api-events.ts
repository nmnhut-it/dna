import { Router } from "express";
import { eventBus, type ChatEvent } from "./event-bus.js";

// GET /api/events — SSE stream of live chat events from the bot.
// Emits: { type: "connected" } on connect, then ChatEvent objects as they arrive.
export function eventsRouter(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");

    const handler = (event: ChatEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    eventBus.on("chat", handler);
    req.on("close", () => {
      eventBus.off("chat", handler);
    });
  });

  return router;
}
