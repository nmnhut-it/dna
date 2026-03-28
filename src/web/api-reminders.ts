import { Router } from "express";
import { loadReminders, addReminder } from "../reminders.js";
import { writeFileSync, existsSync } from "fs";
import { chatPaths, ensureChatDirs } from "../config.js";

/** /api/chats/:chatId/reminders — per-chat reminders. */
export function remindersRouter(): Router {
  const router = Router();

  router.get("/:chatId/reminders", (req, res) => {
    const chatId = Number(req.params.chatId);
    ensureChatDirs(chatId);
    const { remindersPath } = chatPaths(chatId);
    if (!existsSync(remindersPath)) { res.json({ reminders: [] }); return; }
    res.json({ reminders: loadReminders(remindersPath) });
  });

  router.post("/:chatId/reminders", (req, res) => {
    const chatId = Number(req.params.chatId);
    const { text, datetime, recurring } = req.body;
    if (!text || !datetime) { res.status(400).json({ error: "text and datetime required" }); return; }
    ensureChatDirs(chatId);
    const { remindersPath } = chatPaths(chatId);
    const reminder = addReminder(remindersPath, { text, datetime, recurring: recurring ?? null });
    res.json({ reminder });
  });

  router.delete("/:chatId/reminders/:id", (req, res) => {
    const chatId = Number(req.params.chatId);
    const { remindersPath } = chatPaths(chatId);
    if (!existsSync(remindersPath)) { res.json({ ok: true }); return; }
    const reminders = loadReminders(remindersPath);
    const filtered = reminders.filter((r) => r.id !== req.params.id);
    writeFileSync(remindersPath, JSON.stringify(filtered, null, 2));
    res.json({ ok: true });
  });

  return router;
}
