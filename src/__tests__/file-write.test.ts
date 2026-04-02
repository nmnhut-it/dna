import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { streamFromClaude } from "../engine.js";
import { assembleContext } from "../engine.js";

const TEST_DATA = join(import.meta.dirname, "td-filewrite");
const MEMORY_DIR = join(TEST_DATA, "memory");
const HISTORY_DIR = join(TEST_DATA, "history");
const REMINDERS_PATH = join(TEST_DATA, "reminders.json");

describe("integration: Claude can write files in chat dir", () => {
  beforeEach(() => {
    mkdirSync(join(MEMORY_DIR, "topics"), { recursive: true });
    mkdirSync(HISTORY_DIR, { recursive: true });
    writeFileSync(join(MEMORY_DIR, "facts.md"), "# Facts\n");
    writeFileSync(REMINDERS_PATH, "[]");
  });

  afterEach(() => {
    rmSync(TEST_DATA, { recursive: true, force: true });
  });

  it("can create a file in the chat directory", async () => {
    const systemPrompt = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      chatConfig: {
        personality: "default",
        allowedTools: ["Read", "Write"],
        allowActions: true,
        actionsRequireConfirmation: false,
        loadMemory: true, listenAll: false,
      },
      chatDir: TEST_DATA,
    });

    await streamFromClaude(
      `Create a file called "test-output.txt" in the directory ${TEST_DATA} with the content "hello from claude". Just create the file, nothing else.`,
      systemPrompt,
      () => {},
      ["Read", "Write"],
      TEST_DATA
    );

    const outputPath = join(TEST_DATA, "test-output.txt");
    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, "utf-8");
    expect(content).toContain("hello from claude");
  }, 60_000);
});
