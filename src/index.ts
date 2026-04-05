import { randomInt } from "crypto";
import { execSync } from "child_process";
import { initConfig } from "./config.js";
import { createBot } from "./bot.js";
import { startScheduler } from "./scheduler.js";
import { createWebServer } from "./web/server.js";
import { logger } from "./logger.js";
import { flushAll } from "./history.js";

function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    if (platform === "win32") execSync("clip", { input: text });
    else if (platform === "darwin") execSync("pbcopy", { input: text });
    else execSync("xclip -selection clipboard", { input: text });
    return true;
  } catch { return false; }
}

const config = await initConfig();

const needsPairing = config.ownerId === 0;
const pairingCode = needsPairing
  ? String(randomInt(100000, 999999))
  : undefined;

const bot = createBot({
  token: config.telegramBotToken,
  config,
  historyLimit: config.historyLimit,
  pairingCode,
});

createWebServer(config.webPort);

startScheduler({ bot });

if (needsPairing) {
  const command = `/start ${pairingCode}`;
  const copied = copyToClipboard(command);
  logger.info(`Pairing code: ${pairingCode}`, undefined, "system");
  logger.info(`Open Telegram and send: ${command}${copied ? " (copied to clipboard)" : ""}`, undefined, "system");
}

bot.start({
  onStart: () => {
    logger.info("DNA is alive. Listening for messages...", undefined, "system");
  },
});

process.on("SIGINT", () => {
  logger.info("DNA shutting down...", undefined, "system");
  flushAll();
  bot.stop();
  process.exit(0);
});
