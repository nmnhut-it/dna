# DNA (Definitely Not Assistant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Telegram companion powered by Claude CLI (`claude -p`) with memory, reminders, and Telegram Desktop control.

**Architecture:** Single Node.js/TypeScript process. grammY for Telegram Bot API, `claude -p` spawned per message with context assembled from local markdown/JSON files, node-cron for reminder scheduling, MCP client for Electron-based Telegram Desktop control.

**Tech Stack:** TypeScript, Node.js, grammY, node-cron, vitest, @anthropic-ai/sdk (MCP client)

---

## File Structure

```
src/
├── index.ts              # entry point — starts bot, scheduler
├── config.ts             # loads data/config.json, exports typed config
├── bot.ts                # grammY bot setup, auth guard, message routing
├── engine.ts             # Claude engine — context assembly, spawn claude -p, parse response
├── actions.ts            # parse action markers, execute side effects
├── memory.ts             # read/write memory markdown files
├── history.ts            # read/write daily conversation JSON logs
├── reminders.ts          # read/write/query reminders
├── scheduler.ts          # node-cron job for checking due reminders
├── mcp-client.ts         # Electron MCP client for Telegram Desktop
└── system-prompt.ts      # builds the system prompt string
data/
├── config.json
├── memory/
│   ├── facts.md
│   ├── preferences.md
│   └── topics/
├── history/
└── reminders/
    └── active.json
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `src/config.ts`
- Create: `data/config.json`
- Create: `data/memory/facts.md`
- Create: `data/memory/preferences.md`
- Create: `data/reminders/active.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize project**

```bash
cd /d/dna
npm init -y
npm install typescript grammy node-cron
npm install -D vitest @types/node @types/node-cron tsx
npx tsc --init
```

- [ ] **Step 2: Configure tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
data/config.json
```

- [ ] **Step 4: Create data/config.json with placeholder structure**

```json
{
  "telegramBotToken": "YOUR_BOT_TOKEN",
  "allowedUserId": 0,
  "historyLimit": 20,
  "mcpServerUrl": "ws://127.0.0.1:18789"
}
```

- [ ] **Step 5: Create seed data files**

`data/memory/facts.md`:
```markdown
# Facts

```

`data/memory/preferences.md`:
```markdown
# Preferences

```

`data/reminders/active.json`:
```json
[]
```

- [ ] **Step 6: Create src/config.ts**

```typescript
import { readFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CONFIG_PATH = join(DATA_DIR, "config.json");

interface Config {
  telegramBotToken: string;
  allowedUserId: number;
  historyLimit: number;
  mcpServerUrl: string;
}

export function loadConfig(): Config {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Config;
}

export { DATA_DIR };
```

- [ ] **Step 7: Create src/index.ts stub**

```typescript
import { loadConfig } from "./config.js";

const config = loadConfig();
console.log("DNA starting...", { allowedUserId: config.allowedUserId });
```

- [ ] **Step 8: Add scripts to package.json**

Add to `package.json`:
```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  }
}
```

- [ ] **Step 9: Verify it runs**

```bash
npm run dev
```

Expected: `DNA starting... { allowedUserId: 0 }`

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "feat: project scaffold with config and data structure"
```

---

### Task 2: Memory Module

**Files:**
- Create: `src/memory.ts`
- Create: `src/__tests__/memory.test.ts`

- [ ] **Step 1: Write failing tests for memory module**

```typescript
// src/__tests__/memory.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readMemory, appendMemory, removeMemoryEntry, listMemoryFiles } from "../memory.js";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "test-data", "memory");

describe("memory", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, "topics"), { recursive: true });
    writeFileSync(join(TEST_DIR, "facts.md"), "# Facts\n\n- Likes coffee\n- Works at Acme\n");
    writeFileSync(join(TEST_DIR, "preferences.md"), "# Preferences\n\n- Dark mode\n");
  });

  afterEach(() => {
    rmSync(join(import.meta.dirname, "test-data"), { recursive: true, force: true });
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/memory.test.ts
```

Expected: FAIL — `readMemory` not defined.

- [ ] **Step 3: Implement memory module**

