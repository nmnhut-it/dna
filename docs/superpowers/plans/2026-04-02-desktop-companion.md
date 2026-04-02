# Desktop Companion (Clippy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn DNA into a Windows desktop companion with a system tray icon, a floating retro Clippy-style widget showing live notifications, and an expandable mini chat — all launching on Windows startup.

**Architecture:** Tauri v2 app with two windows: a frameless always-on-top widget (retro Clippy UI) and a standard dashboard window. The Node.js backend is spawned as a Tauri sidecar via `tauri-plugin-shell`. The widget connects to the Express SSE feed for live notifications and a new `/api/widget/chat` endpoint for local chat. `tauri-plugin-autostart` handles Windows startup registration.

**Tech Stack:** Tauri v2, Rust (tray + window management), vanilla HTML/CSS/JS (widget UI), Node.js sidecar, Express API

---

### Task 1: Add Widget Chat API Endpoint

Add a new Express endpoint that lets the widget send messages through the engine without Telegram.

**Files:**
- Create: `src/web/api-widget.ts`
- Modify: `src/web/server.ts:1-32`

- [ ] **Step 1: Create the widget chat router**

Create `src/web/api-widget.ts`:

```typescript
import { Router } from "express";
import { assembleContext, streamFromClaude, parseActions, stripActions, executeActions } from "../engine.js";
import { chatPaths, ensureChatDirs, loadChatConfig } from "../config.js";
import { appendHistory } from "../history.js";
import { logger } from "../logger.js";

const WIDGET_CHAT_ID = 999999;

export function widgetRouter(): Router {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    try {
      ensureChatDirs(WIDGET_CHAT_ID);
      const paths = chatPaths(WIDGET_CHAT_ID);
      const chatConfig = loadChatConfig(WIDGET_CHAT_ID, 0);

      const systemPrompt = assembleContext({
        memoryDir: paths.memoryDir,
        historyDir: paths.historyDir,
        remindersPath: paths.remindersPath,
        historyLimit: 20,
        chatConfig,
        chatDir: paths.root,
        chat: { chatId: WIDGET_CHAT_ID, chatTitle: "Widget", senderName: "User", isGroup: false },
      });

      appendHistory(paths.historyDir, { role: "user", content: message });

      const rawResponse = await streamFromClaude(
        message, systemPrompt, () => {}, chatConfig.allowedTools, paths.root
      );

      const { parseActions: pa, stripActions: sa } = await import("../actions.js");
      const actions = pa(rawResponse);
      const reply = sa(rawResponse).trim();

      executeActions(actions, paths.memoryDir, paths.remindersPath);
      appendHistory(paths.historyDir, { role: "assistant", content: reply });

      res.json({ reply });
    } catch (err) {
      logger.error(`Widget chat error: ${err}`);
      res.status(500).json({ error: "Failed to get response" });
    }
  });

  return router;
}
```

Note: `parseActions` and `stripActions` are imported from `actions.ts`, and `executeActions` from `engine.ts`. The double-import above is a mistake — let me correct. The actual imports at the top are sufficient. Remove the dynamic import line and use the top-level imports directly.

Corrected version — the router body should use the top-level imports:

```typescript
import { Router } from "express";
import { assembleContext, executeActions, streamFromClaude } from "../engine.js";
import { parseActions, stripActions } from "../actions.js";
import { chatPaths, ensureChatDirs, loadChatConfig } from "../config.js";
import { appendHistory } from "../history.js";
import { logger } from "../logger.js";

const WIDGET_CHAT_ID = 999999;

export function widgetRouter(): Router {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    try {
      ensureChatDirs(WIDGET_CHAT_ID);
      const paths = chatPaths(WIDGET_CHAT_ID);
      const chatConfig = loadChatConfig(WIDGET_CHAT_ID, 0);

      const systemPrompt = assembleContext({
        memoryDir: paths.memoryDir,
        historyDir: paths.historyDir,
        remindersPath: paths.remindersPath,
        historyLimit: 20,
        chatConfig,
        chatDir: paths.root,
        chat: { chatId: WIDGET_CHAT_ID, chatTitle: "Widget", senderName: "User", isGroup: false },
      });

      appendHistory(paths.historyDir, { role: "user", content: message });

      const rawResponse = await streamFromClaude(
        message, systemPrompt, () => {}, chatConfig.allowedTools, paths.root
      );

      const actions = parseActions(rawResponse);
      const reply = stripActions(rawResponse).trim();

      executeActions(actions, paths.memoryDir, paths.remindersPath);
      appendHistory(paths.historyDir, { role: "assistant", content: reply });

      res.json({ reply });
    } catch (err) {
      logger.error(`Widget chat error: ${err}`);
      res.status(500).json({ error: "Failed to get response" });
    }
  });

  return router;
}
```

