# DNA Desktop Companion — Design Spec

## Overview

Transform DNA into a Windows desktop companion app inspired by Clippy. The app runs on startup, lives in the system tray, and displays a floating retro-styled character widget with a notification ticker and expandable mini chat.

## Goals

- Run DNA automatically on Windows boot with zero manual steps
- Provide a persistent, always-visible floating widget (Clippy homage)
- Show live notifications (messages, reminders) in a ticker below the character
- Allow quick chat interaction via speech bubbles without opening the full dashboard
- Keep the full dashboard accessible via tray menu or widget button

## Components

### 1. System Tray

- Tray icon using Tauri's tray API (`@tauri-apps/plugin-tray`)
- Context menu items:
  - **Show/Hide Clippy** — toggles the floating widget visibility
  - **Open Dashboard** — opens the dashboard window
  - **Quit** — shuts down backend + exits app
- Left-click on tray icon toggles widget visibility

### 2. Floating Widget (Frameless Window)

- **Size**: ~200x250px default, expands to ~200x400px in chat mode
- **Window properties**: frameless, always-on-top, transparent background, skip taskbar
- **Draggable**: entire widget is draggable, position saved to localStorage
- **Two states**: idle and chat (see below)

#### Idle State

- Pixelated/cartoon DNA character with CSS sprite idle animation (blinking, slight bounce)
- Below character: scrolling notification ticker (1-2 lines)
  - Shows recent Telegram messages and triggered reminders
  - Data source: SSE feed from Express server (`/events`)
  - Auto-scrolls through recent items, fades old ones
- Click character → transition to chat state

#### Chat State

- Character shrinks slightly, moves to bottom-left
- Speech bubble area above character shows last ~5 messages
- Text input at bottom with send button
- Messages sent via POST to Express API (new `/api/widget/chat` endpoint)
- Responses appear as speech bubbles with typing indicator
- Escape key or close button → collapse back to idle state

### 3. Mini Chat API

- New endpoint: `POST /api/widget/chat` with `{ message: string }`
- Routes through the existing engine (`engine.ts`) using a dedicated widget chat context
- Returns the response as JSON `{ reply: string }`
- Uses a fixed chat ID (e.g., `widget-local`) with its own history/memory folder
- No Telegram involvement — direct local interaction

### 4. Dashboard Window

- Separate Tauri window (standard, resizable, not always-on-top)
- Loads existing dashboard from `http://localhost:3000`
- Opened via: tray menu "Open Dashboard" or button in widget
- Can be closed independently without affecting tray/widget

### 5. Windows Startup

- Use `@tauri-apps/plugin-autostart` to register with Windows startup
- Configurable: tray menu toggle or dashboard setting to enable/disable autostart
- Default: enabled on first install

### 6. Backend Lifecycle

- Tauri app spawns the Node.js backend as a sidecar child process on launch
- Backend command: `node dist/index.ts` (or bundled with `tsx`)
- Tauri monitors the child process, restarts on crash
- On app quit: gracefully shuts down backend (SIGTERM → timeout → SIGKILL)

## File Structure (New/Modified)

```
src/web/widget/              # NEW — widget frontend
  index.html                 # Widget HTML
  widget.js                  # Widget logic (SSE, chat, state management)
  widget.css                 # Retro pixel styling, animations
  clippy.png                 # Sprite sheet for character
src/web/api-widget.ts        # NEW — widget chat endpoint
src/web/server.ts            # MODIFIED — mount widget API + serve widget static files
src-tauri/tauri.conf.json    # MODIFIED — two windows, tray config, autostart
src-tauri/src/lib.rs         # MODIFIED — tray setup, window management, sidecar spawn
src-tauri/Cargo.toml         # MODIFIED — add tray + autostart plugin deps
```

## Tech Stack

- **Desktop shell**: Tauri v2 (already in project)
- **Widget UI**: Vanilla HTML/CSS/JS (matches existing dashboard approach)
- **Retro art**: CSS pixel art or a sprite sheet PNG with CSS animations
- **Tray**: `@tauri-apps/plugin-tray` (Tauri v2 plugin)
- **Autostart**: `@tauri-apps/plugin-autostart` (Tauri v2 plugin)
- **Backend**: Existing Node.js process, spawned as Tauri sidecar

## What Stays Unchanged

- Telegram bot, grammY handlers, bot.ts
- Engine, memory, reminders, history, scheduler
- Existing dashboard UI (loaded as-is in dashboard window)
- All data folder structures

## Edge Cases

- **Port conflict**: If port 3000 is taken, show error in tray notification
- **Backend crash**: Tauri restarts sidecar, widget shows "reconnecting..." state
- **Multiple instances**: Tauri single-instance plugin prevents duplicate launches
- **No internet**: Bot won't connect to Telegram, but widget chat still works locally if Claude CLI is available

## Out of Scope

- Custom character editor/skins (future enhancement)
- Mac/Linux support (Windows-only for now)
- Voice interaction
- Widget resize/scaling options
