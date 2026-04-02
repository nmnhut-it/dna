import { Router } from "express";
import { assembleContext, executeActions, streamFromClaude } from "../engine.js";
import { parseActions, stripActions } from "../actions.js";
import { chatPaths, ensureChatDirs, loadChatConfig } from "../config.js";
import { appendHistory } from "../history.js";
import { logger } from "../logger.js";

const WIDGET_CHAT_ID = 999999;

export function widgetRouter(): Router {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    try {
      ensureChatDirs(WIDGET_CHAT_ID);
      const paths = chatPaths(WIDGET_CHAT_ID);
      const chatConfig = loadChatConfig(WIDGET_CHAT_ID, 0);

      const systemPrompt = assembleContext({
        memoryDir: paths.memoryDir,
        historyDir: paths.historyDir,
        remindersPath: paths.remindersPath,
        historyLimit: 20,
        chatConfig,
        chatDir: paths.root,
        chat: { chatId: WIDGET_CHAT_ID, chatTitle: "Widget", senderName: "User", isGroup: false },
      });

      const today = new Date().toISOString().slice(0, 10);
      appendHistory(paths.historyDir, today, { role: "user", content: message, timestamp: new Date().toISOString() });

      const rawResponse = await streamFromClaude(
        message, systemPrompt, () => {}, chatConfig.allowedTools, paths.root
      );

      const actions = parseActions(rawResponse);
      const reply = stripActions(rawResponse).trim();

      executeActions(actions, paths.memoryDir, paths.remindersPath);
      appendHistory(paths.historyDir, today, { role: "assistant", content: reply, timestamp: new Date().toISOString() });

      res.json({ reply });
    } catch (err) {
      logger.error(`Widget chat error: ${err}`);
      res.status(500).json({ error: "Failed to get response" });
    }
  });

  return router;
}
