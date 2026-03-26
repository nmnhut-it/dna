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

## Testing

```bash
npm test
```
