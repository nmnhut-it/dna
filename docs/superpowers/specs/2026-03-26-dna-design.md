# Definitely Not Assistant (DNA) — Design Spec

## Overview

DNA is a personal companion that runs as a single Node.js process on your local machine. It uses Claude CLI (`claude -p`) as the AI brain, communicates with you via a Telegram bot, and can optionally control Telegram Desktop via an Electron MCP server.

## Architecture

Single Node.js process with four components:

- **Telegram Bot (grammY)** — receives/sends messages via Bot API
- **Claude Engine** — spawns `claude -p` per message with assembled context
- **Scheduler (node-cron)** — checks reminders every minute, sends proactive messages
- **Electron MCP Client** — connects to Telegram Desktop for real-account interactions

```
┌─────────────────────────────────────────────┐
│              DNA (single Node.js process)    │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Telegram  │  │ Scheduler│  │ Electron  │  │
│  │ Bot      │  │ (cron)   │  │ MCP Client│  │
│  │ (grammY) │  │          │  │           │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │              │              │         │
│       ▼              ▼              ▼         │
│  ┌──────────────────────────────────────┐    │
│  │          Message Router              │    │
│  └──────────────────┬───────────────────┘    │
│                     ▼                        │
│  ┌──────────────────────────────────────┐    │
│  │       Claude Engine                  │    │
│  │  (spawns `claude -p` per message)    │    │
│  │  - assembles context                 │    │
│  │  - manages system prompt             │    │
│  │  - parses response                   │    │
│  └──────────────────┬───────────────────┘    │
│                     ▼                        │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Memory  │ │ History  │ │  Reminders   │  │
│  │ (md)    │ │ (json)   │ │  (json)      │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
│                                              │
│              data/ (local files)              │
└─────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Telegram:** grammY
- **AI:** Claude CLI (`claude -p`), spawned per message
- **Scheduling:** node-cron
- **MCP:** Electron MCP client (for Telegram Desktop control)
- **Storage:** Local markdown and JSON files

## Data Model

```
data/
├── memory/
│   ├── facts.md          # things DNA knows about you
│   ├── preferences.md    # your preferences
│   └── topics/           # per-topic memory files
│       └── work.md
├── history/
│   └── 2026-03-26.json   # daily conversation logs
├── reminders/
│   └── active.json       # active reminders
└── config.json            # bot token, settings, telegram user ID
```

### History format (per day)

```json
[
  {"role": "user", "content": "...", "timestamp": "..."},
  {"role": "assistant", "content": "...", "timestamp": "..."}
]
```

### Reminders format

```json
[
  {
    "id": "r1",
    "text": "standup meeting",
    "datetime": "2026-03-26T09:00:00",
    "recurring": "daily",
    "notified": false
  }
]
```

## Claude Engine

Message processing flow:

1. **Load context** — read memory files, today's history (last 20 messages), active reminders
2. **Build system prompt** — identity, current date/time, memory summary, active reminders
3. **Spawn `claude -p`** — pipe assembled prompt + user message
4. **Parse response** — extract action markers from Claude's output
5. **Execute side effects** — update reminders/memory files
6. **Send reply** — strip action markers, send text to Telegram

### Action markers

Claude uses inline markers to trigger side effects:

```
[ACTION:REMIND text="standup meeting" datetime="2026-03-27T09:00:00" recurring="daily"]
[ACTION:REMEMBER category="preferences" content="likes dark roast coffee"]
[ACTION:FORGET category="preferences" content="likes tea"]
```

### Context window management

To keep context reasonable, include:
- All memory files (kept small by design)
- Last 20 messages from today's history (configurable)
- Active reminders summary

## Telegram Bot

- **Library:** grammY
- **Auth:** accepts messages only from configured user ID
- **Input:** text messages (voice transcription as future enhancement)
- **Commands:** `/remind`, `/memory`, `/forget` as shortcuts; natural language also works
- **Proactive messages:** sends reminders when they come due

## Electron MCP Client

- Connects to an MCP server controlling Telegram Desktop
- Use cases:
  - Read messages from other chats/groups on your real account
  - Forward or react to messages as your real account
  - Answer questions like "what did John say in the group chat?"
- Falls back gracefully if Telegram Desktop is not running

## Scheduler

- Runs via node-cron, checking every minute
- Reads `data/reminders/active.json` for due items
- Sends due reminders via Telegram bot
- Marks reminders as notified
- Handles recurring reminders by scheduling next occurrence

## Deployment

- Runs on local machine (Windows 11)
- Started manually or as a startup script
- Requires: Node.js, Claude CLI installed and authenticated, Telegram Desktop (optional, for MCP features)
