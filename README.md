# DNA — Definitely Not Assistant

A personal companion bot powered by Claude CLI and Telegram, with per-chat memory, reminders, configurable personality, and a web dashboard.

## Features

- **Chat** — natural conversation via Telegram, streaming responses
- **Memory** — remembers facts and preferences per chat, keyword-based relevant loading
- **Reminders** — one-time or recurring (daily/weekly/monthly) via natural language
- **Per-chat config** — personality, tool permissions, action approval per chat/group
- **Web dashboard** — live feed, chat history, memory editor, reminder management, per-chat settings
- **Group chat support** — responds when @mentioned, configurable memory/actions per group
- **Auto-summarization** — history summarized every 10 messages, memory files summarized when large

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

5. On first run, enter your bot token when prompted. A pairing code appears — send `/start <code>` to your bot on Telegram to claim ownership.

You can also set `TELEGRAM_BOT_TOKEN` as an environment variable to skip the prompt.

## Usage

Message your bot on Telegram:

- "Remember that I like dark roast coffee"
- "Remind me about standup tomorrow at 9am"
- "What do you know about me?"
- General chat and questions

### Web Dashboard

Open `http://localhost:3000` to access:
- **Live feed** — real-time messages and logs with filtering
- **Chats** — per-chat history, memory, reminders, and config management
- **Settings** — manage allowed chats, bot config, notifications

## Per-Chat Configuration

Each chat gets its own folder under `data/chats/<chatId>/` with independent:
- **Personality** — `default` (professional) or `casual-vi` (Vietnamese casual)
- **Allowed tools** — which Claude tools are available (WebSearch, WebFetch, Read)
- **Actions** — whether memory/reminder actions are enabled
- **Confirmation** — whether the owner must approve actions via inline keyboard
- **Memory** — whether memory is loaded into context

Configure per chat via the web dashboard or `data/chats/<chatId>/config.json`.

## Testing

```bash
npm test              # All tests (unit + integration)
```

Integration tests call the real Claude CLI subprocess to verify action markers are emitted correctly.
