import { Router } from "express";
import { loadHistory } from "../history.js";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../config.js";

const HISTORY_DIR = join(DATA_DIR, "history");

export function historyRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    if (!existsSync(HISTORY_DIR)) {
      res.json({ chats: [] });
      return;
    }
    const chatDirs = readdirSync(HISTORY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const chatDir = join(HISTORY_DIR, d.name);
        const dates = readdirSync(chatDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""))
          .sort()
          .reverse();
        return { chatId: d.name, dates, messageCount: dates.length };
      });
    res.json({ chats: chatDirs });
  });

  router.get("/:chatId/:date", (req, res) => {
    const chatDir = join(HISTORY_DIR, req.params.chatId);
    const limit = Number(req.query.limit) || 100;
    const messages = loadHistory(chatDir, req.params.date, limit);
    res.json({ chatId: req.params.chatId, date: req.params.date, messages });
  });

  return router;
}