- [ ] **Step 2: Verify `appendHistory` exists and check its signature**

Check `src/history.ts` for an `appendHistory` export. If it doesn't exist (the bot may write history differently), you'll need to add a simple append function. Look at how `bot.ts` writes history and replicate that approach. The function should write a `{ role, content, timestamp }` entry to the day file in `historyDir`.

- [ ] **Step 3: Mount the widget router in server.ts**

In `src/web/server.ts`, add:

```typescript
import { widgetRouter } from "./api-widget.js";
```

And after the events router mount (line 25), add:

```typescript
app.use("/api/widget", widgetRouter());
```

- [ ] **Step 4: Test the endpoint manually**

Run: `npm run dev`

Then in another terminal:
```bash
curl -X POST http://localhost:3000/api/widget/chat -H "Content-Type: application/json" -d '{"message":"hello"}'
```

Expected: JSON response with `{ "reply": "..." }` (may take a few seconds for Claude CLI).

- [ ] **Step 5: Commit**

```bash
git add src/web/api-widget.ts src/web/server.ts
git commit -m "feat: add widget chat API endpoint"
```

---

### Task 2: Create the Widget HTML/CSS (Retro Clippy UI)

Build the floating widget frontend with pixel art character, notification ticker, and expandable chat.

**Files:**
- Create: `src/web/widget/index.html`
- Create: `src/web/widget/widget.css`
- Create: `src/web/widget/widget.js`

- [ ] **Step 1: Create widget HTML**

