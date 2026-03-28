import cron from "node-cron";
import { getDueReminders, markNotified, scheduleNextOccurrence, cleanupNotified } from "./reminders.js";
import { chatPaths, loadConfig, CHATS_DIR } from "./config.js";
import { summarizeAllMemory } from "./memory.js";
import { logger } from "./logger.js";
import { readdirSync, existsSync } from "fs";
import type { Bot } from "grammy";

interface SchedulerDeps {
  bot: Bot;
}

/** Returns all chat IDs that have a data folder. */
function getActiveChatIds(): number[] {
  if (!existsSync(CHATS_DIR)) return [];
  return readdirSync(CHATS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => Number(d.name))
    .filter((id) => !isNaN(id));
}

/** Starts cron jobs: reminders every minute, cleanup + summarization daily at 3am. */
export function startScheduler(deps: SchedulerDeps): void {
  cron.schedule("* * * * *", async () => {
    for (const chatId of getActiveChatIds()) {
      const paths = chatPaths(chatId);
      const due = getDueReminders(paths.remindersPath);
      for (const reminder of due) {
        try {
          const recurLabel = reminder.recurring ? ` (${reminder.recurring})` : "";
          await deps.bot.api.sendMessage(chatId, `Reminder: ${reminder.text}${recurLabel}`);
          markNotified(paths.remindersPath, reminder.id);
          if (reminder.recurring) {
            scheduleNextOccurrence(paths.remindersPath, reminder.id);
          }
          logger.info(`Reminder sent: "${reminder.text}"`, chatId, "scheduler");
        } catch (error) {
          logger.error(`Failed to send reminder ${reminder.id}: ${error}`, chatId, "scheduler");
        }
      }
    }
  });

  cron.schedule("0 3 * * *", async () => {
    for (const chatId of getActiveChatIds()) {
      const paths = chatPaths(chatId);
      cleanupNotified(paths.remindersPath);
      const count = await summarizeAllMemory(paths.memoryDir);
      if (count > 0) {
        logger.info(`Summarized ${count} memory file(s)`, chatId, "memory");
      }
    }
  });
}
