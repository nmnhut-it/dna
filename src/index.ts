import { loadConfig, DATA_DIR } from "./config.js";
import { createBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { join } from "path";
import { mkdirSync } from "fs";

const config = loadConfig();

mkdirSync(join(DATA_DIR, "memory", "topics"), { recursive: true });
mkdirSync(join(DATA_DIR, "history"), { recursive: true });
mkdirSync(join(DATA_DIR, "reminders"), { recursive: true });

const bot = createBot({
  token: config.telegramBotToken,
  allowedUserId: config.allowedUserId,
  historyLimit: config.historyLimit,
});

startScheduler({
  remindersPath: join(DATA_DIR, "reminders", "active.json"),
  bot,
  chatId: config.allowedUserId,
});

bot.start({
  onStart: () => {
    console.log("DNA is alive. Listening for messages...");
  },
});

process.on("SIGINT", () => {
  console.log("DNA shutting down...");
  bot.stop();
  process.exit(0);
});
