# DNA — Definitely Not Assistant

A personal AI companion powered by Claude CLI and Telegram, with per-chat and per-user memory, reminders, configurable personality, and a web dashboard.

## Features

- **Chat** — natural conversation via Telegram with streaming responses
- **Two-tier memory** — per-user memory (follows a person across chats) + per-chat memory (stays in one conversation)
- **Auto-memory** — proactively saves noteworthy facts every 2 messages without being asked
- **Reminders** — one-time or recurring (daily/weekly/monthly) via natural language, auto-cleanup
- **History** — sliding window across days with rolling conversation summaries
- **Per-chat config** — personality, tool permissions, action approval, memory toggle
- **File access** — Claude can read/write files scoped to each chat's folder
- **Owner commands** — manage settings, personality, tools, memory, users from Telegram
- **Web dashboard** — live feed with log filtering, per-chat management
- **Group chat** — responds when @mentioned, auth by sender ID, configurable per group
- **Easy setup** — paste bot token, send a pairing code, done

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Get a Telegram bot token from [@BotFather](https://t.me/BotFather)

3. Ensure `claude` CLI is installed and authenticated

4. Start DNA:
   ```bash
   npm run dev
   ```

5. On first run, enter your bot token (or set `TELEGRAM_BOT_TOKEN` env var). A pairing code appears — send `/start <code>` to your bot on Telegram.

## Usage

Message your bot on Telegram:

- "Remember that I like dark roast coffee"
- "Remind me about standup tomorrow at 9am"
- "What do you know about me?"
- General chat and questions

### Memory System

| Type | Scope | Category prefix | Example |
|------|-------|-----------------|---------|
| User memory | Follows the person across all chats | `user/` | `user/preferences`, `user/facts` |
| Chat memory | Stays in one chat | (none) | `facts`, `topics/work` |

The bot auto-saves noteworthy facts every 2 messages — personal details, preferences, plans — without needing to be asked.

### Owner Commands

| Command | Description |
|---------|-------------|
| `/settings` | View current chat config |
| `/personality <preset>` | Set personality (`default`, `casual-vi`) |
| `/tools <list>` | Set allowed tools |
| `/toggle actions\|confirm\|memory` | Toggle features on/off |
| `/memory` | View user + chat memory |
| `/prompt` | View last system prompt sent to Claude |
| `/adduser <id>` | Allow a user |
| `/removeuser <id>` | Revoke access |

Commands work in both private and group chats (owner only). In groups with privacy mode on, use `/command@botname`.

### Web Dashboard

Open `http://localhost:3000`:
- **Live** — real-time messages and structured logs with filtering
- **Chats** — per-chat sub-tabs: history, memory, reminders, config
- **Settings** — manage allowed users, bot-level config

## Data Structure

```
data/
├── config.json                    # bot token, allowed users, settings
├── chats/<chatId>/                # per-chat isolation
│   ├── config.json                # personality, tools, permissions
│   ├── memory/                    # chat-scoped memory
│   ├── history/                   # daily JSON + summary.json
│   ├── reminders.json
│   ├── tmp/                       # downloaded files
│   └── last-prompt.md             # debug: last prompt sent to Claude
└── users/<userId>/                # per-user (cross-chat)
    └── memory/                    # user-scoped memory
```

## Testing

```bash
npm test
```

Includes unit tests and integration tests that call the real Claude CLI.