```typescript
// src/memory.ts
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, relative, basename, dirname } from "path";

export function readMemory(memoryDir: string): string {
  const sections: string[] = [];
  collectMarkdownFiles(memoryDir, memoryDir, sections);
  return sections.join("\n\n---\n\n");
}

function collectMarkdownFiles(dir: string, baseDir: string, sections: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, baseDir, sections);
    } else if (entry.name.endsWith(".md")) {
      const label = relative(baseDir, fullPath).replace(/\.md$/, "");
      const content = readFileSync(fullPath, "utf-8").trim();
      if (content.split("\n").length > 1) {
        sections.push(`[${label}]\n${content}`);
      }
    }
  }
}

export function appendMemory(memoryDir: string, category: string, content: string): void {
  const filePath = join(memoryDir, `${category}.md`);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(filePath)) {
    const title = basename(category).charAt(0).toUpperCase() + basename(category).slice(1);
    writeFileSync(filePath, `# ${title}\n\n- ${content}\n`);
    return;
  }
  const existing = readFileSync(filePath, "utf-8");
  writeFileSync(filePath, existing.trimEnd() + `\n- ${content}\n`);
}

export function removeMemoryEntry(memoryDir: string, category: string, content: string): void {
  const filePath = join(memoryDir, `${category}.md`);
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const filtered = lines.filter((line) => !line.includes(content));
  writeFileSync(filePath, filtered.join("\n"));
}

export function listMemoryFiles(memoryDir: string): string[] {
  const results: string[] = [];
  collectFileNames(memoryDir, memoryDir, results);
  return results;
}

function collectFileNames(dir: string, baseDir: string, results: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFileNames(fullPath, baseDir, results);
    } else if (entry.name.endsWith(".md")) {
      results.push(relative(baseDir, fullPath).replace(/\.md$/, ""));
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/memory.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memory.ts src/__tests__/memory.test.ts
git commit -m "feat: memory module — read, append, remove, list markdown memory files"
```

---

### Task 3: History Module

**Files:**
- Create: `src/history.ts`
- Create: `src/__tests__/history.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/history.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadHistory, appendHistory, getTodayFileName } from "../history.js";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "test-data", "history");

