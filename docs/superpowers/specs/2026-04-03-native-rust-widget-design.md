# Native Rust Widget — Design Spec

## Overview

Replace the Tauri webview widget with a standalone Rust binary using egui/eframe. The widget connects to the existing Node.js backend via HTTP/SSE, runs cross-platform (Windows/macOS/Linux), and is fully configurable via a TOML config file. This eliminates the WebView2 border issues and removes the heavy Tauri dependency.

## Goals

- True transparent frameless window with no border artifacts
- Cross-platform: Windows, macOS, Linux
- Configurable appearance, behavior, position, backend connection, and startup
- Standalone binary — can be built/distributed independently of the Node.js backend
- Custom character skins via PNG swap

## Architecture

```
┌─────────────────┐     HTTP/SSE      ┌──────────────────┐
│  Rust Widget     │ ◄──────────────► │  Node.js Backend  │
│  (egui/eframe)   │  localhost:3000   │  (existing)       │
│                  │                   │                   │
│  - System tray   │                   │  - Telegram bot   │
│  - Floating char │                   │  - Express API    │
│  - Mini chat     │                   │  - SSE events     │
│  - Notification  │                   │  - Engine/Claude   │
│  - Config file   │                   │                   │
└─────────────────┘                   └──────────────────┘
```

The widget is a **separate crate** in `widget/` at the project root. It is a standalone binary that can be built and run independently.

## Components

### 1. System Tray (`tray-icon` + `muda` crates)

- Tray icon with context menu:
  - **Show/Hide Widget** — toggles floating window visibility
  - **Open Dashboard** — opens `http://{host}:{port}` in default browser
  - **Settings** — opens config file in default editor
  - **Quit** — exits the widget process
- Left-click on tray icon toggles widget visibility
- Tray icon uses the same PNG as the character skin (scaled down)

### 2. Floating Widget Window (egui/eframe)

- Frameless, transparent background, always-on-top (all configurable)
- Draggable anywhere on screen, position persisted to config on close
- Skip taskbar on all platforms
- Two states:

**Idle State:**
- Character image rendered at center (PNG loaded from skin path)
- Gentle bounce animation (vertical oscillation)
- Notification ticker below character — single line, auto-scrolls through recent events
- Click character → transition to chat state

**Chat State:**
- Character shrinks and moves to bottom-left corner
- Chat message area above character — last ~5 messages visible, scrollable
- Text input at bottom with send button
- Typing indicator while waiting for response
- Escape key or close button → collapse back to idle state

### 3. Mini Chat

- Messages sent via `POST http://{host}:{port}/api/widget/chat` with `{ "message": "..." }`
- Response: `{ "reply": "..." }`
- Chat history kept in memory (not persisted — the backend handles persistence via chat ID 999999)
- Non-blocking: UI remains responsive while waiting for response (async HTTP via tokio)

### 4. Notification Ticker (SSE Consumer)

- Connects to `GET http://{host}:{port}/api/events` as an EventSource
- Filters for `type: "message"` and `type: "log"` (warn level) events
- Displays latest event text in the ticker area below the character
- On new message event in idle mode: shows a speech bubble above the character for 5 seconds
- Auto-reconnects on connection loss with backoff

### 5. Configuration (`widget.toml`)

Located at `widget/widget.toml` (or `~/.config/dna/widget.toml` on Linux, `%APPDATA%/dna/widget.toml` on Windows). Falls back to defaults if missing.

```toml
[backend]
host = "localhost"
port = 3000

[appearance]
skin = "default"          # "default" uses bundled asset, or absolute path to custom PNG
size = 1.0                # scale factor (0.5 = half, 2.0 = double)
opacity = 0.95            # window opacity (0.0 - 1.0)
theme = "light"           # "light" | "dark" (affects chat bubbles and ticker)

[behavior]
always_on_top = true
auto_hide_seconds = 0     # seconds of idle before hiding widget (0 = never)
click_through = false     # if true, mouse events pass through the widget

[position]
x = 1650
y = 600
monitor = 0               # monitor index for multi-monitor setups

[startup]
auto_launch = true        # register with OS startup
start_minimized = false   # if true, start with widget hidden (tray only)
```

All fields have sensible defaults. The config is loaded on startup and saved on exit (to persist drag position changes).

### 6. Default Character Asset

- Ship a default `widget/assets/clippy.png` — the golden Clippy-style character
- The image is loaded at runtime and rendered as an egui texture
- Users can swap by setting `appearance.skin` to a path to any PNG file
- Character image should be ~200x240px with transparent background

## File Structure

```
widget/                    # NEW — standalone Rust crate
  Cargo.toml
  src/
    main.rs                # Entry point: load config, spawn tray, run eframe
    app.rs                 # egui App implementation (widget states, rendering)
    config.rs              # Config struct + TOML loading/saving
    tray.rs                # System tray setup and event handling
    chat.rs                # HTTP client for widget chat API
    sse.rs                 # SSE client for notification ticker
    theme.rs               # Light/dark theme colors
  assets/
    clippy.png             # Default character sprite
    icon.png               # Tray icon (32x32)
```

## Crate Dependencies

```toml
[dependencies]
eframe = { version = "0.31", features = ["default"] }
egui = "0.31"
reqwest = { version = "0.12", features = ["json"] }
eventsource-client = "0.13"
tray-icon = "0.19"
muda = "0.16"
serde = { version = "1", features = ["derive"] }
toml = "0.8"
image = "0.25"
auto-launch = "0.5"
dirs = "6"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
open = "5"              # open URLs in default browser
```

## What Gets Removed

- `src-tauri/` — entire Tauri setup (Rust code, Cargo workspace, config, capabilities, icons)
- `src/web/widget/` — HTML/CSS/JS widget frontend (replaced by Rust native)
- `@tauri-apps/cli` from `package.json` devDependencies
- `tauri:dev` and `tauri:build` npm scripts

## What Stays Unchanged

- `src/web/api-widget.ts` — the chat endpoint (Rust widget calls it via HTTP)
- `src/web/server.ts` — serves dashboard + all APIs (widget static mount removed)
- All other Node.js code: bot, engine, memory, history, reminders, scheduler
- Dashboard UI (`src/web/public/`)

## npm Script Changes

```json
{
  "widget:dev": "cd widget && cargo run",
  "widget:build": "cd widget && cargo build --release"
}
```

## Cross-Platform Notes

- **Windows**: eframe supports transparent frameless windows natively via WinAPI. No WebView2 dependency.
- **macOS**: NSWindow transparency works out of the box with eframe.
- **Linux**: Requires a compositor that supports transparency (most modern desktops do). Fallback: opaque background with rounded corners.
- **Tray**: `tray-icon` crate handles all three platforms.
- **Autostart**: `auto-launch` crate handles Windows registry, macOS LaunchAgent, Linux XDG autostart.

## Error Handling

- **Backend not running**: Ticker shows "Connecting..." with retry. Chat shows "Backend offline" on send attempt.
- **Config file missing**: Created with defaults on first run.
- **Invalid skin path**: Falls back to bundled default character.
- **SSE disconnect**: Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s).

## Out of Scope

- Animated sprite sheets (future enhancement — v1 uses a static PNG)
- Multiple simultaneous backend connections (v1 supports one backend per widget instance)
- Widget-to-widget communication
- Built-in skin editor
