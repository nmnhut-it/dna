import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { assembleContext, executeActions } from "../engine.js";
import { streamFromClaude } from "../engine.js";
import { parseActions, stripActions } from "../actions.js";

const TEST_DATA = join(import.meta.dirname, "td-integration");
const MEMORY_DIR = join(TEST_DATA, "memory");
const HISTORY_DIR = join(TEST_DATA, "history");
const REMINDERS_PATH = join(TEST_DATA, "reminders.json");

describe("integration: Claude emits action markers", () => {
  beforeEach(() => {
    mkdirSync(join(MEMORY_DIR, "topics"), { recursive: true });
    mkdirSync(HISTORY_DIR, { recursive: true });
    writeFileSync(join(MEMORY_DIR, "facts.md"), "# Facts\n");
    writeFileSync(join(MEMORY_DIR, "preferences.md"), "# Preferences\n");
    writeFileSync(REMINDERS_PATH, "[]");
  });

  afterEach(() => {
    rmSync(TEST_DATA, { recursive: true, force: true });
  });

  it("emits REMEMBER action when asked to remember something", async () => {
    const systemPrompt = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      chatConfig: {
        personality: "default",
        allowedTools: [],
        allowActions: true,
        actionsRequireConfirmation: false,
        loadMemory: true,
      },
    });

    const rawResponse = await streamFromClaude(
      "Remember this: I like dark roast coffee",
      systemPrompt,
      () => {},
      [] // no tools — force pure text response
    );

    const actions = parseActions(rawResponse);
    const rememberActions = actions.filter((a) => a.type === "REMEMBER");

    expect(rememberActions.length).toBeGreaterThanOrEqual(1);
    expect(rememberActions[0].params.content).toContain("coffee");
  }, 60_000);

  it("emits REMIND action when asked to set a reminder", async () => {
    const systemPrompt = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      chatConfig: {
        personality: "default",
        allowedTools: [],
        allowActions: true,
        actionsRequireConfirmation: false,
        loadMemory: true,
      },
    });

    const rawResponse = await streamFromClaude(
      "Remind me to exercise tomorrow at 7am",
      systemPrompt,
      () => {},
      []
    );

    const actions = parseActions(rawResponse);
    const remindActions = actions.filter((a) => a.type === "REMIND");

    expect(remindActions.length).toBeGreaterThanOrEqual(1);
    expect(remindActions[0].params.text).toBeTruthy();
    expect(remindActions[0].params.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 60_000);

  it("executes REMEMBER action and writes memory to disk", async () => {
    const systemPrompt = assembleContext({
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: 20,
      chatConfig: {
        personality: "default",
        allowedTools: [],
        allowActions: true,
        actionsRequireConfirmation: false,
        loadMemory: true,
      },
    });

    const rawResponse = await streamFromClaude(
      "Please remember: my favorite color is blue",
      systemPrompt,
      () => {},
      []
    );

    const actions = parseActions(rawResponse);
    executeActions(actions, MEMORY_DIR, REMINDERS_PATH);

    // Check that something was written to memory
    const factsPath = join(MEMORY_DIR, "facts.md");
    const prefsPath = join(MEMORY_DIR, "preferences.md");
    const factsContent = existsSync(factsPath) ? readFileSync(factsPath, "utf-8") : "";
    const prefsContent = existsSync(prefsPath) ? readFileSync(prefsPath, "utf-8") : "";
    const allMemory = factsContent + prefsContent;

    expect(allMemory.toLowerCase()).toContain("blue");
  }, 60_000);
});
