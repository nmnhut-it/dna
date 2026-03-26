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
