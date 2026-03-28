import { Bot, Context, InlineKeyboard } from "grammy";
import { processMessageStream, executeActions, type ChatContext } from "./engine.js";
import { appendHistory, getTodayFileName } from "./history.js";
import { downloadTelegramFile } from "./files.js";
import {
  chatPaths, loadChatConfig, ensureChatDirs,
  loadConfig, saveConfig, isConfigured,
  type ChatConfig, type Config,
} from "./config.js";
import { eventBus } from "./web/event-bus.js";
import { logger } from "./logger.js";
import type { ParsedAction } from "./actions.js";

interface BotDeps {
  token: string;
  config: Config;
  historyLimit: number;
  pairingCode?: string;
}

interface PendingConfirmation {
  actions: ParsedAction[];
  memoryDir: string;
  remindersPath: string;
}

const pendingActions = new Map<string, PendingConfirmation>();

function isGroupChat(chatId: number): boolean {
  return chatId < 0;
}

function formatActionSummary(actions: ParsedAction[]): string {
  const lines = actions.map((a) => {
    switch (a.type) {
      case "REMEMBER": return `• Remember (${a.params.category}): ${a.params.content}`;
      case "FORGET": return `• Forget (${a.params.category}): ${a.params.content}`;
      case "REMIND": return `• Reminder: "${a.params.text}" at ${a.params.datetime}`;
      default: return `• ${a.type}: ${JSON.stringify(a.params)}`;
    }
  });
  return `<b>Pending actions:</b>\n${lines.join("\n")}`;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);
  let botId: number | undefined;
  let botUsername: string | undefined;
  let config = deps.config;

  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (config.ownerId === 0) {
      const code = ctx.match?.trim();
      if (!code || code !== deps.pairingCode) {
        await ctx.reply("Send /start followed by the pairing code shown in the terminal.");
        return;
      }
      config.ownerId = userId;
      config.allowedIds = [userId];
      saveConfig(config);
      logger.bot(`Owner paired: ${ctx.from?.first_name} (${userId})`);
      await ctx.reply(
        `Hi ${ctx.from?.first_name}! You're now the owner of this bot.\n\nJust send me a message to get started.`
      );
      return;
    }

    if (userId === config.ownerId) {
      await ctx.reply("You're already the owner. Just send me a message!");
      return;
    }

    if (!config.allowedIds.includes(userId)) {
      await ctx.reply("This bot is private. Ask the owner to add you.");
      return;
    }

    await ctx.reply("Hi! Send me a message to get started.");
  });

  bot.use(async (ctx, next) => {
    if (!botId) {
      const me = await bot.api.getMe();
      botId = me.id;
      botUsername = me.username?.toLowerCase();
    }
    if (config.ownerId === 0) return; // pairing mode — only /start works
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const senderId = ctx.from?.id;
    const isAllowedChat = config.allowedIds.includes(chatId);
    const isAllowedUser = senderId ? config.allowedIds.includes(senderId) : false;
    if (isAllowedChat || isAllowedUser) {
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

    ensureChatDirs(chatId);
    const paths = chatPaths(chatId);
    const chatConfig = loadChatConfig(chatId, config.ownerId);
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
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, msg.document.file_name ?? "file", paths.tmpDir);
      parts.push(`[File: ${msg.document.file_name ?? "unknown"} (${msg.document.mime_type ?? ""}). Read it at: ${localPath}]`);
    }

    if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      const file = await ctx.api.getFile(largest.file_id);
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, "photo.jpg", paths.tmpDir);
      parts.push(`[Photo sent by user. View it by reading: ${localPath}]`);
    }

    if (msg.voice) {
      const file = await ctx.api.getFile(msg.voice.file_id);
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, "voice.ogg", paths.tmpDir);
      parts.push(`[Voice message: ${msg.voice.duration}s, saved at: ${localPath}]`);
    }

    if (msg.video) {
      const file = await ctx.api.getFile(msg.video.file_id);
      const localPath = await downloadTelegramFile(deps.token, file.file_path!, msg.video.file_name ?? "video.mp4", paths.tmpDir);
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

    const senderLabel = isGroup ? `${senderName} in group` : senderName;
    logger.bot(`Message from ${senderLabel}: ${userMessage.slice(0, 80)}`, chatId);

    appendHistory(paths.historyDir, today, { role: "user", content: userMessage, timestamp });
    eventBus.emit("chat", { type: "message", chatId, role: "user", content: userMessage, timestamp });

    const chat: ChatContext = {
      chatId,
      chatTitle: ctx.chat!.type === "private"
        ? msg.from?.first_name ?? "Private"
        : (ctx.chat! as { title?: string }).title ?? String(chatId),
      senderName: msg.from?.first_name,
      isGroup,
    };

    const enginePaths = {
      memoryDir: paths.memoryDir,
      historyDir: paths.historyDir,
      remindersPath: paths.remindersPath,
      historyLimit: deps.historyLimit,
      isGroup,
      chat,
      chatConfig,
      chatDir: paths.root,
    };

    try {
      await ctx.replyWithChatAction("typing");
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);

      let sentMsg: { message_id: number } = await ctx.reply("Thinking...");
      let lastEditText = "Thinking...";

      const result = await processMessageStream(userMessage, enginePaths, async (chunk) => {
        if (!chunk || chunk === lastEditText) return;
        try {
          const editText = chunk + " ...";
          if (editText !== lastEditText) {
            await ctx.api.editMessageText(chatId, sentMsg.message_id, editText);
            lastEditText = editText;
          }
        } catch { /* edit may fail if text unchanged or too fast */ }
      });

      clearInterval(typingInterval);
      logger.bot(`Reply sent (${result.reply.length} chars, ${result.actions.length} actions)`, chatId);

      if (result.reply !== lastEditText) {
        await ctx.api.editMessageText(chatId, sentMsg.message_id, result.reply, { parse_mode: "HTML" });
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

      const stateActions = result.actions.filter((a) => a.type !== "REACT");
      if (stateActions.length > 0) {
        logger.bot(`Actions parsed: ${stateActions.map((a) => a.type).join(", ")}`, chatId);
      }
      if (stateActions.length > 0 && chatConfig.allowActions && !isGroup) {
        if (chatConfig.actionsRequireConfirmation) {
          const summary = formatActionSummary(stateActions);
          const key = `${chatId}:${sentMsg.message_id}`;
          pendingActions.set(key, {
            actions: stateActions,
            memoryDir: paths.memoryDir,
            remindersPath: paths.remindersPath,
          });
          const keyboard = new InlineKeyboard()
            .text("✓ Confirm", `confirm:${key}`)
            .text("✗ Cancel", `cancel:${key}`);
          await ctx.reply(summary, { reply_markup: keyboard, parse_mode: "HTML" });
        } else {
          executeActions(stateActions, paths.memoryDir, paths.remindersPath);
        }
      }

      appendHistory(paths.historyDir, today, { role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
      eventBus.emit("chat", { type: "message", chatId, role: "assistant", content: result.reply, timestamp: new Date().toISOString() });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Engine error: ${errMsg}`, chatId);
      await ctx.reply("Sorry, I had trouble processing that. Please try again.");
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    const userId = ctx.callbackQuery.from.id;
    if (userId !== config.ownerId) {
      await ctx.answerCallbackQuery({ text: "Only the bot owner can confirm actions." });
      return;
    }

    const data = ctx.callbackQuery.data;
    const isConfirm = data.startsWith("confirm:");
    const isCancel = data.startsWith("cancel:");
    if (!isConfirm && !isCancel) return;

    const key = data.slice(data.indexOf(":") + 1);
    const pending = pendingActions.get(key);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "Already handled." });
      return;
    }

    pendingActions.delete(key);
    if (isConfirm) {
      executeActions(pending.actions, pending.memoryDir, pending.remindersPath);
      await ctx.answerCallbackQuery({ text: "Done." });
      await ctx.editMessageText("✓ Actions executed.");
    } else {
      await ctx.answerCallbackQuery({ text: "Cancelled." });
      await ctx.editMessageText("✗ Actions cancelled.");
    }
  });

  return bot;
}
