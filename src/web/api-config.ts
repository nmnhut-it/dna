import { Router } from "express";
import { loadConfig, saveConfig } from "../config.js";

export function configRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const config = loadConfig();
    const safe = { ...config, telegramBotToken: "***" };
    res.json(safe);
  });

  router.put("/", (req, res) => {
    const config = loadConfig();
    const allowed = ["historyLimit", "webPort"] as const;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        (config as unknown as Record<string, unknown>)[key] = req.body[key];
      }
    }
    saveConfig(config);
    res.json({ ok: true });
  });

  router.post("/allowedIds", (req, res) => {
    const { id } = req.body;
    if (typeof id !== "number") {
      res.status(400).json({ error: "id must be a number" });
      return;
    }
    const config = loadConfig();
    if (!config.allowedIds.includes(id)) {
      config.allowedIds.push(id);
      saveConfig(config);
    }
    res.json({ allowedIds: config.allowedIds });
  });

  router.delete("/allowedIds/:id", (req, res) => {
    const id = Number(req.params.id);
    const config = loadConfig();
    config.allowedIds = config.allowedIds.filter((i) => i !== id);
    saveConfig(config);
    res.json({ allowedIds: config.allowedIds });
  });

  return router;
}
