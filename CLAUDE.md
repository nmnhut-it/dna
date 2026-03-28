# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DNA — a personal companion bot powered by Claude CLI and Telegram, with per-chat memory, reminders, configurable personality, and a web dashboard.

## Commands

```bash
npm run dev          # Start bot (tsx src/index.ts)
npm run build        # Compile TypeScript (tsc)
npm test             # Run tests (vitest run)
npm run tauri:dev    # Tauri desktop dev
npm run tauri:build  # Tauri desktop release
```

## Architecture

**Data flow:** Telegram message → bot.ts (auth: allowedIds OR allowed sender in group) → engine.ts (assemble context with relevant memory + sliding history + summary, spawn `claude -p` subprocess) → actions.ts (parse `[ACTION:TYPE]` markers) → bot.ts (owner confirmation if required, then execute) → streamed response back to Telegram.

**Key modules:**
- `src/index.ts` — Entry point: interactive setup or env var config, boots bot, web server, scheduler
- `src/bot.ts` — grammY handler; pairing via `/start <code>`, streaming edits, action confirmation with inline keyboards, owner-only approval
- `src/engine.ts` — Spawns `claude -p --no-session-persistence` with per-chat tool permissions; 3 retries with backoff, 5min timeout
- `src/system-prompt.ts` — Dynamic system prompt with personality presets (`default`, `casual-vi`), memory, reminders, history; strong action marker instructions with examples
- `src/actions.ts` — Regex parser for `[ACTION:REMEMBER|FORGET|REMIND|REACT ...]` markers
- `src/memory.ts` — Keyword-based relevant memory loading (root files always, topic files by keyword match); auto-summarization of files exceeding 30 bullet points via Claude CLI
- `src/reminders.ts` — JSON reminders with daily/weekly/monthly recurrence; auto-cleanup of notified one-time reminders
- `src/scheduler.ts` — Dynamically discovers all chat folders; reminders every minute, memory summarization + cleanup daily at 3am
- `src/history.ts` — Sliding window across day files; rolling summary (every 10 messages, Claude summarizes older ones into `summary.json`)
- `src/config.ts` — Global config + per-chat `ChatConfig` (personality, allowedTools, allowActions, actionsRequireConfirmation, loadMemory)
- `src/logger.ts` — Structured logging with timestamps, categories, chat IDs; emits to SSE event bus
- `src/web/` — Express server with per-chat REST APIs + SSE live feed

**Per-chat folder tree** (`data/chats/<chatId>/`):
```
config.json      # ChatConfig: personality, tools, permissions
memory/          # Markdown files (facts.md, preferences.md, topics/*.md)
history/         # Daily JSON + summary.json (rolling conversation summary)
reminders.json   # Active reminders for this chat
tmp/             # Downloaded Telegram files
```

## Bootstrapping

- First run: prompts for Telegram bot token (or reads `TELEGRAM_BOT_TOKEN` env var)
- Displays 6-digit pairing code (auto-copied to clipboard)
- Owner sends `/start <code>` in Telegram to claim ownership
- Per-chat dirs created automatically on first message

## Group Chat Behavior

- Responds when @mentioned or replied to
- Auth: any message from a user in `allowedIds` passes (group ID doesn't need to be in the list)
- Memory/actions controlled by per-chat `ChatConfig.loadMemory` and `ChatConfig.allowActions` (default: memory off, actions off for groups)

## Conventions

- Personality presets defined in `PERSONALITIES` map in system-prompt.ts; owner gets `casual-vi`, others get `default` (professional)
- Action markers are stripped from displayed output; REACT always executes immediately, other actions go through confirmation if `actionsRequireConfirmation` is true
- Memory: root-level .md files always loaded, topic files loaded only when topic name appears in recent messages
- History: sliding window loads last N messages across days; rolling summary prepended as system message
- Reminders use local ISO-8601 datetime (no timezone suffix); recurrence uses fixed day counts (1/7/30)
- All logging through `src/logger.ts` with `[HH:MM:SS] [category] [chat:ID] message` format