Create `src/web/widget/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DNA Clippy</title>
  <link rel="stylesheet" href="widget.css">
</head>
<body>
  <div id="widget" class="idle">
    <!-- Chat area (hidden in idle state) -->
    <div id="chat-area">
      <div id="chat-messages"></div>
      <form id="chat-form">
        <input type="text" id="chat-input" placeholder="Ask DNA..." autocomplete="off">
        <button type="submit">Send</button>
      </form>
    </div>

    <!-- Speech bubble for latest notification or reply -->
    <div id="speech-bubble" class="hidden">
      <span id="bubble-text"></span>
      <div class="bubble-tail"></div>
    </div>

    <!-- Clippy character -->
    <div id="clippy" title="Click to chat!">
      <div class="clippy-body">
        <div class="eye left"></div>
        <div class="eye right"></div>
        <div class="mouth"></div>
      </div>
    </div>

    <!-- Notification ticker -->
    <div id="ticker">
      <span id="ticker-text">Waiting for messages...</span>
    </div>

    <!-- Close / Dashboard buttons -->
    <div id="widget-controls">
      <button id="btn-dashboard" title="Open Dashboard">&#9776;</button>
      <button id="btn-close" title="Close chat">&times;</button>
    </div>
  </div>

  <script src="widget.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create widget CSS with pixel art character**

Create `src/web/widget/widget.css`:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: transparent;
  overflow: hidden;
  font-family: "Segoe UI", sans-serif;
  user-select: none;
  -webkit-app-region: drag;
}

#widget {
  width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

/* --- Controls --- */
#widget-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
  -webkit-app-region: no-drag;
}
#widget:hover #widget-controls { opacity: 1; }
#widget-controls button {
  background: rgba(0,0,0,0.5);
  color: #fff;
  border: none;
  width: 20px;
  height: 20px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
}
#widget-controls button:hover { background: rgba(0,0,0,0.8); }
#btn-close { display: none; }
#widget.chatting #btn-close { display: block; }

/* --- Clippy Character (Pure CSS Pixel Art) --- */
#clippy {
  width: 80px;
  height: 100px;
  cursor: pointer;
  position: relative;
  -webkit-app-region: no-drag;
  transition: transform 0.2s;
}
#clippy:hover { transform: scale(1.05); }

.clippy-body {
  width: 70px;
  height: 80px;
  background: #f0c040;
  border: 3px solid #333;
  border-radius: 35px 35px 20px 20px;
  position: relative;
  margin: 0 auto;
  image-rendering: pixelated;
  box-shadow: 3px 3px 0 #333;
}

.eye {
  width: 12px;
  height: 14px;
  background: white;
  border: 2px solid #333;
  border-radius: 50%;
  position: absolute;
  top: 22px;
}
.eye::after {
  content: "";
  width: 6px;
  height: 6px;
  background: #333;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  animation: blink 4s infinite;
}
.eye.left { left: 14px; }
.eye.right { right: 14px; }

.mouth {
  width: 16px;
  height: 8px;
  border-bottom: 3px solid #333;
  border-radius: 0 0 8px 8px;
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
}

@keyframes blink {
  0%, 95%, 100% { transform: scaleY(1); }
  97% { transform: scaleY(0.1); }
}

/* Idle bounce */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
#widget.idle #clippy {
  animation: bounce 3s ease-in-out infinite;
}

/* --- Speech Bubble --- */
#speech-bubble {
  background: white;
  color: #333;
  border: 2px solid #333;
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 12px;
  max-width: 200px;
  word-wrap: break-word;
  position: relative;
  margin-bottom: 6px;
  box-shadow: 2px 2px 0 #333;
  -webkit-app-region: no-drag;
}
#speech-bubble.hidden { display: none; }

.bubble-tail {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid #333;
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
}
.bubble-tail::after {
  content: "";
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid white;
  position: absolute;
  top: -12px;
  left: -6px;
}

/* --- Chat Area --- */
#chat-area {
  display: none;
  width: 220px;
  max-height: 250px;
  flex-direction: column;
  margin-bottom: 8px;
  -webkit-app-region: no-drag;
}
#widget.chatting #chat-area { display: flex; }
#widget.chatting #ticker { display: none; }
#widget.chatting #speech-bubble { display: none; }
#widget.chatting #clippy { animation: none; }

#chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  max-height: 200px;
  background: rgba(255,255,255,0.95);
  border: 2px solid #333;
  border-radius: 8px;
  box-shadow: 2px 2px 0 #333;
}

.chat-msg {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  max-width: 90%;
  word-wrap: break-word;
  color: #333;
}
.chat-msg.user {
  background: #dceaff;
  align-self: flex-end;
}
.chat-msg.assistant {
  background: #fff3c4;
  align-self: flex-start;
}
.chat-msg.typing {
  background: #eee;
  align-self: flex-start;
  font-style: italic;
}

#chat-form {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
#chat-input {
  flex: 1;
  border: 2px solid #333;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  outline: none;
  box-shadow: 2px 2px 0 #333;
}
#chat-form button {
  background: #f0c040;
  border: 2px solid #333;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 2px 2px 0 #333;
}
#chat-form button:hover { background: #e0b030; }

/* --- Ticker --- */
#ticker {
  background: rgba(0,0,0,0.7);
  color: #0f0;
  font-family: "Courier New", monospace;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  width: 200px;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-top: 6px;
  -webkit-app-region: no-drag;
}
```

- [ ] **Step 3: Create widget JavaScript**

Create `src/web/widget/widget.js`:

