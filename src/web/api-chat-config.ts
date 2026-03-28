import { Router } from "express";
import { loadConfig, loadChatConfig, saveChatConfig, chatPaths, ensureChatDirs, CHATS_DIR } from "../config.js";
import { readdirSync, existsSync } from "fs";

/** /api/chats — list chats and manage per-chat config. */
export function chatConfigRouter(): Router {
  const router = Router();

  // List all chats
  router.get("/", (_req, res) => {
    if (!existsSync(CHATS_DIR)) { res.json({ chats: [] }); return; }
    const config = loadConfig();
    const dirs = readdirSync(CHATS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const chatId = Number(d.name);
        const chatCfg = loadChatConfig(chatId, config.ownerId);
        return { chatId, ...chatCfg };
      });
    res.json({ chats: dirs });
  });

  // Get chat config
  router.get("/:chatId/config", (req, res) => {
    const chatId = Number(req.params.chatId);
    const config = loadConfig();
    const chatCfg = loadChatConfig(chatId, config.ownerId);
    res.json(chatCfg);
  });

  // Update chat config
  router.put("/:chatId/config", (req, res) => {
    const chatId = Number(req.params.chatId);
    const config = loadConfig();
    const current = loadChatConfig(chatId, config.ownerId);
    const allowed = ["personality", "allowedTools", "allowActions", "actionsRequireConfirmation", "loadMemory"] as const;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        (current as unknown as Record<string, unknown>)[key] = req.body[key];
      }
    }
    ensureChatDirs(chatId);
    saveChatConfig(chatId, current);
    res.json(current);
  });

  return router;
}
