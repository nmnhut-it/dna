import { Router } from "express";
import { loadReminders, addReminder } from "../reminders.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../config.js";

const REMINDERS_PATH = join(DATA_DIR, "reminders", "active.json");

export function remindersRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const reminders = loadReminders(REMINDERS_PATH);
    res.json({ reminders });
  });

  router.post("/", (req, res) => {
    const { text, datetime, recurring } = req.body;
    if (!text || !datetime) {
      res.status(400).json({ error: "text and datetime are required" });
      return;
    }
    const reminder = addReminder(REMINDERS_PATH, {
      text,
      datetime,
      recurring: recurring ?? null,
    });
    res.json({ reminder });
  });

  router.delete("/:id", (req, res) => {
    const reminders = loadReminders(REMINDERS_PATH);
    const filtered = reminders.filter((r) => r.id !== req.params.id);
    writeFileSync(REMINDERS_PATH, JSON.stringify(filtered, null, 2));
    res.json({ ok: true });
  });

  return router;
}