```javascript
// --- State ---
const widget = document.getElementById("widget");
const clippy = document.getElementById("clippy");
const bubble = document.getElementById("speech-bubble");
const bubbleText = document.getElementById("bubble-text");
const tickerText = document.getElementById("ticker-text");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const btnClose = document.getElementById("btn-close");
const btnDashboard = document.getElementById("btn-dashboard");

let isChatting = false;
let isWaiting = false;

// --- Clippy click: toggle chat mode ---
clippy.addEventListener("click", () => {
  if (isChatting) return;
  isChatting = true;
  widget.classList.remove("idle");
  widget.classList.add("chatting");
  chatInput.focus();
});

btnClose.addEventListener("click", () => {
  isChatting = false;
  widget.classList.remove("chatting");
  widget.classList.add("idle");
});

// --- Dashboard button ---
btnDashboard.addEventListener("click", async () => {
  // Try Tauri API to open dashboard window
  if (window.__TAURI__) {
    const { invoke } = window.__TAURI__.core;
    invoke("open_dashboard");
  } else {
    window.open("http://localhost:3000", "_blank");
  }
});

// --- Chat ---
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message || isWaiting) return;

  appendChatMsg("user", message);
  chatInput.value = "";
  isWaiting = true;

  const typingEl = appendChatMsg("typing", "thinking...");

  try {
    const res = await fetch("/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    typingEl.remove();
    if (data.reply) {
      appendChatMsg("assistant", data.reply);
    } else {
      appendChatMsg("assistant", "Sorry, something went wrong.");
    }
  } catch {
    typingEl.remove();
    appendChatMsg("assistant", "Connection error.");
  }

  isWaiting = false;
});

function appendChatMsg(role, text) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

// --- SSE Notification Ticker ---
function connectSSE() {
  const es = new EventSource("/api/events");

  es.onopen = () => {
    tickerText.textContent = "DNA is alive";
  };

  es.onerror = () => {
    tickerText.textContent = "Reconnecting...";
  };

  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "connected") return;

    let text = "";
    if (data.type === "message") {
      const who = data.role === "user" ? "User" : "DNA";
      const preview = data.content.length > 60
        ? data.content.slice(0, 60) + "..."
        : data.content;
      text = `${who}: ${preview}`;
    } else if (data.type === "log" && data.role === "warn") {
      text = data.content;
    } else {
      return;
    }

    // Update ticker
    tickerText.textContent = text;

    // Show speech bubble briefly (only in idle mode)
    if (!isChatting) {
      showBubble(text);
    }
  };
}

let bubbleTimer = null;
function showBubble(text) {
  bubbleText.textContent = text;
  bubble.classList.remove("hidden");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble.classList.add("hidden");
  }, 5000);
}

// --- Escape to close chat ---
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isChatting) {
    btnClose.click();
  }
});

// --- Init ---
connectSSE();
```

- [ ] **Step 4: Serve widget static files from Express**

In `src/web/server.ts`, add a static mount for the widget directory. After line 13 (the existing `express.static` for `public`), add:

```typescript
app.use("/widget", express.static(join(import.meta.dirname, "widget")));
```

- [ ] **Step 5: Test widget UI in browser**

Run: `npm run dev`

Open: `http://localhost:3000/widget/` in a browser.

Expected: See the yellow Clippy character with bouncing animation and ticker. Click Clippy to enter chat mode. Type a message to test the chat API.

- [ ] **Step 6: Commit**

```bash
git add src/web/widget/ src/web/server.ts
git commit -m "feat: add retro Clippy widget UI with chat and notification ticker"
```

---

### Task 3: Configure Tauri for Two Windows + Tray

Set up Tauri with a frameless widget window, a standard dashboard window, and a system tray icon.

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add Tauri plugin dependencies to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-shell = "2"
tauri-plugin-autostart = { version = "2", features = ["default"] }
```

- [ ] **Step 2: Run cargo check to download and verify deps**

```bash
cd src-tauri && cargo check
```

Expected: Compiles successfully (may take a while first time).

- [ ] **Step 3: Update tauri.conf.json for two windows + tray**

Replace `src-tauri/tauri.conf.json` with:

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "DNA",
  "version": "0.1.0",
  "identifier": "com.dna.app",
  "build": {
    "frontendDist": "http://localhost:3000",
    "devUrl": "http://localhost:3000"
  },
  "app": {
    "windows": [
      {
        "label": "widget",
        "title": "DNA",
        "url": "/widget/",
        "width": 240,
        "height": 400,
        "resizable": false,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "x": 1650,
        "y": 600
      }
    ],
    "security": {
      "csp": null
    },
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "tooltip": "DNA Companion"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "shell": {
      "sidecar": true
    },
    "autostart": {
      "args": []
    }
  }
}
```

