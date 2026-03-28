import { Router } from "express";
import { loadHistory, loadRecentMessages } from "../history.js";
import { readdirSync, existsSync } from "fs";
import { chatPaths } from "../config.js";

/** /api/chats/:chatId/history — per-chat history. */
export function historyRouter(): Router {
  const router = Router();

  // List dates for a chat
  router.get("/:chatId/history", (req, res) => {
    const chatId = Number(req.params.chatId);
    const { historyDir } = chatPaths(chatId);
    if (!existsSync(historyDir)) { res.json({ dates: [], messages: [] }); return; }
    const dates = readdirSync(historyDir)
      .filter((f) => f.endsWith(".json") && f !== "summary.json")
      .map((f) => f.replace(".json", ""))
      .sort()
      .reverse();
    const limit = Number(req.query.limit) || 50;
    const recent = loadRecentMessages(historyDir, limit);
    res.json({ dates, messages: recent });
  });

  // Get messages for a specific date
  router.get("/:chatId/history/:date", (req, res) => {
    const chatId = Number(req.params.chatId);
    const { historyDir } = chatPaths(chatId);
    const limit = Number(req.query.limit) || 100;
    const messages = loadHistory(historyDir, req.params.date, limit);
    res.json({ messages });
  });

  return router;
}
