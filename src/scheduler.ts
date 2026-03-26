import cron from "node-cron";
import { getDueReminders, markNotified, scheduleNextOccurrence } from "./reminders.js";
import type { Bot } from "grammy";

interface SchedulerDeps {
  remindersPath: string;
  bot: Bot;
  chatIds: number[];
}

export function startScheduler(deps: SchedulerDeps): cron.ScheduledTask {
  return cron.schedule("* * * * *", async () => {
    const due = getDueReminders(deps.remindersPath);
    for (const reminder of due) {
      try {
        const recurLabel = reminder.recurring ? ` (${reminder.recurring})` : "";
        for (const chatId of deps.chatIds) {
          await deps.bot.api.sendMessage(chatId, `Reminder: ${reminder.text}${recurLabel}`);
        }
        markNotified(deps.remindersPath, reminder.id);
        if (reminder.recurring) {
          scheduleNextOccurrence(deps.remindersPath, reminder.id);
        }
      } catch (error) {
        console.error(`Failed to send reminder ${reminder.id}:`, error);
      }
    }
  });
}
