# DNA — Definitely Not (an) Assistant

> "It's not an assistant. It just remembers everything you say, sets your reminders, manages your files, and responds to you 24/7. Totally different."

A personal AI companion powered by Claude CLI and Telegram. It remembers you better than you remember yourself, nags you about things you asked to be nagged about, and has opinions.

## What It Does (It's Not Assisting, It's Vibing)

- **Talks to you** — via Telegram, like a friend who never sleeps and always has an answer
- **Remembers things** — two-tier memory: stuff about *you* (follows you everywhere) and stuff about *this chat* (stays here)
- **Auto-remembers** — picks up on your preferences, plans, and habits without being asked. Creepy? Maybe. Useful? Absolutely.
- **Reminds you** — one-time or recurring. Will not judge you for needing a reminder to drink water.
- **Reads & writes files** — scoped to each chat's folder, because boundaries matter
- **Works in groups** — responds when @mentioned, keeps its mouth shut otherwise
- **Has a dashboard** — live feed, memory viewer, config editor. Very fancy. `localhost:3000`.
- **Easy setup** — paste a token, type a code, done. Your boss could do it.

## Setup (3 Minutes, We Timed It)

```bash
npm install
npm run dev
```

First run asks for your Telegram bot token (get one from [@BotFather](https://t.me/BotFather)). Then it shows a pairing code — send `/start <code>` to your bot. That's it. You're the owner now. Congratulations, it's a bot.

You'll also need the `claude` CLI installed and authenticated. DNA is just the personality layer — Claude does the actual thinking.

## Talking To It

Message your bot on Telegram. It'll figure out the rest.

- "Remember that I like dark roast coffee" — saved to your permanent record
- "Remind me about standup tomorrow at 9am" — it will. relentlessly.
- "What do you know about me?" — prepare to be impressed (or unsettled)
- Anything else — it's a conversation, not a form

### The Memory System (It Remembers So You Don't Have To)

| Type | What it is | Category prefix |
|------|-----------|-----------------|
| **User memory** | Follows you across all chats. Your name, your coffee order, your life choices. | `user/` |
| **Chat memory** | Stays in one conversation. Project context, shared topics, group inside jokes. | (none) |

Auto-saves every ~2 messages. You don't need to say "remember this" — it just... notices.

### Owner Commands (You're In Charge)

| Command | What it does |
|---------|-------------|
| `/settings` | See what's going on |
| `/personality <preset>` | `default` (professional) or `casual-vi` (Vietnamese bestie mode) |
| `/tools <list>` | Control what Claude can use |
| `/toggle actions\|confirm\|memory` | Flip switches |
| `/memory` | See what it knows about you (brace yourself) |
| `/prompt` | See the actual prompt sent to Claude. Educational. |
| `/adduser <id>` | Let someone else talk to your bot |
| `/removeuser <id>` | Revoke that privilege |

Works in groups too. Only the owner can use these — everyone else gets politely ignored.

### The Dashboard

`http://localhost:3000` — because sometimes you want a GUI.

- **Live** — watch messages and logs scroll by in real-time
- **Chats** — per-chat history, memory, reminders, config
- **Settings** — manage who's allowed in

## Where It Keeps Its Stuff

```
data/
├── config.json                    # the basics
├── chats/<chatId>/                # each chat gets its own universe
│   ├── config.json                # personality, permissions
│   ├── memory/                    # what it remembers about this chat
│   ├── history/                   # conversation logs + rolling summaries
│   ├── reminders.json             # the nagging schedule
│   ├── tmp/                       # downloaded files
│   └── last-prompt.md             # for the curious (or debugging)
└── users/<userId>/                # follows the human, not the chat
    └── memory/                    # the permanent record
```

## Testing

```bash
npm test
```

86 tests including integration tests that talk to real Claude. Yes, we test against the actual AI. No mocks were harmed.
