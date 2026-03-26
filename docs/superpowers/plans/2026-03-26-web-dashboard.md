# DNA Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full web dashboard to DNA for managing paired chats, memory, history, reminders, live conversation feed, and logs — replacing Telegram-based admin commands.

**Architecture:** Express server running in the same Node.js process as the bot. Serves static HTML/CSS/JS from `src/web/public/`. REST API endpoints at `/api/*` for all CRUD operations. Server-Sent Events (SSE) at `/api/events` for live conversation feed and logs. No build step — vanilla HTML + CSS + JS with fetch calls.

**Tech Stack:** Express, SSE (native), existing DNA modules (config, memory, history, reminders)

---

## File Structure

```
src/
├── web/
│   ├── server.ts          # Express app setup, mounts API + static
│   ├── api-config.ts      # GET/PUT /api/config, POST/DELETE /api/config/allowedIds
│   ├── api-memory.ts      # GET/PUT/DELETE /api/memory/:category
│   ├── api-history.ts     # GET /api/history, GET /api/history/:chatId/:date
│   ├── api-reminders.ts   # GET/POST/DELETE /api/reminders
│   ├── api-events.ts      # SSE endpoint /api/events — live messages + logs
│   ├── event-bus.ts       # Simple EventEmitter singleton for bot→web bridge
│   └── public/
│       ├── index.html      # Single page app shell with nav tabs
│       ├── style.css       # Dashboard styles
│       └── app.js          # Client-side JS — tab routing, API calls, SSE listener
├── index.ts               # Modified: starts web server alongside bot
├── bot.ts                 # Modified: emits events to event-bus on messages
└── config.ts              # Modified: add webPort to Config
```

---

### Task 1: Event Bus + Express Server Shell

**Files:**
- Create: `src/web/event-bus.ts`
- Create: `src/web/server.ts`
- Modify: `src/config.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add webPort to config**

In `src/config.ts`, add `webPort: number` to the Config interface.

In `data/config.json`, add `"webPort": 3000`.

- [ ] **Step 2: Create event bus**

```typescript
// src/web/event-bus.ts
import { EventEmitter } from "events";

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export interface ChatEvent {
  type: "message" | "log";
  chatId: number;
  role: string;
  content: string;
  timestamp: string;
}
```

- [ ] **Step 3: Create Express server**

```typescript
// src/web/server.ts
import express from "express";
import { join } from "path";

export function createWebServer(port: number): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(import.meta.dirname, "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.listen(port, () => {
    console.log(`DNA dashboard at http://localhost:${port}`);
  });

  return app;
}
```

- [ ] **Step 4: Install express**

```bash
npm install express
npm install -D @types/express
```

- [ ] **Step 5: Wire into index.ts**

Add after the bot creation in `src/index.ts`:

```typescript
import { createWebServer } from "./web/server.js";

const web = createWebServer(config.webPort);
```

- [ ] **Step 6: Verify it starts**

```bash
npm run dev
```

Expected: Both "DNA is alive" and "DNA dashboard at http://localhost:3000" print. `curl http://localhost:3000/api/health` returns `{"status":"ok",...}`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: express web server shell with event bus"
```

---

### Task 2: Config API

**Files:**
- Create: `src/web/api-config.ts`
- Modify: `src/web/server.ts`

- [ ] **Step 1: Create config API router**

```typescript
// src/web/api-config.ts
import { Router } from "express";
import { loadConfig, saveConfig } from "../config.js";

