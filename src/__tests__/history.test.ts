import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadHistory, loadRecentMessages, loadHistoryWithSummary,
  appendHistory, getTodayFileName,
} from "../history.js";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "td-history", "history");

describe("history basics", () => {
  beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => rmSync(join(import.meta.dirname, "td-history"), { recursive: true, force: true }));

  it("returns empty array when no history file exists", () => {
    expect(loadHistory(TEST_DIR, "2026-03-26", 20)).toEqual([]);
  });

  it("loads existing history (legacy single-day)", () => {
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
    expect(getTodayFileName()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("sliding window history", () => {
  beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => rmSync(join(import.meta.dirname, "td-history"), { recursive: true, force: true }));

  it("returns empty array when directory is empty", () => {
    expect(loadRecentMessages(TEST_DIR, 20)).toEqual([]);
  });

  it("loads messages from a single day file", () => {
    const messages = [
      { role: "user", content: "hello", timestamp: "2026-03-28T10:00:00" },
      { role: "assistant", content: "hi", timestamp: "2026-03-28T10:00:01" },
    ];
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify(messages));
    expect(loadRecentMessages(TEST_DIR, 20)).toHaveLength(2);
  });

  it("loads messages across multiple day files", () => {
    const day1 = [
      { role: "user", content: "day1-msg1", timestamp: "2026-03-27T23:00:00" },
      { role: "assistant", content: "day1-msg2", timestamp: "2026-03-27T23:00:01" },
      { role: "user", content: "day1-msg3", timestamp: "2026-03-27T23:30:00" },
    ];
    const day2 = [
      { role: "user", content: "day2-msg1", timestamp: "2026-03-28T00:05:00" },
      { role: "assistant", content: "day2-msg2", timestamp: "2026-03-28T00:05:01" },
      { role: "user", content: "day2-msg3", timestamp: "2026-03-28T10:00:00" },
    ];
    writeFileSync(join(TEST_DIR, "2026-03-27.json"), JSON.stringify(day1));
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify(day2));

    const result = loadRecentMessages(TEST_DIR, 5);
    expect(result).toHaveLength(5);
    expect(result[0].content).toBe("day1-msg2");
    expect(result[4].content).toBe("day2-msg3");
  });

  it("returns all messages when limit exceeds total", () => {
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify([
      { role: "user", content: "only one", timestamp: "2026-03-28T10:00:00" },
    ]));
    expect(loadRecentMessages(TEST_DIR, 100)).toHaveLength(1);
  });

  it("maintains chronological order", () => {
    writeFileSync(join(TEST_DIR, "2026-03-27.json"), JSON.stringify([
      { role: "user", content: "first", timestamp: "2026-03-27T23:59:00" },
    ]));
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify([
      { role: "user", content: "second", timestamp: "2026-03-28T00:01:00" },
    ]));
    const result = loadRecentMessages(TEST_DIR, 10);
    expect(result[0].content).toBe("first");
    expect(result[1].content).toBe("second");
  });

  it("ignores summary.json when reading messages", () => {
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify([
      { role: "user", content: "real msg", timestamp: "2026-03-28T10:00:00" },
    ]));
    writeFileSync(join(TEST_DIR, "summary.json"), JSON.stringify({
      text: "old summary", throughTimestamp: "2026-03-27T23:00:00", messageCount: 5,
    }));
    const result = loadRecentMessages(TEST_DIR, 100);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("real msg");
  });
});

describe("loadHistoryWithSummary", () => {
  beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => rmSync(join(import.meta.dirname, "td-history"), { recursive: true, force: true }));

  it("returns just raw messages when no summary exists", () => {
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify([
      { role: "user", content: "hello", timestamp: "2026-03-28T10:00:00" },
    ]));
    const result = loadHistoryWithSummary(TEST_DIR, 20);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("hello");
  });

  it("prepends summary as system message when it exists", () => {
    writeFileSync(join(TEST_DIR, "summary.json"), JSON.stringify({
      text: "User discussed their weekend plans.",
      throughTimestamp: "2026-03-27T23:00:00",
      messageCount: 10,
    }));
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify([
      { role: "user", content: "hello", timestamp: "2026-03-28T10:00:00" },
    ]));

    const result = loadHistoryWithSummary(TEST_DIR, 20);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("Earlier conversation summary");
    expect(result[0].content).toContain("weekend plans");
    expect(result[1].content).toBe("hello");
  });

  it("summary + raw messages are in correct order", () => {
    writeFileSync(join(TEST_DIR, "summary.json"), JSON.stringify({
      text: "Previous context.",
      throughTimestamp: "2026-03-26T20:00:00",
      messageCount: 5,
    }));
    writeFileSync(join(TEST_DIR, "2026-03-27.json"), JSON.stringify([
      { role: "user", content: "msg1", timestamp: "2026-03-27T10:00:00" },
    ]));
    writeFileSync(join(TEST_DIR, "2026-03-28.json"), JSON.stringify([
      { role: "user", content: "msg2", timestamp: "2026-03-28T10:00:00" },
    ]));

    const result = loadHistoryWithSummary(TEST_DIR, 20);
    expect(result[0].role).toBe("system");
    expect(result[1].content).toBe("msg1");
    expect(result[2].content).toBe("msg2");
  });
});
