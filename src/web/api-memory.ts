import { Router } from "express";
import { readMemory, appendMemory, removeMemoryEntry, listMemoryFiles } from "../memory.js";
import { readFileSync } from "fs";
import { join } from "path";
import { chatPaths, ensureChatDirs } from "../config.js";

/** /api/chats/:chatId/memory — per-chat memory CRUD. */
export function memoryRouter(): Router {
  const router = Router();

  router.get("/:chatId/memory", (req, res) => {
    const chatId = Number(req.params.chatId);
    ensureChatDirs(chatId);
    const { memoryDir } = chatPaths(chatId);
    const files = listMemoryFiles(memoryDir);
    const all = readMemory(memoryDir);
    res.json({ files, content: all });
  });

  router.get("/:chatId/memory/*category", (req, res) => {
    const chatId = Number(req.params.chatId);
    const category = String(req.params.category);
    const { memoryDir } = chatPaths(chatId);
    try {
      const content = readFileSync(join(memoryDir, `${category}.md`), "utf-8");
      res.json({ category, content });
    } catch {
      res.status(404).json({ error: "Category not found" });
    }
  });

  router.post("/:chatId/memory/*category", (req, res) => {
    const chatId = Number(req.params.chatId);
    const category = String(req.params.category);
    const { content } = req.body;
    if (typeof content !== "string") { res.status(400).json({ error: "content required" }); return; }
    const { memoryDir } = chatPaths(chatId);
    appendMemory(memoryDir, category, content);
    res.json({ ok: true });
  });

  router.delete("/:chatId/memory/*category", (req, res) => {
    const chatId = Number(req.params.chatId);
    const category = String(req.params.category);
    const { content } = req.body;
    if (typeof content !== "string") { res.status(400).json({ error: "content required" }); return; }
    const { memoryDir } = chatPaths(chatId);
    removeMemoryEntry(memoryDir, category, content);
    res.json({ ok: true });
  });

  return router;
}
