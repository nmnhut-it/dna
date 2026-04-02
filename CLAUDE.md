# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DNA — a personal AI companion bot powered by Claude CLI and Telegram, with two-tier memory (per-user + per-chat), reminders, configurable personality, and a web dashboard.

## Commands

```bash
npm run dev          # Start bot (tsx src/index.ts)
npm run build        # Compile TypeScript (tsc)
npm test             # Run tests (vitest run)
npm run tauri:dev    # Tauri desktop dev
npm run tauri:build  # Tauri desktop release
```

## Architecture

**Data flow:** Telegram message → bot.ts (auth: allowedIds OR allowed sender) → engine.ts (assemble context with user memory + chat memory + sliding history + summary, spawn `claude -p` subprocess) → actions.ts (parse `[ACTION:TYPE]` markers) → bot.ts (owner confirmation if required, then execute) → streamed response back to Telegram.

**Key modules:**
- `src/index.ts` — Entry point: interactive setup or env var config, boots bot, web server, scheduler
- `src/bot.ts` — grammY handler; pairing via `/start <code>`, owner commands (/settings, /personality, /tools, /toggle, /memory, /prompt, /adduser, /removeuser), streaming edits, action confirmation with inline keyboards
- `src/engine.ts` — Spawns `claude -p --no-session-persistence --permission-mode acceptEdits` with per-chat tool permissions and `--add-dir` + `cwd` set to chat folder; 3 retries with backoff, 5min timeout; logs full prompt to `last-prompt.md`
- `src/system-prompt.ts` — Dynamic system prompt with personality presets (`default`, `casual-vi`), merged user+chat memory, history; strong action marker instructions with examples; auto-memory instructions (every 2 turns)
- `src/actions.ts` — Regex parser for `[ACTION:REMEMBER|FORGET|REMIND|REACT ...]` markers
- `src/memory.ts` — Keyword-based relevant memory loading; auto-summarization via Claude CLI for files >30 bullets
- `src/reminders.ts` — JSON reminders with recurrence; auto-cleanup of notified one-time reminders
- `src/scheduler.ts` — Dynamically discovers all chat folders; reminders every minute, memory summarization + cleanup daily at 3am
- `src/history.ts` — Sliding window across day files; rolling summary every 10 messages
- `src/config.ts` — Global config + per-chat ChatConfig + per-user paths
- `src/logger.ts` — Structured logging with timestamps, categories, chat IDs; emits to SSE
- `src/web/` — Express server with per-chat REST APIs + chat config API + SSE live feed
- `src/web/api-widget.ts` — Widget chat endpoint (`POST /api/widget/chat`) routing through engine.ts

**Desktop Companion (Tauri):**
- `src-tauri/` — Tauri v2 shell: tray icon, two windows (widget + dashboard), sidecar backend spawn, autostart
- `src/web/widget/` — Retro Clippy-style floating widget: HTML/CSS/JS with pixel art character, notification ticker, mini chat
- Widget uses chat ID `999999` with its own history/memory in `data/chats/999999/`

**Two-tier memory:**
- `data/users/<userId>/memory/` — personal facts that follow a user across all chats (category prefix: `user/`)
- `data/chats/<chatId>/memory/` — chat-specific context (no prefix)

**Per-chat folder tree** (`data/chats/<chatId>/`):
```
config.json      # ChatConfig: personality, tools, permissions
memory/          # Chat-scoped markdown memory files
history/         # Daily JSON + summary.json
reminders.json   # Active reminders
tmp/             # Downloaded Telegram files
last-prompt.md   # Debug: last full prompt sent to Claude
```

## Bootstrapping

- First run: prompts for Telegram bot token (or reads `TELEGRAM_BOT_TOKEN` env var)
- Displays 6-digit pairing code (auto-copied to clipboard)
- Owner sends `/start <code>` in Telegram to claim ownership
- Per-chat and per-user dirs created automatically on first message

## Group Chat Behavior

- Responds when @mentioned or replied to
- Auth: any message from a user in `allowedIds` passes
- Owner commands work in groups too
- Memory/actions controlled by per-chat ChatConfig (default: memory off, actions off for groups)

## Conventions

- Personality presets in `PERSONALITIES` map in system-prompt.ts; owner gets `casual-vi`, others get `default`
- Responses target ~50 words unless explaining something complex
- Action markers stripped from output; REACT always immediate, others go through confirmation if configured
- `user/` prefix on category routes memory to user-level storage; plain categories go to chat-level
- Auto-memory: Claude proactively saves noteworthy facts every 2 user messages
- All logging through `src/logger.ts` with `[HH:MM:SS] [category] [chat:ID] message` format
- Bot commands registered with Telegram on startup via `setMyCommands`
