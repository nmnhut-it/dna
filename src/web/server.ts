import express from "express";
import { join } from "path";
import { configRouter } from "./api-config.js";
import { chatConfigRouter } from "./api-chat-config.js";
import { memoryRouter } from "./api-memory.js";
import { historyRouter } from "./api-history.js";
import { remindersRouter } from "./api-reminders.js";
import { eventsRouter } from "./api-events.js";
import { widgetRouter } from "./api-widget.js";
import { logger } from "../logger.js";

export function createWebServer(port: number): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(import.meta.dirname, "public")));
  app.use("/widget", express.static(join(import.meta.dirname, "widget")));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api/config", configRouter());
  app.use("/api/chats", chatConfigRouter());
  app.use("/api/chats", memoryRouter());
  app.use("/api/chats", historyRouter());
  app.use("/api/chats", remindersRouter());
  app.use("/api/events", eventsRouter());
  app.use("/api/widget", widgetRouter());

  app.listen(port, () => {
    logger.info(`Dashboard at http://localhost:${port}`);
  });

  return app;
}
