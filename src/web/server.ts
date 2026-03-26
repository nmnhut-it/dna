import express from "express";
import { join } from "path";
import { configRouter } from "./api-config.js";
import { memoryRouter } from "./api-memory.js";
import { historyRouter } from "./api-history.js";
import { remindersRouter } from "./api-reminders.js";
import { eventsRouter } from "./api-events.js";

export function createWebServer(port: number): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(import.meta.dirname, "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api/config", configRouter());
  app.use("/api/memory", memoryRouter());
  app.use("/api/history", historyRouter());
  app.use("/api/reminders", remindersRouter());
  app.use("/api/events", eventsRouter());

  app.listen(port, () => {
    console.log(`DNA dashboard at http://localhost:${port}`);
  });

  return app;
}
