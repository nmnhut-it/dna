import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  loadChatConfig, saveChatConfig, ensureChatDirs, chatPaths,
} from "../config.js";

const TEST_CHATS = join(import.meta.dirname, "..", "..", "data", "chats");

function cleanup(chatId: number) {
  const dir = join(TEST_CHATS, String(chatId));
  rmSync(dir, { recursive: true, force: true });
}

describe("chatPaths", () => {
  const chatId = 999001;
  afterEach(() => cleanup(chatId));

  it("returns correct folder structure under data/chats/<chatId>", () => {
    const p = chatPaths(chatId);
    expect(p.root).toContain(String(chatId));
    expect(p.config).toContain("config.json");
    expect(p.memoryDir).toContain("memory");
    expect(p.historyDir).toContain("history");
    expect(p.remindersPath).toContain("reminders.json");
    expect(p.tmpDir).toContain("tmp");
  });
});

describe("ensureChatDirs", () => {
  const chatId = 999002;
  afterEach(() => cleanup(chatId));

  it("creates memory, history, and tmp directories", () => {
    ensureChatDirs(chatId);
    const p = chatPaths(chatId);
    expect(existsSync(p.memoryDir)).toBe(true);
    expect(existsSync(join(p.memoryDir, "topics"))).toBe(true);
    expect(existsSync(p.historyDir)).toBe(true);
    expect(existsSync(p.tmpDir)).toBe(true);
  });
});

describe("loadChatConfig", () => {
  const ownerId = 111;
  const otherId = 222;
  afterEach(() => { cleanup(ownerId); cleanup(otherId); });

  it("creates default config with casual-vi for owner", () => {
    ensureChatDirs(ownerId);
    const cfg = loadChatConfig(ownerId, ownerId);
    expect(cfg.personality).toBe("casual-vi");
    expect(cfg.actionsRequireConfirmation).toBe(false);
    expect(cfg.allowActions).toBe(true);
  });

  it("creates default config with default personality for non-owner", () => {
    ensureChatDirs(otherId);
    const cfg = loadChatConfig(otherId, ownerId);
    expect(cfg.personality).toBe("default");
    expect(cfg.actionsRequireConfirmation).toBe(true);
  });

  it("persists config to disk and reloads it", () => {
    ensureChatDirs(ownerId);
    loadChatConfig(ownerId, ownerId);
    const p = chatPaths(ownerId);
    expect(existsSync(p.config)).toBe(true);
    const reloaded = loadChatConfig(ownerId, ownerId);
    expect(reloaded.personality).toBe("casual-vi");
  });

  it("includes default allowedTools", () => {
    ensureChatDirs(otherId);
    const cfg = loadChatConfig(otherId, ownerId);
    expect(cfg.allowedTools).toContain("WebSearch");
    expect(cfg.allowedTools).toContain("WebFetch");
    expect(cfg.allowedTools).toContain("Read");
  });

  it("sets loadMemory true for private chats", () => {
    ensureChatDirs(ownerId);
    const cfg = loadChatConfig(ownerId, ownerId);
    expect(cfg.loadMemory).toBe(true);
  });

  it("sets loadMemory false for group chats (negative chatId)", () => {
    const groupId = -100123;
    ensureChatDirs(groupId);
    const cfg = loadChatConfig(groupId, ownerId);
    expect(cfg.loadMemory).toBe(false);
    cleanup(groupId);
  });
});

describe("saveChatConfig", () => {
  const chatId = 999003;
  afterEach(() => cleanup(chatId));

  it("saves and overwrites config", () => {
    ensureChatDirs(chatId);
    const original = loadChatConfig(chatId, 0);
    expect(original.personality).toBe("default");

    saveChatConfig(chatId, { ...original, personality: "casual-vi" });
    const updated = loadChatConfig(chatId, 0);
    expect(updated.personality).toBe("casual-vi");
  });

  it("can restrict allowedTools", () => {
    ensureChatDirs(chatId);
    const cfg = loadChatConfig(chatId, 0);
    saveChatConfig(chatId, { ...cfg, allowedTools: [] });
    const updated = loadChatConfig(chatId, 0);
    expect(updated.allowedTools).toEqual([]);
  });
});
