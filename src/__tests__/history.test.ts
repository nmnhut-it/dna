import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadHistory, appendHistory, getTodayFileName } from "../history.js";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "td-history", "history");

describe("history", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(join(import.meta.dirname, "td-history"), { recursive: true, force: true });
  });

  it("returns empty array when no history file exists", () => {
    const result = loadHistory(TEST_DIR, "2026-03-26", 20);
    expect(result).toEqual([]);
  });

  it("loads existing history", () => {
    const messages = [
      { role: "user", content: "hello", timestamp: "2026-03-26T10:00:00" },
      { role: "assistant", content: "hi there", timestamp: "2026-03-26T10:00:01" },
    ];
    writeFileSync(join(TEST_DIR, "2026-03-26.json"), JSON.stringify(messages));
    const result = loadHistory(TEST_DIR, "2026-03-26", 20);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("hello");
  });

  it("respects the limit parameter (returns last N)", () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg ${i}`,
      timestamp: `2026-03-26T10:${String(i).padStart(2, "0")}:00`,
    }));
    writeFileSync(join(TEST_DIR, "2026-03-26.json"), JSON.stringify(messages));
    const result = loadHistory(TEST_DIR, "2026-03-26", 5);
    expect(result).toHaveLength(5);
    expect(result[0].content).toBe("msg 25");
  });

  it("appends a message to history", () => {
    appendHistory(TEST_DIR, "2026-03-26", { role: "user", content: "test", timestamp: "2026-03-26T10:00:00" });
    const result = loadHistory(TEST_DIR, "2026-03-26", 20);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("test");
  });

  it("generates today file name in YYYY-MM-DD format", () => {
    const name = getTodayFileName();
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
