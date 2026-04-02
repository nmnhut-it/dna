import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assembleContext, executeActions } from "../engine.js";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const TEST_DATA = join(import.meta.dirname, "td-engine");
const MEMORY_DIR = join(TEST_DATA, "memory");
const HISTORY_DIR = join(TEST_DATA, "history");
const REMINDERS_PATH = join(TEST_DATA, "reminders", "active.json");

describe("assembleContext", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DATA, "memory", "topics"), { recursive: true });
    mkdirSync(join(TEST_DATA, "history"), { recursive: true });
    mkdirSync(join(TEST_DATA, "reminders"), { recursive: true });
    writeFileSync(join(MEMORY_DIR, "facts.md"), "# Facts\n\n- Likes coffee\n");
    writeFileSync(join(MEMORY_DIR, "preferences.md"), "# Preferences\n");
    writeFileSync(REMINDERS_PATH, "[]");
  });

  afterEach(() => {
    rmSync(TEST_DATA, { recursive: true, force: true });
  });

  it("assembles system prompt with memory and empty history", () => {
    const result = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
    });
    expect(result).toContain("DNA");
    expect(result).toContain("Likes coffee");
  });

  it("uses default personality when no chatConfig", () => {
    const result = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
    });
    expect(result).toContain("friendly, sharp");
  });

  it("uses custom personality from chatConfig", () => {
    const result = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      chatConfig: {
        personality: "casual-vi",
        allowedTools: [],
        allowActions: true,
        actionsRequireConfirmation: false,
        loadMemory: true, listenAll: false,
      },
    });
    expect(result).toContain("close friend");
  });

  it("skips memory when loadMemory is false", () => {
    const result = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      chatConfig: {
        personality: "default",
        allowedTools: [],
        allowActions: true,
        actionsRequireConfirmation: false,
        loadMemory: false, listenAll: false,
      },
    });
    expect(result).not.toContain("Likes coffee");
  });

  it("loads memory for groups when loadMemory is true", () => {
    const result = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      isGroup: true,
      chatConfig: {
        personality: "default",
        allowedTools: [],
        allowActions: true,
        actionsRequireConfirmation: false,
        loadMemory: true, listenAll: false,
      },
    });
    expect(result).toContain("Likes coffee");
  });

  it("skips memory for groups by default (no chatConfig)", () => {
    const result = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      isGroup: true,
    });
    expect(result).not.toContain("Likes coffee");
  });

  it("loads relevant topic memory based on history keywords", () => {
    writeFileSync(join(MEMORY_DIR, "topics", "cooking.md"), "# Cooking\n\n- Makes great pho\n");
    writeFileSync(join(MEMORY_DIR, "topics", "travel.md"), "# Travel\n\n- Went to Japan\n");
    // Add history mentioning cooking
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(
      join(HISTORY_DIR, `${today}.json`),
      JSON.stringify([{ role: "user", content: "tell me about cooking", timestamp: new Date().toISOString() }])
    );

    const result = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
    });
    expect(result).toContain("Makes great pho");
    expect(result).not.toContain("Went to Japan");
  });
});

describe("executeActions", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DATA, "memory", "topics"), { recursive: true });
    mkdirSync(join(TEST_DATA, "reminders"), { recursive: true });
    writeFileSync(join(MEMORY_DIR, "facts.md"), "# Facts\n\n- Old fact\n");
    writeFileSync(REMINDERS_PATH, "[]");
  });

  afterEach(() => {
    rmSync(TEST_DATA, { recursive: true, force: true });
  });

  it("executes REMEMBER action", () => {
    executeActions(
      [{ type: "REMEMBER", params: { category: "facts", content: "New fact" } }],
      MEMORY_DIR,
      REMINDERS_PATH
    );
    const content = readFileSync(join(MEMORY_DIR, "facts.md"), "utf-8");
    expect(content).toContain("New fact");
  });

  it("executes REMIND action", () => {
    executeActions(
      [{ type: "REMIND", params: { text: "test reminder", datetime: "2026-04-01T09:00:00", recurring: "null" } }],
      MEMORY_DIR,
      REMINDERS_PATH
    );
    const reminders = JSON.parse(readFileSync(REMINDERS_PATH, "utf-8"));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].text).toBe("test reminder");
  });

  it("executes FORGET action", () => {
    executeActions(
      [{ type: "FORGET", params: { category: "facts", content: "Old fact" } }],
      MEMORY_DIR,
      REMINDERS_PATH
    );
    const content = readFileSync(join(MEMORY_DIR, "facts.md"), "utf-8");
    expect(content).not.toContain("Old fact");
  });
});
