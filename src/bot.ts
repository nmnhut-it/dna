import { Bot, Context } from "grammy";
import { processMessageStream, type ChatContext } from "./engine.js";
import { appendHistory, getTodayFileName } from "./history.js";
import { downloadTelegramFile } from "./files.js";
import { join } from "path";
import { mkdirSync } from "fs";
import { DATA_DIR } from "./config.js";
import { eventBus } from "./web/event-bus.js";

const MEMORY_DIR = join(DATA_DIR, "memory");
const HISTORY_DIR = join(DATA_DIR, "history");
const REMINDERS_PATH = join(DATA_DIR, "reminders", "active.json");
const TMP_DIR = join(DATA_DIR, "tmp");

interface BotDeps {
  token: string;
  allowedIds: number[];
  historyLimit: number;
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
  let botId: number | undefined;
  let botUsername: string | undefined;

  bot.use(async (ctx, next) => {
    if (!botId) {
      const me = await bot.api.getMe();
      botId = me.id;
      botUsername = me.username?.toLowerCase();
    }
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

    if (isGroup) {
      const text = (msg.text ?? msg.caption ?? "").toLowerCase();
      const isMentioned = botUsername ? text.includes(`@${botUsername}`) : false;
      const isReply = msg.reply_to_message?.from?.id === botId;
      if (!isMentioned && !isReply) return;
    }

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
    eventBus.emit("chat", { type: "message", chatId, role: "user", content: userMessage, timestamp });

    const chat: ChatContext = {
      chatId,
      chatTitle: ctx.chat!.type === "private"
        ? msg.from?.first_name ?? "Private"
        : (ctx.chat! as { title?: string }).title ?? String(chatId),
      senderName: msg.from?.first_name,
      isGroup,
    };

    const paths = {
      memoryDir: MEMORY_DIR,
      historyDir: histDir,
      remindersPath: REMINDERS_PATH,
      historyLimit: deps.historyLimit,
      isGroup,
      chat,
    };

    try {
      await ctx.replyWithChatAction("typing");
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);

      let sentMsg: { message_id: number } | undefined;
      let lastEditText = "";

      const result = await processMessageStream(userMessage, paths, async (chunk) => {
        if (!chunk || chunk === lastEditText) return;
        try {
          if (!sentMsg) {
            sentMsg = await ctx.reply(chunk + " ...");
            lastEditText = chunk + " ...";
          } else {
            const editText = chunk + " ...";
            if (editText !== lastEditText) {
              await ctx.api.editMessageText(chatId, sentMsg.message_id, editText);
              lastEditText = editText;
            }
          }
        } catch { /* edit may fail if text unchanged or too fast */ }
      });

      clearInterval(typingInterval);

      if (sentMsg) {
        if (result.reply !== lastEditText) {
          await ctx.api.editMessageText(chatId, sentMsg.message_id, result.reply, { parse_mode: "HTML" });
        }
      } else {
        await ctx.reply(result.reply, { parse_mode: "HTML" });
      }

      const reactAction = result.actions.find((a) => a.type === "REACT");
      if (reactAction?.params.emoji) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await ctx.api.setMessageReaction(chatId, msg.message_id, [
            { type: "emoji", emoji: reactAction.params.emoji } as any,
          ]);
        } catch { /* reaction may fail if emoji not supported by Telegram */ }
      }

      appendHistory(histDir, today, { role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
      eventBus.emit("chat", { type: "message", chatId, role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Engine error:", errMsg);
      await ctx.reply("Sorry, I had trouble processing that. Please try again.");
    }
  });

  return bot;
}