export function configRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const config = loadConfig();
    const safe = { ...config, telegramBotToken: "***" };
    res.json(safe);
  });

  router.put("/", (req, res) => {
    const config = loadConfig();
    const allowed = ["pairSecret", "historyLimit", "webPort"] as const;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        (config as Record<string, unknown>)[key] = req.body[key];
      }
    }
    saveConfig(config);
    res.json({ ok: true });
  });

  router.post("/allowedIds", (req, res) => {
    const { id } = req.body;
    if (typeof id !== "number") {
      res.status(400).json({ error: "id must be a number" });
      return;
    }
    const config = loadConfig();
    if (!config.allowedIds.includes(id)) {
      config.allowedIds.push(id);
      saveConfig(config);
    }
    res.json({ allowedIds: config.allowedIds });
  });

  router.delete("/allowedIds/:id", (req, res) => {
    const id = Number(req.params.id);
    const config = loadConfig();
    config.allowedIds = config.allowedIds.filter((i) => i !== id);
    saveConfig(config);
    res.json({ allowedIds: config.allowedIds });
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.ts**

Add to `createWebServer` before the `app.listen`:

```typescript
import { configRouter } from "./api-config.js";
app.use("/api/config", configRouter());
```

- [ ] **Step 3: Verify**

```bash
curl http://localhost:3000/api/config
```

Expected: JSON with config (token masked).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: config REST API — read, update, manage allowedIds"
```

---

### Task 3: Memory API

**Files:**
- Create: `src/web/api-memory.ts`
- Modify: `src/web/server.ts`

- [ ] **Step 1: Create memory API router**

```typescript
// src/web/api-memory.ts
import { Router } from "express";
import { readMemory, appendMemory, removeMemoryEntry, listMemoryFiles } from "../memory.js";
import { readFileSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../config.js";

const MEMORY_DIR = join(DATA_DIR, "memory");

export function memoryRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const files = listMemoryFiles(MEMORY_DIR);
    const all = readMemory(MEMORY_DIR);
    res.json({ files, content: all });
  });

  router.get("/:category(*)", (req, res) => {
    const filePath = join(MEMORY_DIR, `${req.params.category}.md`);
    try {
      const content = readFileSync(filePath, "utf-8");
      res.json({ category: req.params.category, content });
    } catch {
      res.status(404).json({ error: "Category not found" });
    }
  });

  router.post("/:category(*)", (req, res) => {
    const { content } = req.body;
    if (typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }
    appendMemory(MEMORY_DIR, req.params.category, content);
    res.json({ ok: true });
  });

  router.delete("/:category(*)", (req, res) => {
    const { content } = req.body;
    if (typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }
    removeMemoryEntry(MEMORY_DIR, req.params.category, content);
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.ts**

```typescript
import { memoryRouter } from "./api-memory.js";
app.use("/api/memory", memoryRouter());
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: memory REST API — list, read, append, remove entries"
```

---

### Task 4: History API

**Files:**
- Create: `src/web/api-history.ts`
- Modify: `src/web/server.ts`

- [ ] **Step 1: Create history API router**

```typescript
// src/web/api-history.ts
import { Router } from "express";
import { loadHistory } from "../history.js";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../config.js";

const HISTORY_DIR = join(DATA_DIR, "history");

export function historyRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    if (!existsSync(HISTORY_DIR)) {
      res.json({ chats: [] });
      return;
    }
    const chatDirs = readdirSync(HISTORY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const chatDir = join(HISTORY_DIR, d.name);
        const dates = readdirSync(chatDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""))
          .sort()
          .reverse();
        return { chatId: d.name, dates, messageCount: dates.length };
      });
    res.json({ chats: chatDirs });
  });

  router.get("/:chatId/:date", (req, res) => {
    const chatDir = join(HISTORY_DIR, req.params.chatId);
    const limit = Number(req.query.limit) || 100;
    const messages = loadHistory(chatDir, req.params.date, limit);
    res.json({ chatId: req.params.chatId, date: req.params.date, messages });
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.ts**

```typescript
import { historyRouter } from "./api-history.js";
app.use("/api/history", historyRouter());
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: history REST API — list chats, browse daily logs"
```

---

### Task 5: Reminders API

**Files:**
- Create: `src/web/api-reminders.ts`
- Modify: `src/web/server.ts`

- [ ] **Step 1: Create reminders API router**

```typescript
// src/web/api-reminders.ts
import { Router } from "express";
import { loadReminders, addReminder, markNotified } from "../reminders.js";
import { writeFileSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../config.js";

const REMINDERS_PATH = join(DATA_DIR, "reminders", "active.json");

export function remindersRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const reminders = loadReminders(REMINDERS_PATH);
    res.json({ reminders });
  });

  router.post("/", (req, res) => {
    const { text, datetime, recurring } = req.body;
    if (!text || !datetime) {
      res.status(400).json({ error: "text and datetime are required" });
      return;
    }
    const reminder = addReminder(REMINDERS_PATH, {
      text,
      datetime,
      recurring: recurring ?? null,
    });
    res.json({ reminder });
  });

  router.delete("/:id", (req, res) => {
    const reminders = loadReminders(REMINDERS_PATH);
    const filtered = reminders.filter((r) => r.id !== req.params.id);
    writeFileSync(REMINDERS_PATH, JSON.stringify(filtered, null, 2));
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.ts**

```typescript
import { remindersRouter } from "./api-reminders.js";
app.use("/api/reminders", remindersRouter());
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: reminders REST API — list, add, delete"
```

---

### Task 6: SSE Events Endpoint

**Files:**
- Create: `src/web/api-events.ts`
- Modify: `src/web/server.ts`
- Modify: `src/bot.ts`

- [ ] **Step 1: Create SSE endpoint**

```typescript
// src/web/api-events.ts
import { Router } from "express";
import { eventBus, type ChatEvent } from "./event-bus.js";

export function eventsRouter(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");

    const handler = (event: ChatEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    eventBus.on("chat", handler);
    req.on("close", () => {
      eventBus.off("chat", handler);
    });
  });

  return router;
}
```

- [ ] **Step 2: Mount in server.ts**

```typescript
import { eventsRouter } from "./api-events.js";
app.use("/api/events", eventsRouter());
```

- [ ] **Step 3: Emit events from bot.ts**

Add import at top of `src/bot.ts`:

```typescript
import { eventBus } from "./web/event-bus.js";
```

After `appendHistory` for the user message, add:

```typescript
eventBus.emit("chat", {
  type: "message",
  chatId,
  role: "user",
  content: userMessage,
  timestamp,
});
```

After `appendHistory` for the assistant reply, add:

```typescript
eventBus.emit("chat", {
  type: "message",
  chatId,
  role: "assistant",
  content: result.reply,
  timestamp: new Date().toISOString(),
});
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: SSE events endpoint with live message feed from bot"
```

---

### Task 7: Dashboard Frontend — HTML Shell + CSS

**Files:**
- Create: `src/web/public/index.html`
- Create: `src/web/public/style.css`

- [ ] **Step 1: Create HTML shell**

```html
<!-- src/web/public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DNA Dashboard</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <h1>DNA</h1>
    <nav>
      <button class="tab active" data-tab="live">Live</button>
      <button class="tab" data-tab="chats">Chats</button>
      <button class="tab" data-tab="memory">Memory</button>
      <button class="tab" data-tab="reminders">Reminders</button>
      <button class="tab" data-tab="settings">Settings</button>
    </nav>
    <span id="status" class="status offline">offline</span>
  </header>
  <main>
    <section id="tab-live" class="panel">
      <h2>Live Feed</h2>
      <div id="live-feed" class="feed"></div>
    </section>
    <section id="tab-chats" class="panel hidden">
      <h2>Chat History</h2>
      <div id="chat-list" class="sidebar"></div>
      <div id="chat-view" class="chat-view">
        <p class="placeholder">Select a chat to view history</p>
      </div>
    </section>
    <section id="tab-memory" class="panel hidden">
      <h2>Memory</h2>
      <div id="memory-list" class="sidebar"></div>
      <div id="memory-editor" class="editor">
        <p class="placeholder">Select a memory category</p>
      </div>
    </section>
    <section id="tab-reminders" class="panel hidden">
      <h2>Reminders</h2>
      <form id="reminder-form">
        <input type="text" name="text" placeholder="Reminder text" required>
        <input type="datetime-local" name="datetime" required>
        <select name="recurring">
          <option value="">One-time</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button type="submit">Add</button>
      </form>
      <div id="reminder-list"></div>
    </section>
    <section id="tab-settings" class="panel hidden">
      <h2>Settings</h2>
      <div id="settings-form">
        <h3>Paired Chats</h3>
        <div id="paired-list"></div>
        <form id="pair-form">
          <input type="number" name="id" placeholder="Chat ID">
          <button type="submit">Add</button>
        </form>
        <h3>Config</h3>
        <label>Pair Secret <input type="text" id="cfg-pairSecret"></label>
        <label>History Limit <input type="number" id="cfg-historyLimit"></label>
        <button id="save-config">Save</button>
      </div>
    </section>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create CSS**

```css
/* src/web/public/style.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #0f1117;
  --surface: #1a1d27;
  --border: #2a2d3a;
  --text: #e1e4ed;
  --text-dim: #8b8fa3;
  --accent: #6c5ce7;
  --accent-hover: #7c6ef7;
  --danger: #e74c3c;
  --success: #2ecc71;
  --user-bg: #1e2a3a;
  --bot-bg: #2a1e3a;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

header h1 { font-size: 1.25rem; color: var(--accent); }

nav { display: flex; gap: 0.25rem; flex: 1; }

.tab {
  background: none;
  border: none;
  color: var(--text-dim);
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.875rem;
}

.tab:hover { background: var(--border); color: var(--text); }
.tab.active { background: var(--accent); color: white; }

.status {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
}

.status.online { background: var(--success); color: black; }
.status.offline { background: var(--danger); color: white; }

main { flex: 1; overflow: hidden; padding: 1rem 1.5rem; }

.panel { height: 100%; display: flex; flex-direction: column; gap: 1rem; }
.panel.hidden { display: none; }
.panel h2 { font-size: 1rem; color: var(--text-dim); }

.feed {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.msg {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  max-width: 80%;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.msg.user { background: var(--user-bg); align-self: flex-end; }
.msg.assistant { background: var(--bot-bg); align-self: flex-start; }
.msg .meta { font-size: 0.7rem; color: var(--text-dim); margin-top: 0.25rem; }

.sidebar {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  padding-right: 1rem;
}

#tab-chats, #tab-memory { flex-direction: row; }

.chat-view, .editor {
  flex: 1;
  overflow-y: auto;
  padding-left: 1rem;
}

.sidebar-item {
  padding: 0.5rem;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

.sidebar-item:hover { background: var(--border); }
.sidebar-item.active { background: var(--accent); color: white; }

.placeholder { color: var(--text-dim); font-style: italic; }

input, select, textarea {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.5rem;
  border-radius: 6px;
  font-size: 0.875rem;
}

button[type="submit"], #save-config {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

button[type="submit"]:hover, #save-config:hover {
  background: var(--accent-hover);
}

form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; color: var(--text-dim); }

#settings-form { display: flex; flex-direction: column; gap: 1rem; max-width: 500px; }

.reminder-item, .paired-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
}

.btn-delete {
  background: var(--danger);
  color: white;
  border: none;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.editor pre {
  background: var(--surface);
  padding: 1rem;
  border-radius: 8px;
  white-space: pre-wrap;
  font-size: 0.875rem;
  line-height: 1.6;
}

.add-memory-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.add-memory-form input { flex: 1; }
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: dashboard HTML shell and CSS — dark theme, tabbed layout"
```

---

### Task 8: Dashboard Frontend — Client JS

**Files:**
- Create: `src/web/public/app.js`

- [ ] **Step 1: Create client-side JavaScript**

```javascript
// src/web/public/app.js

// --- Tab Navigation ---
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    panels.forEach((p) => p.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove("hidden");
    loadTab(tab.dataset.tab);
  });
});

function loadTab(name) {
  const loaders = { chats: loadChats, memory: loadMemory, reminders: loadReminders, settings: loadSettings };
  if (loaders[name]) loaders[name]();
}

// --- SSE Live Feed ---
const feed = document.getElementById("live-feed");
const statusEl = document.getElementById("status");

function connectSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => {
    statusEl.textContent = "live";
    statusEl.className = "status online";
  };
  es.onerror = () => {
    statusEl.textContent = "offline";
    statusEl.className = "status offline";
  };
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "message") {
      appendMessage(feed, data.role, data.content, data.chatId, data.timestamp);
      feed.scrollTop = feed.scrollHeight;
    }
  };
}

function appendMessage(container, role, content, chatId, timestamp) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  const time = new Date(timestamp).toLocaleTimeString();
  const label = chatId ? ` [${chatId}]` : "";
  div.innerHTML = `${escapeHtml(content)}<div class="meta">${time}${label}</div>`;
  container.appendChild(div);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

connectSSE();

// --- Chats ---
async function loadChats() {
  const res = await fetch("/api/history");
  const { chats } = await res.json();
  const list = document.getElementById("chat-list");
  list.innerHTML = chats.map((c) =>
    `<div class="sidebar-item" data-chat="${c.chatId}">${c.chatId}<br><small>${c.dates[0] || "no history"}</small></div>`
  ).join("");

  list.querySelectorAll(".sidebar-item").forEach((el) => {
    el.addEventListener("click", async () => {
      list.querySelectorAll(".sidebar-item").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
      const chatId = el.dataset.chat;
      const dateRes = await fetch(`/api/history`);
      const chatData = (await dateRes.json()).chats.find((c) => c.chatId === chatId);
      if (!chatData || chatData.dates.length === 0) return;
      const msgRes = await fetch(`/api/history/${chatId}/${chatData.dates[0]}`);
      const { messages } = await msgRes.json();
      const view = document.getElementById("chat-view");
      view.innerHTML = "";
      messages.forEach((m) => appendMessage(view, m.role, m.content, null, m.timestamp));
    });
  });
}

// --- Memory ---
async function loadMemory() {
  const res = await fetch("/api/memory");
  const { files } = await res.json();
  const list = document.getElementById("memory-list");
  list.innerHTML = files.map((f) =>
    `<div class="sidebar-item" data-cat="${f}">${f}</div>`
  ).join("");

  list.querySelectorAll(".sidebar-item").forEach((el) => {
    el.addEventListener("click", async () => {
      list.querySelectorAll(".sidebar-item").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
      const cat = el.dataset.cat;
      const catRes = await fetch(`/api/memory/${cat}`);
      const { content } = await catRes.json();
      const editor = document.getElementById("memory-editor");
      editor.innerHTML = `<pre>${escapeHtml(content)}</pre>
        <div class="add-memory-form">
          <input type="text" id="new-memory-entry" placeholder="Add entry...">
          <button type="submit" onclick="addMemoryEntry('${cat}')">Add</button>
        </div>`;
    });
  });
}

async function addMemoryEntry(category) {
  const input = document.getElementById("new-memory-entry");
  if (!input.value) return;
  await fetch(`/api/memory/${category}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: input.value }),
  });
  input.value = "";
  loadMemory();
}

// --- Reminders ---
async function loadReminders() {
  const res = await fetch("/api/reminders");
  const { reminders } = await res.json();
  const list = document.getElementById("reminder-list");
  list.innerHTML = reminders.map((r) => {
    const dt = new Date(r.datetime).toLocaleString();
    const recur = r.recurring ? ` (${r.recurring})` : "";
    const status = r.notified ? " [done]" : "";
    return `<div class="reminder-item">
      <span>${escapeHtml(r.text)} — ${dt}${recur}${status}</span>
      <button class="btn-delete" onclick="deleteReminder('${r.id}')">Delete</button>
    </div>`;
  }).join("");
}

document.getElementById("reminder-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  await fetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: form.text.value,
      datetime: form.datetime.value.replace("T", "T") + ":00",
      recurring: form.recurring.value || null,
    }),
  });
  form.reset();
  loadReminders();
});

async function deleteReminder(id) {
  await fetch(`/api/reminders/${id}`, { method: "DELETE" });
  loadReminders();
}

// --- Settings ---
async function loadSettings() {
  const res = await fetch("/api/config");
  const config = await res.json();

  document.getElementById("cfg-pairSecret").value = config.pairSecret;
  document.getElementById("cfg-historyLimit").value = config.historyLimit;

  const list = document.getElementById("paired-list");
  list.innerHTML = config.allowedIds.map((id) =>
    `<div class="paired-item">
      <span>${id}</span>
      <button class="btn-delete" onclick="unpairChat(${id})">Remove</button>
    </div>`
  ).join("");
}

document.getElementById("pair-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = Number(e.target.id.value);
  if (!id) return;
  await fetch("/api/config/allowedIds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  e.target.reset();
  loadSettings();
});

async function unpairChat(id) {
  await fetch(`/api/config/allowedIds/${id}`, { method: "DELETE" });
  loadSettings();
}

document.getElementById("save-config").addEventListener("click", async () => {
  await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairSecret: document.getElementById("cfg-pairSecret").value,
      historyLimit: Number(document.getElementById("cfg-historyLimit").value),
    }),
  });
  alert("Saved!");
});
```

- [ ] **Step 2: Verify the full dashboard works**

Start the app, open `http://localhost:3000` in browser. Verify:
- Tabs switch between panels
- Live feed shows "live" status
- Settings tab shows config and paired chats
- Reminders tab shows form and list
- Memory tab shows categories

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: dashboard client JS — live feed, chat history, memory, reminders, settings"
```

---

### Task 9: Remove Telegram Pair/Unpair Commands

**Files:**
- Modify: `src/bot.ts`

- [ ] **Step 1: Remove /pair and /unpair command handlers**

Remove the `bot.command("pair", ...)` and `bot.command("unpair", ...)` blocks from `src/bot.ts`. Also remove `pairSecret` and `ownerId` from `BotDeps` since pairing is now managed via the web UI.

Updated `BotDeps`:

```typescript
interface BotDeps {
  token: string;
  allowedIds: number[];
  historyLimit: number;
}
```

Remove the `pendingPairs` set. The auth middleware stays as-is (checks `allowedIds`).

- [ ] **Step 2: Update index.ts to match new BotDeps**

Remove `ownerId`, `pairSecret`, and `onPair` from the `createBot` call:

```typescript
const bot = createBot({
  token: config.telegramBotToken,
  allowedIds: config.allowedIds,
  historyLimit: config.historyLimit,
});
```

- [ ] **Step 3: Verify it compiles and tests pass**

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove telegram pair/unpair commands, pairing now via web dashboard"
```

---

### Task 10: Hot-Reload Config for Bot AllowedIds

**Files:**
- Modify: `src/web/api-config.ts`
- Modify: `src/web/server.ts`
- Modify: `src/bot.ts`

- [ ] **Step 1: Pass a mutable allowedIds reference**

Since both the bot and the config API share the same `config.allowedIds` array (passed by reference), changes via the API are already reflected in the bot's auth middleware. Verify this by:

1. Start the app
2. Add a new chat ID via `POST /api/config/allowedIds`
3. Confirm the bot now accepts messages from that chat

If the bot uses a copy instead of a reference, update `createBot` to accept the config object's array directly (not a spread copy).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "fix: verify hot-reload of allowedIds between web API and bot"
```
