import { Bot, Context } from "grammy";
import { processMessage } from "./engine.js";
import { appendHistory, getTodayFileName } from "./history.js";
import { downloadTelegramFile } from "./files.js";
import { join } from "path";
import { mkdirSync } from "fs";
import { DATA_DIR } from "./config.js";

const MEMORY_DIR = join(DATA_DIR, "memory");
const HISTORY_DIR = join(DATA_DIR, "history");
const REMINDERS_PATH = join(DATA_DIR, "reminders", "active.json");
const TMP_DIR = join(DATA_DIR, "tmp");

interface BotDeps {
  token: string;
  allowedIds: number[];
  ownerId: number;
  pairSecret: string;
  historyLimit: number;
  onPair: (id: number) => void;
}

function isGroupChat(chatId: number): boolean {
  return chatId < 0;
}

function chatHistoryDir(chatId: number): string {
  const dir = join(HISTORY_DIR, String(chatId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);

  bot.command("pair", async (ctx) => {
    const chatId = ctx.chat.id;
    if (deps.allowedIds.includes(chatId)) {
      await ctx.reply("Already paired.");
      return;
    }
    const secret = ctx.match?.trim();
    if (secret !== deps.pairSecret) {
      await ctx.reply("Invalid pairing secret. Usage: /pair <secret>");
      return;
    }
    deps.allowedIds.push(chatId);
    deps.onPair(chatId);
    await ctx.reply(`Paired! Chat ${chatId} is now whitelisted.`);
  });

  bot.command("unpair", async (ctx) => {
    if (ctx.from?.id !== deps.ownerId) return;
    const idStr = ctx.match?.trim();
    if (!idStr) { await ctx.reply("Usage: /unpair <chat_id>"); return; }
    const id = Number(idStr);
    const idx = deps.allowedIds.indexOf(id);
    if (idx === -1) { await ctx.reply("Not paired."); return; }
    deps.allowedIds.splice(idx, 1);
    deps.onPair(id);
    await ctx.reply(`Unpaired chat ${id}.`);
  });

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    if (deps.allowedIds.includes(chatId)) {
      await next();
    }
  });

  bot.on("message", async (ctx: Context) => {
    const msg = ctx.message!;
    const chatId = ctx.chat!.id;
    const isGroup = isGroupChat(chatId);
    const histDir = chatHistoryDir(chatId);
    const today = getTodayFileName();
    const timestamp = new Date().toISOString();
    const parts: string[] = [];

    if (msg.text) {
      parts.push(msg.text);
    }

    if (msg.caption) {
      parts.push(msg.caption);
    }

    if (msg.document) {
      const file = await ctx.api.getFile(msg.document.file_id);
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, msg.document.file_name ?? "file", TMP_DIR);
      parts.push(`[File: ${msg.document.file_name ?? "unknown"} (${msg.document.mime_type ?? ""}). Read it at: ${localPath}]`);
    }

    if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      const file = await ctx.api.getFile(largest.file_id);
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, "photo.jpg", TMP_DIR);
      parts.push(`[Photo sent by user. View it by reading: ${localPath}]`);
    }

    if (msg.voice) {
      const file = await ctx.api.getFile(msg.voice.file_id);
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, "voice.ogg", TMP_DIR);
      parts.push(`[Voice message: ${msg.voice.duration}s, saved at: ${localPath}]`);
    }

    if (msg.video) {
      const file = await ctx.api.getFile(msg.video.file_id);
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, msg.video.file_name ?? "video.mp4", TMP_DIR);
      parts.push(`[Video: ${msg.video.duration}s, saved at: ${localPath}]`);
    }

    if (msg.sticker) {
      parts.push(`[Sticker: ${msg.sticker.emoji ?? ""} ${msg.sticker.set_name ?? ""}]`);
    }

    if (parts.length === 0) {
      parts.push("[Unsupported message type]");
    }

    const senderName = msg.from?.first_name ?? "Someone";
    const userMessage = isGroup
      ? `${senderName}: ${parts.join("\n")}`
      : parts.join("\n");

    appendHistory(histDir, today, { role: "user", content: userMessage, timestamp });

    const paths = {
      memoryDir: MEMORY_DIR,
      historyDir: histDir,
      remindersPath: REMINDERS_PATH,
      historyLimit: deps.historyLimit,
      isGroup,
    };

    try {
      const result = processMessage(userMessage, paths);
      appendHistory(histDir, today, { role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
      await ctx.reply(result.reply);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Engine error:", errMsg);
      await ctx.reply("Sorry, I had trouble processing that. Please try again.");
    }
  });

  return bot;
}
