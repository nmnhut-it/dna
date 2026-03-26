import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readMemory, appendMemory, removeMemoryEntry, listMemoryFiles } from "../memory.js";
import { mkdirSync, rmSync, writeFileSync } from "fs";
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
