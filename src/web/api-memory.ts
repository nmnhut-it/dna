import { Router } from "express";
import { readMemory, appendMemory, removeMemoryEntry, listMemoryFiles } from "../memory.js";
import { readFileSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../config.js";

const MEMORY_DIR = join(DATA_DIR, "memory");

export function memoryRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const files = listMemoryFiles(MEMORY_DIR);
    const all = readMemory(MEMORY_DIR);
    res.json({ files, content: all });
  });

  router.get("/*category", (req, res) => {
    const category = req.params.category;
    const filePath = join(MEMORY_DIR, `${category}.md`);
    try {
      const content = readFileSync(filePath, "utf-8");
      res.json({ category, content });
    } catch {
      res.status(404).json({ error: "Category not found" });
    }
  });

  router.post("/*category", (req, res) => {
    const category = req.params.category;
    const { content } = req.body;
    if (typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }
    appendMemory(MEMORY_DIR, category, content);
    res.json({ ok: true });
  });

  router.delete("/*category", (req, res) => {
    const category = req.params.category;
    const { content } = req.body;
    if (typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }
    removeMemoryEntry(MEMORY_DIR, category, content);
    res.json({ ok: true });
  });

  return router;
}
