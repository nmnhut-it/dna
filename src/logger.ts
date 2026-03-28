/** Structured logger with timestamps, chat context, and categories. */
import { eventBus } from "./web/event-bus.js";

type Level = "info" | "warn" | "error";
type Category = "bot" | "engine" | "memory" | "scheduler" | "web" | "system";

function formatTime(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(level: Level, msg: string, chatId?: number, category?: Category): void {
  const prefix = `[${formatTime()}]`;
  const cat = category ? ` [${category}]` : "";
  const ctx = chatId ? ` [chat:${chatId}]` : "";
  const line = `${prefix}${cat}${ctx} ${msg}`;

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  eventBus.emit("chat", {
    type: "log",
    chatId: chatId ?? 0,
    role: level,
    content: `${cat ? `[${category}] ` : ""}${msg}`,
    timestamp: new Date().toISOString(),
  });
}

export const logger = {
  info: (msg: string, chatId?: number, category?: Category) => log("info", msg, chatId, category),
  warn: (msg: string, chatId?: number, category?: Category) => log("warn", msg, chatId, category),
  error: (msg: string, chatId?: number, category?: Category) => log("error", msg, chatId, category),

  bot: (msg: string, chatId?: number) => log("info", msg, chatId, "bot"),
  engine: (msg: string, chatId?: number) => log("info", msg, chatId, "engine"),
  memory: (msg: string, chatId?: number) => log("info", msg, chatId, "memory"),
  web: (msg: string) => log("info", msg, undefined, "web"),
};