Key changes: removed `beforeDevCommand` (we'll manage the backend separately), widget is the default window (frameless, transparent, always-on-top, skip taskbar), dashboard opens on demand.

- [ ] **Step 4: Update capabilities**

Replace `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for DNA companion",
  "windows": ["widget", "dashboard"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-create",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-close",
    "core:window:allow-set-focus",
    "shell:default",
    "shell:allow-execute",
    "shell:allow-spawn",
    "autostart:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
  ]
}
```

- [ ] **Step 5: Update lib.rs with tray and window management**

Replace `src-tauri/src/lib.rs`:

```rust
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[tauri::command]
fn open_dashboard(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("dashboard") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "dashboard",
            tauri::WebviewUrl::External("http://localhost:3000".parse().unwrap()),
        )
        .title("DNA Dashboard")
        .inner_size(1200.0, 800.0)
        .build();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .tooltip("DNA Companion")
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(widget) = app.get_webview_window("widget") {
                            if widget.is_visible().unwrap_or(false) {
                                let _ = widget.hide();
                            } else {
                                let _ = widget.show();
                                let _ = widget.set_focus();
                            }
                        }
                    }
                })
                .menu_items(&[])
                .build(app)?;

            // Enable autostart
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                let autostart = app.autolaunch();
                if !autostart.is_enabled().unwrap_or(false) {
                    let _ = autostart.enable();
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_dashboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat: configure Tauri with widget window, tray icon, and autostart"
```

---

### Task 4: Add Tray Context Menu

Add a right-click context menu to the tray icon with Show/Hide, Dashboard, and Quit options.

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add tray menu to lib.rs**

Replace the tray builder section in `lib.rs` (the `TrayIconBuilder::new()...build(app)?` block) with:

```rust
use tauri::menu::{MenuBuilder, MenuItemBuilder};

let show_hide = MenuItemBuilder::with_id("show_hide", "Show/Hide Clippy").build(app)?;
let dashboard = MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
let quit = MenuItemBuilder::with_id("quit", "Quit DNA").build(app)?;

let menu = MenuBuilder::new(app)
    .items(&[&show_hide, &dashboard, &quit])
    .build()?;

let _tray = TrayIconBuilder::new()
    .tooltip("DNA Companion")
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .on_menu_event(|app, event| {
        match event.id().as_ref() {
            "show_hide" => {
                if let Some(widget) = app.get_webview_window("widget") {
                    if widget.is_visible().unwrap_or(false) {
                        let _ = widget.hide();
                    } else {
                        let _ = widget.show();
                        let _ = widget.set_focus();
                    }
                }
            }
            "dashboard" => {
                open_dashboard(app.clone());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        }
    })
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            let app = tray.app_handle();
            if let Some(widget) = app.get_webview_window("widget") {
                if widget.is_visible().unwrap_or(false) {
                    let _ = widget.hide();
                } else {
                    let _ = widget.show();
                    let _ = widget.set_focus();
                }
            }
        }
    })
    .build(app)?;
```

Note: add `use tauri::menu::{MenuBuilder, MenuItemBuilder};` to the top of the file.

- [ ] **Step 2: Compile and verify**

```bash
cd src-tauri && cargo check
```

Expected: Compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add tray context menu with show/hide, dashboard, and quit"
```

---

### Task 5: Backend Sidecar Setup

Configure Tauri to spawn the Node.js backend as a sidecar process so the entire app is self-contained.

**Files:**
- Create: `src/web/widget/start-backend.js` (tiny script to check if backend is already running)
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add backend spawn logic to lib.rs**

In `lib.rs` inside the `setup` closure, after the tray setup and before the autostart block, add:

```rust
// Spawn Node.js backend
use tauri_plugin_shell::ShellExt;
let shell = app.shell();
let (mut _rx, _child) = shell
    .command("npx")
    .args(["tsx", "src/index.ts"])
    .spawn()
    .expect("Failed to start DNA backend");

// Log backend output
tauri::async_runtime::spawn(async move {
    use tauri_plugin_shell::process::CommandEvent;
    while let Some(event) = _rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let s = String::from_utf8_lossy(&line);
                log::info!("[backend] {}", s.trim());
            }
            CommandEvent::Stderr(line) => {
                let s = String::from_utf8_lossy(&line);
                log::warn!("[backend] {}", s.trim());
            }
            CommandEvent::Terminated(status) => {
                log::error!("[backend] Process terminated: {:?}", status);
                break;
            }
            _ => {}
        }
    }
});
```

- [ ] **Step 2: Update shell plugin scope in tauri.conf.json**

In the `plugins.shell` section of `tauri.conf.json`, replace with:

```json
"shell": {
  "scope": [
    {
      "name": "npx",
      "cmd": "npx",
      "args": [
        "tsx",
        "src/index.ts"
      ]
    }
  ]
}
```

- [ ] **Step 3: Add shell scope permissions in capabilities**

In `src-tauri/capabilities/default.json`, add:

```json
"shell:allow-execute",
"shell:allow-spawn"
```

(These should already be there from Task 3, verify they exist.)

- [ ] **Step 4: Test with `npm run tauri:dev`**

Run: `npm run tauri:dev`

Expected: Tauri app launches, backend starts (visible in logs), widget window appears with Clippy character, tray icon appears. The widget should connect to the SSE feed and show "DNA is alive" in the ticker.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/
git commit -m "feat: spawn Node.js backend as Tauri sidecar process"
```

