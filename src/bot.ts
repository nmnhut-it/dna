import { Bot, Context } from "grammy";
import { processMessage } from "./engine.js";
import { appendHistory, getTodayFileName } from "./history.js";
import { join } from "path";
import { DATA_DIR } from "./config.js";

const MEMORY_DIR = join(DATA_DIR, "memory");
const HISTORY_DIR = join(DATA_DIR, "history");
const REMINDERS_PATH = join(DATA_DIR, "reminders", "active.json");

interface BotDeps {
  token: string;
  allowedUserId: number;
  historyLimit: number;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== deps.allowedUserId) {
      return;
    }
    await next();
  });

  bot.on("message:text", async (ctx: Context) => {
    const userMessage = ctx.message!.text!;
    const today = getTodayFileName();
    const timestamp = new Date().toISOString();

    appendHistory(HISTORY_DIR, today, { role: "user", content: userMessage, timestamp });

    const paths = {
      memoryDir: MEMORY_DIR,
      historyDir: HISTORY_DIR,
      remindersPath: REMINDERS_PATH,
      historyLimit: deps.historyLimit,
    };

    try {
      const result = processMessage(userMessage, paths);
      appendHistory(HISTORY_DIR, today, { role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
      await ctx.reply(result.reply);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Engine error:", errMsg);
      await ctx.reply("Sorry, I had trouble processing that. Please try again.");
    }
  });

  return bot;
}