describe("history", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(join(import.meta.dirname, "test-data"), { recursive: true, force: true });
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/history.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement history module**

```typescript
// src/history.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface HistoryMessage {
  role: string;
  content: string;
  timestamp: string;
}

export function loadHistory(historyDir: string, date: string, limit: number): HistoryMessage[] {
  const filePath = join(historyDir, `${date}.json`);
  if (!existsSync(filePath)) return [];
  const messages: HistoryMessage[] = JSON.parse(readFileSync(filePath, "utf-8"));
  return messages.slice(-limit);
}

export function appendHistory(historyDir: string, date: string, message: HistoryMessage): void {
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }
  const filePath = join(historyDir, `${date}.json`);
  const messages: HistoryMessage[] = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf-8"))
    : [];
  messages.push(message);
  writeFileSync(filePath, JSON.stringify(messages, null, 2));
}

export function getTodayFileName(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/history.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/history.ts src/__tests__/history.test.ts
git commit -m "feat: history module — daily conversation log read/write"
```

---

### Task 4: Reminders Module

**Files:**
- Create: `src/reminders.ts`
- Create: `src/__tests__/reminders.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/reminders.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadReminders, addReminder, markNotified, getDueReminders, scheduleNextOccurrence } from "../reminders.js";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "test-data", "reminders");
const ACTIVE_PATH = join(TEST_DIR, "active.json");

describe("reminders", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(ACTIVE_PATH, "[]");
  });

  afterEach(() => {
    rmSync(join(import.meta.dirname, "test-data"), { recursive: true, force: true });
  });

  it("loads empty reminders", () => {
    expect(loadReminders(ACTIVE_PATH)).toEqual([]);
  });

  it("adds a reminder", () => {
    addReminder(ACTIVE_PATH, { text: "standup", datetime: "2026-03-27T09:00:00", recurring: null });
    const reminders = loadReminders(ACTIVE_PATH);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].text).toBe("standup");
    expect(reminders[0].notified).toBe(false);
    expect(reminders[0].id).toBeDefined();
  });

  it("finds due reminders", () => {
    addReminder(ACTIVE_PATH, { text: "past", datetime: "2020-01-01T00:00:00", recurring: null });
    addReminder(ACTIVE_PATH, { text: "future", datetime: "2099-01-01T00:00:00", recurring: null });
    const due = getDueReminders(ACTIVE_PATH);
    expect(due).toHaveLength(1);
    expect(due[0].text).toBe("past");
  });

  it("marks a reminder as notified", () => {
    addReminder(ACTIVE_PATH, { text: "test", datetime: "2020-01-01T00:00:00", recurring: null });
    const reminders = loadReminders(ACTIVE_PATH);
    markNotified(ACTIVE_PATH, reminders[0].id);
    const updated = loadReminders(ACTIVE_PATH);
    expect(updated[0].notified).toBe(true);
  });

  it("schedules next occurrence for daily recurring", () => {
    addReminder(ACTIVE_PATH, { text: "standup", datetime: "2026-03-26T09:00:00", recurring: "daily" });
    const reminders = loadReminders(ACTIVE_PATH);
    scheduleNextOccurrence(ACTIVE_PATH, reminders[0].id);
    const updated = loadReminders(ACTIVE_PATH);
    expect(updated).toHaveLength(2);
    expect(updated[1].datetime).toBe("2026-03-27T09:00:00");
    expect(updated[1].notified).toBe(false);
  });

  it("schedules next occurrence for weekly recurring", () => {
    addReminder(ACTIVE_PATH, { text: "review", datetime: "2026-03-26T09:00:00", recurring: "weekly" });
    const reminders = loadReminders(ACTIVE_PATH);
    scheduleNextOccurrence(ACTIVE_PATH, reminders[0].id);
    const updated = loadReminders(ACTIVE_PATH);
    expect(updated[1].datetime).toBe("2026-04-02T09:00:00");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/reminders.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement reminders module**

```typescript
// src/reminders.ts
import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

export interface Reminder {
  id: string;
  text: string;
  datetime: string;
  recurring: string | null;
  notified: boolean;
}

interface NewReminder {
  text: string;
  datetime: string;
  recurring: string | null;
}

export function loadReminders(filePath: string): Reminder[] {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function saveReminders(filePath: string, reminders: Reminder[]): void {
  writeFileSync(filePath, JSON.stringify(reminders, null, 2));
}

export function addReminder(filePath: string, input: NewReminder): Reminder {
  const reminders = loadReminders(filePath);
  const reminder: Reminder = {
    id: randomUUID().slice(0, 8),
    text: input.text,
    datetime: input.datetime,
    recurring: input.recurring,
    notified: false,
  };
  reminders.push(reminder);
  saveReminders(filePath, reminders);
  return reminder;
}

export function getDueReminders(filePath: string): Reminder[] {
  const now = new Date();
  return loadReminders(filePath).filter(
    (r) => !r.notified && new Date(r.datetime) <= now
  );
}

export function markNotified(filePath: string, id: string): void {
  const reminders = loadReminders(filePath);
  const target = reminders.find((r) => r.id === id);
  if (target) {
    target.notified = true;
    saveReminders(filePath, reminders);
  }
}

const RECURRENCE_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export function scheduleNextOccurrence(filePath: string, id: string): void {
  const reminders = loadReminders(filePath);
  const source = reminders.find((r) => r.id === id);
  if (!source || !source.recurring) return;

  const days = RECURRENCE_DAYS[source.recurring];
  if (!days) return;

  const nextDate = new Date(source.datetime);
  nextDate.setDate(nextDate.getDate() + days);

  const next: Reminder = {
    id: randomUUID().slice(0, 8),
    text: source.text,
    datetime: nextDate.toISOString().slice(0, 19),
    recurring: source.recurring,
    notified: false,
  };
  reminders.push(next);
  saveReminders(filePath, reminders);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/reminders.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reminders.ts src/__tests__/reminders.test.ts
git commit -m "feat: reminders module — add, query due, mark notified, recurring"
```

---

### Task 5: Action Parser

**Files:**
- Create: `src/actions.ts`
- Create: `src/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/actions.test.ts
import { describe, it, expect } from "vitest";
import { parseActions, stripActions } from "../actions.js";

describe("parseActions", () => {
  it("parses REMIND action", () => {
    const text = 'Sure! [ACTION:REMIND text="standup" datetime="2026-03-27T09:00:00" recurring="daily"] Done.';
    const actions = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: "REMIND",
      params: { text: "standup", datetime: "2026-03-27T09:00:00", recurring: "daily" },
    });
  });

  it("parses REMEMBER action", () => {
    const text = '[ACTION:REMEMBER category="preferences" content="likes dark roast"] Noted!';
    const actions = parseActions(text);
    expect(actions[0]).toEqual({
      type: "REMEMBER",
      params: { category: "preferences", content: "likes dark roast" },
    });
  });

  it("parses FORGET action", () => {
    const text = '[ACTION:FORGET category="facts" content="likes tea"]';
    const actions = parseActions(text);
    expect(actions[0]).toEqual({
      type: "FORGET",
      params: { category: "facts", content: "likes tea" },
    });
  });

  it("parses multiple actions", () => {
    const text = '[ACTION:REMIND text="a" datetime="2026-03-27T09:00:00" recurring="null"] [ACTION:REMEMBER category="facts" content="b"]';
    const actions = parseActions(text);
    expect(actions).toHaveLength(2);
  });

  it("returns empty array when no actions", () => {
    expect(parseActions("Just a normal response.")).toEqual([]);
  });
});

describe("stripActions", () => {
  it("removes action markers from text", () => {
    const text = 'Sure! [ACTION:REMIND text="standup" datetime="2026-03-27T09:00:00" recurring="daily"] I set that up for you.';
    const stripped = stripActions(text);
    expect(stripped).toBe("Sure!  I set that up for you.");
  });

  it("returns text unchanged when no actions", () => {
    expect(stripActions("Hello there")).toBe("Hello there");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/actions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement action parser**

```typescript
// src/actions.ts

export interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

const ACTION_PATTERN = /\[ACTION:(\w+)((?:\s+\w+="[^"]*")*)\]/g;
const PARAM_PATTERN = /(\w+)="([^"]*)"/g;

export function parseActions(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  for (const match of text.matchAll(ACTION_PATTERN)) {
    const type = match[1];
    const paramString = match[2];
    const params: Record<string, string> = {};
    for (const paramMatch of paramString.matchAll(PARAM_PATTERN)) {
      params[paramMatch[1]] = paramMatch[2];
    }
    actions.push({ type, params });
  }
  return actions;
}

export function stripActions(text: string): string {
  return text.replace(ACTION_PATTERN, "");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/actions.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions.ts src/__tests__/actions.test.ts
git commit -m "feat: action parser — parse and strip ACTION markers from Claude output"
```

---

### Task 6: System Prompt Builder

**Files:**
- Create: `src/system-prompt.ts`
- Create: `src/__tests__/system-prompt.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/system-prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../system-prompt.js";

describe("buildSystemPrompt", () => {
  it("includes identity section", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "" });
    expect(prompt).toContain("You are DNA");
  });

  it("includes current date/time", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "" });
    expect(prompt).toMatch(/Current date and time:/);
  });

  it("includes memory when provided", () => {
    const prompt = buildSystemPrompt({ memory: "Likes coffee", reminders: [], historySnippet: "" });
    expect(prompt).toContain("Likes coffee");
  });

  it("includes active reminders", () => {
    const reminders = [{ id: "r1", text: "standup", datetime: "2026-03-27T09:00:00", recurring: "daily", notified: false }];
    const prompt = buildSystemPrompt({ memory: "", reminders, historySnippet: "" });
    expect(prompt).toContain("standup");
    expect(prompt).toContain("2026-03-27T09:00:00");
  });

  it("includes action format instructions", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "" });
    expect(prompt).toContain("[ACTION:REMIND");
    expect(prompt).toContain("[ACTION:REMEMBER");
    expect(prompt).toContain("[ACTION:FORGET");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/system-prompt.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement system prompt builder**

```typescript
// src/system-prompt.ts
import type { Reminder } from "./reminders.js";

interface PromptContext {
  memory: string;
  reminders: Reminder[];
  historySnippet: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const sections: string[] = [];

  sections.push(`You are DNA (Definitely Not Assistant), a personal companion.
You are warm, concise, and helpful. You remember things about the user and help them stay organized.
Current date and time: ${now}`);

  if (ctx.memory) {
    sections.push(`## What you know about the user\n\n${ctx.memory}`);
  }

  if (ctx.reminders.length > 0) {
    const reminderLines = ctx.reminders.map(
      (r) => `- [${r.id}] "${r.text}" at ${r.datetime}${r.recurring ? ` (${r.recurring})` : ""}`
    );
    sections.push(`## Active reminders\n\n${reminderLines.join("\n")}`);
  }

  if (ctx.historySnippet) {
    sections.push(`## Recent conversation\n\n${ctx.historySnippet}`);
  }

  sections.push(`## Actions

When the user asks you to set a reminder, remember something, or forget something, include the appropriate action marker in your response. You may include multiple actions. Always also respond naturally in text.

Formats:
[ACTION:REMIND text="<reminder text>" datetime="<YYYY-MM-DDTHH:mm:ss>" recurring="<daily|weekly|monthly|null>"]
[ACTION:REMEMBER category="<facts|preferences|topics/name>" content="<what to remember>"]
[ACTION:FORGET category="<facts|preferences|topics/name>" content="<what to forget>"]`);

  return sections.join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/system-prompt.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/system-prompt.ts src/__tests__/system-prompt.test.ts
git commit -m "feat: system prompt builder with memory, reminders, and action format"
```

---

### Task 7: Claude Engine

**Files:**
- Create: `src/engine.ts`
- Create: `src/__tests__/engine.test.ts`

- [ ] **Step 1: Write failing tests for context assembly and action execution**

```typescript
// src/__tests__/engine.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assembleContext, executeActions } from "../engine.js";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DATA = join(import.meta.dirname, "test-data");
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
    const { readMemory } = require("../memory.js");
    // Verify via file read instead
    const fs = require("fs");
    const content = fs.readFileSync(join(MEMORY_DIR, "facts.md"), "utf-8");
    expect(content).toContain("New fact");
  });

  it("executes REMIND action", () => {
    executeActions(
      [{ type: "REMIND", params: { text: "test reminder", datetime: "2026-04-01T09:00:00", recurring: "null" } }],
      MEMORY_DIR,
      REMINDERS_PATH
    );
    const fs = require("fs");
    const reminders = JSON.parse(fs.readFileSync(REMINDERS_PATH, "utf-8"));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].text).toBe("test reminder");
  });

  it("executes FORGET action", () => {
    executeActions(
      [{ type: "FORGET", params: { category: "facts", content: "Old fact" } }],
      MEMORY_DIR,
      REMINDERS_PATH
    );
    const fs = require("fs");
    const content = fs.readFileSync(join(MEMORY_DIR, "facts.md"), "utf-8");
    expect(content).not.toContain("Old fact");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/engine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement engine**

```typescript
// src/engine.ts
import { execFileSync } from "child_process";
import { readMemory, appendMemory, removeMemoryEntry } from "./memory.js";
import { loadHistory, appendHistory, getTodayFileName, type HistoryMessage } from "./history.js";
import { loadReminders, addReminder } from "./reminders.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { parseActions, stripActions, type ParsedAction } from "./actions.js";

interface ContextPaths {
  memoryDir: string;
  historyDir: string;
  remindersPath: string;
  historyLimit: number;
}

export function assembleContext(paths: ContextPaths): string {
  const memory = readMemory(paths.memoryDir);
  const today = getTodayFileName();
  const history = loadHistory(paths.historyDir, today, paths.historyLimit);
  const reminders = loadReminders(paths.remindersPath).filter((r) => !r.notified);

  const historySnippet = history
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  return buildSystemPrompt({ memory, reminders, historySnippet });
}

export function executeActions(
  actions: ParsedAction[],
  memoryDir: string,
  remindersPath: string
): void {
  for (const action of actions) {
    switch (action.type) {
      case "REMEMBER":
        appendMemory(memoryDir, action.params.category, action.params.content);
        break;
      case "FORGET":
        removeMemoryEntry(memoryDir, action.params.category, action.params.content);
        break;
      case "REMIND":
        addReminder(remindersPath, {
          text: action.params.text,
          datetime: action.params.datetime,
          recurring: action.params.recurring === "null" ? null : action.params.recurring,
        });
        break;
    }
  }
}

export function sendToClaude(userMessage: string, systemPrompt: string): string {
  const input = `${systemPrompt}\n\n---\n\nUser: ${userMessage}`;
  const result = execFileSync("claude", ["-p", input], {
    encoding: "utf-8",
    timeout: 120_000,
  });
  return result.trim();
}

export interface ProcessResult {
  reply: string;
  actions: ParsedAction[];
}

export function processMessage(
  userMessage: string,
  paths: ContextPaths & { memoryDir: string; remindersPath: string }
): ProcessResult {
  const systemPrompt = assembleContext(paths);
  const rawResponse = sendToClaude(userMessage, systemPrompt);
  const actions = parseActions(rawResponse);
  executeActions(actions, paths.memoryDir, paths.remindersPath);
  const reply = stripActions(rawResponse).trim();
  return { reply, actions };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/engine.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine.ts src/__tests__/engine.test.ts
git commit -m "feat: Claude engine — context assembly, action execution, claude -p integration"
```

---

### Task 8: Telegram Bot

**Files:**
- Create: `src/bot.ts`

- [ ] **Step 1: Implement the Telegram bot**

```typescript
// src/bot.ts
import { Bot, Context } from "grammy";
import { processMessage } from "./engine.js";
import { appendHistory, getTodayFileName } from "./history.js";
import { join } from "path";
import { DATA_DIR } from "./config.js";

const MEMORY_DIR = join(DATA_DIR, "memory");
const HISTORY_DIR = join(DATA_DIR, "history");
const REMINDERS_PATH = join(DATA_DIR, "reminders", "active.json");

interface BotDeps {
  token: string;
  allowedUserId: number;
  historyLimit: number;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== deps.allowedUserId) {
      return;
    }
    await next();
  });

  bot.on("message:text", async (ctx: Context) => {
    const userMessage = ctx.message!.text!;
    const today = getTodayFileName();
    const timestamp = new Date().toISOString();

    appendHistory(HISTORY_DIR, today, { role: "user", content: userMessage, timestamp });

    const paths = {
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: deps.historyLimit,
    };

    try {
      const result = processMessage(userMessage, paths);
      appendHistory(HISTORY_DIR, today, { role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
      await ctx.reply(result.reply);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Engine error:", errMsg);
      await ctx.reply("Sorry, I had trouble processing that. Please try again.");
    }
  });

  return bot;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/bot.ts
git commit -m "feat: Telegram bot with auth guard and message processing"
```

---

### Task 9: Scheduler

**Files:**
- Create: `src/scheduler.ts`

- [ ] **Step 1: Implement the scheduler**

```typescript
// src/scheduler.ts
import cron from "node-cron";
import { getDueReminders, markNotified, scheduleNextOccurrence } from "./reminders.js";
import type { Bot } from "grammy";

interface SchedulerDeps {
  remindersPath: string;
  bot: Bot;
  chatId: number;
}

export function startScheduler(deps: SchedulerDeps): cron.ScheduledTask {
  return cron.schedule("* * * * *", async () => {
    const due = getDueReminders(deps.remindersPath);
    for (const reminder of due) {
      try {
        const recurLabel = reminder.recurring ? ` (${reminder.recurring})` : "";
        await deps.bot.api.sendMessage(deps.chatId, `Reminder: ${reminder.text}${recurLabel}`);
        markNotified(deps.remindersPath, reminder.id);
        if (reminder.recurring) {
          scheduleNextOccurrence(deps.remindersPath, reminder.id);
        }
      } catch (error) {
        console.error(`Failed to send reminder ${reminder.id}:`, error);
      }
    }
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scheduler.ts
git commit -m "feat: cron scheduler for checking and sending due reminders"
```

---

### Task 10: Entry Point — Wire Everything Together

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement the full entry point**

```typescript
// src/index.ts
import { loadConfig, DATA_DIR } from "./config.js";
import { createBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { join } from "path";
import { mkdirSync } from "fs";

const config = loadConfig();

// Ensure data directories exist
mkdirSync(join(DATA_DIR, "memory", "topics"), { recursive: true });
mkdirSync(join(DATA_DIR, "history"), { recursive: true });
mkdirSync(join(DATA_DIR, "reminders"), { recursive: true });

const bot = createBot({
  token: config.telegramBotToken,
  allowedUserId: config.allowedUserId,
  historyLimit: config.historyLimit,
});

startScheduler({
  remindersPath: join(DATA_DIR, "reminders", "active.json"),
  bot,
  chatId: config.allowedUserId,
});

bot.start({
  onStart: () => {
    console.log("DNA is alive. Listening for messages...");
  },
});

process.on("SIGINT", () => {
  console.log("DNA shutting down...");
  bot.stop();
  process.exit(0);
});
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up bot, scheduler, and engine in entry point"
```

---

### Task 11: MCP Client Stub (Electron/Telegram Desktop)

**Files:**
- Create: `src/mcp-client.ts`

- [ ] **Step 1: Implement MCP client with graceful fallback**

```typescript
// src/mcp-client.ts

interface McpClientConfig {
  serverUrl: string;
}

interface McpClient {
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  sendAction(action: string, params: Record<string, string>): Promise<string | null>;
}

export function createMcpClient(config: McpClientConfig): McpClient {
  let connected = false;

  return {
    get connected() {
      return connected;
    },

    async connect(): Promise<void> {
      try {
        // MCP Electron server connection will be implemented
        // when the specific MCP server package is chosen.
        // For now, log and mark as not connected.
        console.log(`MCP: Attempting connection to ${config.serverUrl}...`);
        console.log("MCP: Electron MCP server not yet configured. Skipping.");
        connected = false;
      } catch (error) {
        console.log("MCP: Telegram Desktop control not available.");
        connected = false;
      }
    },

    disconnect(): void {
      connected = false;
    },

    async sendAction(action: string, params: Record<string, string>): Promise<string | null> {
      if (!connected) {
        return null;
      }
      // Will delegate to MCP server tools once connected
      console.log(`MCP: ${action}`, params);
      return null;
    },
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/mcp-client.ts
git commit -m "feat: MCP client stub with graceful fallback for Telegram Desktop control"
```

---

### Task 12: End-to-End Manual Test & README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# DNA — Definitely Not Assistant

A personal companion powered by Claude CLI, communicating via Telegram.

## Features

- Chat naturally via Telegram bot
- Memory — remembers facts and preferences across conversations
- Reminders — set one-time or recurring reminders via natural language
- History — daily conversation logs
- Telegram Desktop control (via Electron MCP, optional)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Get a Telegram bot token from [@BotFather](https://t.me/BotFather)

3. Find your Telegram user ID (message [@userinfobot](https://t.me/userinfobot))

4. Edit `data/config.json`:
   ```json
   {
     "telegramBotToken": "YOUR_BOT_TOKEN",
     "allowedUserId": YOUR_USER_ID,
     "historyLimit": 20,
     "mcpServerUrl": "ws://127.0.0.1:18789"
   }
   ```

5. Ensure `claude` CLI is installed and authenticated.

6. Start DNA:
   ```bash
   npm run dev
   ```

## Usage

Message your bot on Telegram. Examples:

- "Remember that I like dark roast coffee"
- "Remind me about standup tomorrow at 9am"
- "What do you know about me?"
- General chat and questions

## Project Structure

```
src/
├── index.ts          # entry point
├── config.ts         # configuration loader
├── bot.ts            # Telegram bot (grammY)
├── engine.ts         # Claude engine (claude -p)
├── actions.ts        # action marker parser
├── memory.ts         # memory file read/write
├── history.ts        # conversation history
├── reminders.ts      # reminder management
├── scheduler.ts      # cron-based reminder checker
├── mcp-client.ts     # Electron MCP client (stub)
└── system-prompt.ts  # system prompt builder
data/
├── config.json       # bot token, user ID, settings
├── memory/           # markdown memory files
├── history/          # daily JSON conversation logs
└── reminders/        # active reminders
```
```

- [ ] **Step 2: Manual test checklist**

Run `npm run dev` with a real bot token and verify:
- [ ] Bot starts without errors
- [ ] Bot responds to your messages
- [ ] Bot ignores messages from other users
- [ ] "Remember that I like sushi" → saves to memory
- [ ] "What do you know about me?" → mentions sushi
- [ ] "Remind me to stretch in 1 minute" → sets reminder, sends notification
- [ ] History file created for today

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```

---
