import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readMemory, readRelevantMemory, appendMemory, removeMemoryEntry,
  listMemoryFiles, countBulletPoints, estimateTokens,
} from "../memory.js";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "td-memory", "memory");

describe("memory", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, "topics"), { recursive: true });
    writeFileSync(join(TEST_DIR, "facts.md"), "# Facts\n\n- Likes coffee\n- Works at Acme\n");
    writeFileSync(join(TEST_DIR, "preferences.md"), "# Preferences\n\n- Dark mode\n");
  });

  afterEach(() => {
    rmSync(join(import.meta.dirname, "td-memory"), { recursive: true, force: true });
  });

  it("reads all memory files into a single string", () => {
    const result = readMemory(TEST_DIR);
    expect(result).toContain("Likes coffee");
    expect(result).toContain("Dark mode");
  });

  it("appends to a memory file", () => {
    appendMemory(TEST_DIR, "facts", "Has a cat named Milo");
    const result = readMemory(TEST_DIR);
    expect(result).toContain("Has a cat named Milo");
  });

  it("removes an entry from a memory file", () => {
    removeMemoryEntry(TEST_DIR, "facts", "Likes coffee");
    const result = readMemory(TEST_DIR);
    expect(result).not.toContain("Likes coffee");
    expect(result).toContain("Works at Acme");
  });

  it("lists available memory files", () => {
    const files = listMemoryFiles(TEST_DIR);
    expect(files).toContain("facts");
    expect(files).toContain("preferences");
  });

  it("creates topic memory file if it does not exist", () => {
    appendMemory(TEST_DIR, "topics/work", "Sprint ends Friday");
    const result = readMemory(TEST_DIR);
    expect(result).toContain("Sprint ends Friday");
  });
});

describe("readRelevantMemory", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, "topics"), { recursive: true });
    writeFileSync(join(TEST_DIR, "facts.md"), "# Facts\n\n- Likes coffee\n");
    writeFileSync(join(TEST_DIR, "preferences.md"), "# Preferences\n\n- Dark mode\n");
    writeFileSync(join(TEST_DIR, "topics", "cooking.md"), "# Cooking\n\n- Makes great pho\n");
    writeFileSync(join(TEST_DIR, "topics", "travel.md"), "# Travel\n\n- Went to Japan\n");
    writeFileSync(join(TEST_DIR, "topics", "work.md"), "# Work\n\n- Sprint ends Friday\n");
  });

  afterEach(() => {
    rmSync(join(import.meta.dirname, "td-memory"), { recursive: true, force: true });
  });

  it("always includes root-level files", () => {
    const result = readRelevantMemory(TEST_DIR, ["random unrelated message"]);
    expect(result).toContain("Likes coffee");
    expect(result).toContain("Dark mode");
  });

  it("includes matching topic files", () => {
    const result = readRelevantMemory(TEST_DIR, ["Let's talk about cooking today"]);
    expect(result).toContain("Makes great pho");
  });

  it("excludes non-matching topic files", () => {
    const result = readRelevantMemory(TEST_DIR, ["Let's talk about cooking today"]);
    expect(result).not.toContain("Went to Japan");
    expect(result).not.toContain("Sprint ends Friday");
  });

  it("matches case-insensitively", () => {
    const result = readRelevantMemory(TEST_DIR, ["COOKING is fun"]);
    expect(result).toContain("Makes great pho");
  });

  it("matches multiple topics from multiple messages", () => {
    const result = readRelevantMemory(TEST_DIR, [
      "cooking is great",
      "how about travel plans?",
    ]);
    expect(result).toContain("Makes great pho");
    expect(result).toContain("Went to Japan");
    expect(result).not.toContain("Sprint ends Friday");
  });

  it("returns empty string for non-existent directory", () => {
    const result = readRelevantMemory("/nonexistent/path", ["hello"]);
    expect(result).toBe("");
  });

  it("returns only root files when no topics match", () => {
    const result = readRelevantMemory(TEST_DIR, ["nothing relevant here"]);
    expect(result).toContain("Likes coffee");
    expect(result).toContain("Dark mode");
    expect(result).not.toContain("Makes great pho");
    expect(result).not.toContain("Went to Japan");
    expect(result).not.toContain("Sprint ends Friday");
  });

  it("ignores short words (<=2 chars) for matching", () => {
    // "go" is only 2 chars, shouldn't match
    writeFileSync(join(TEST_DIR, "topics", "go.md"), "# Go\n\n- Learning Go language\n");
    const result = readRelevantMemory(TEST_DIR, ["I want to go somewhere"]);
    expect(result).not.toContain("Learning Go language");
  });
});

describe("countBulletPoints", () => {
  it("counts bullet lines", () => {
    expect(countBulletPoints("# Title\n\n- one\n- two\n- three\n")).toBe(3);
  });

  it("returns 0 for no bullets", () => {
    expect(countBulletPoints("# Title\n\nNo bullets here")).toBe(0);
  });

  it("handles indented bullets", () => {
    expect(countBulletPoints("  - indented\n- normal")).toBe(2);
  });
});

describe("estimateTokens", () => {
  it("estimates tokens from word count", () => {
    const text = "one two three four five six";
    const tokens = estimateTokens(text);
    expect(tokens).toBe(8); // ceil(6 / 0.75)
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});