---

### Task 6: Polish Widget Position Persistence + Final Integration

Make the widget remember its position when dragged, and verify the full flow end-to-end.

**Files:**
- Modify: `src/web/widget/widget.js`

- [ ] **Step 1: Add position persistence to widget.js**

Add to the top of `widget.js`, after the state variables:

```javascript
// --- Position persistence ---
const POSITION_KEY = "dna-widget-position";

function savePosition() {
  if (window.__TAURI__) {
    window.__TAURI__.core.invoke("plugin:window|position").catch(() => {});
  }
}

// Restore position on load (Tauri handles this via window config, but we save for next launch)
window.addEventListener("beforeunload", savePosition);
```

Note: Tauri handles window positioning via the config `x`/`y` values. For user-dragged positions to persist across restarts, we'd need to save them via Tauri's `window.outerPosition()` and store to a local file. For v1, the config default position is sufficient. This step can be enhanced later.

- [ ] **Step 2: End-to-end integration test**

Run: `npm run tauri:dev`

Verify:
1. Tray icon appears in system tray
2. Widget window shows with Clippy character bouncing
3. Right-click tray → context menu with Show/Hide, Dashboard, Quit
4. Left-click tray → toggles widget visibility
5. Click Clippy → chat mode with input field
6. Type message → response appears in speech bubble
7. Escape → back to idle mode with ticker
8. Tray → Open Dashboard → dashboard window opens
9. Tray → Quit → app closes

- [ ] **Step 3: Commit**

```bash
git add src/web/widget/widget.js
git commit -m "feat: polish widget with position persistence"
```

---

### Task 7: Update Documentation

Update README and CLAUDE.md to reflect the desktop companion feature.

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add desktop companion section to CLAUDE.md**

Add to the Architecture section of `CLAUDE.md`:

```markdown
**Desktop Companion (Tauri):**
- `src-tauri/` — Tauri v2 shell: tray icon, two windows (widget + dashboard), sidecar backend spawn, autostart
- `src/web/widget/` — Retro Clippy-style floating widget: HTML/CSS/JS with pixel art character, notification ticker, mini chat
- `src/web/api-widget.ts` — Widget chat endpoint (`POST /api/widget/chat`) routing through engine.ts
- Widget uses chat ID `999999` with its own history/memory in `data/chats/999999/`
```

- [ ] **Step 2: Update README with desktop app instructions**

Add a "Desktop App" section to README.md with:
- `npm run tauri:dev` for development
- `npm run tauri:build` for release build
- Note about autostart on Windows
- Note about tray icon and widget behavior

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add desktop companion documentation"
```
