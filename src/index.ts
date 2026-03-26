import { loadConfig, saveConfig, DATA_DIR } from "./config.js";
import { createBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { createWebServer } from "./web/server.js";
import { join } from "path";
import { mkdirSync } from "fs";

const config = loadConfig();

mkdirSync(join(DATA_DIR, "memory", "topics"), { recursive: true });
mkdirSync(join(DATA_DIR, "history"), { recursive: true });
mkdirSync(join(DATA_DIR, "reminders"), { recursive: true });

const bot = createBot({
  token: config.telegramBotToken,
  allowedIds: config.allowedIds,
  ownerId: config.ownerId,
  pairSecret: config.pairSecret,
  historyLimit: config.historyLimit,
  onPair: () => {
    console.log("Allowlist changed, saving config...");
    saveConfig(config);
  },
});

createWebServer(config.webPort);

startScheduler({
  remindersPath: join(DATA_DIR, "reminders", "active.json"),
  bot,
  chatIds: config.allowedIds,
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
