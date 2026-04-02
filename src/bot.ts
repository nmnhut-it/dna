import { Bot, Context, InlineKeyboard } from "grammy";
import { processMessageStream, executeActions, type ChatContext } from "./engine.js";
import { appendHistory, getTodayFileName } from "./history.js";
import { downloadTelegramFile } from "./files.js";
import {
  chatPaths, userPaths, loadChatConfig, saveChatConfig,
  ensureChatDirs, ensureUserDirs,
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
  userMemoryDir?: string;
}

const pendingActions = new Map<string, PendingConfirmation>();

function isGroupChat(chatId: number): boolean {
  return chatId < 0;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  // Register commands with Telegram so the menu updates
  bot.api.setMyCommands([
    { command: "start", description: "Start or pair with the bot" },
    { command: "settings", description: "View current chat settings" },
    { command: "personality", description: "Set personality preset" },
    { command: "tools", description: "Set allowed tools" },
    { command: "toggle", description: "Toggle actions/confirm/memory" },
    { command: "memory", description: "View stored memory" },
    { command: "prompt", description: "View last system prompt" },
    { command: "adduser", description: "Allow a user" },
    { command: "removeuser", description: "Remove a user" },
  ]).catch(() => {});
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

  // --- Owner-only commands (work in private and group chats) ---

  function isOwner(ctx: Context): boolean {
    return ctx.from?.id === config.ownerId;
  }

  bot.command("settings", async (ctx) => {
    if (!isOwner(ctx)) return;
    const chatId = ctx.chat!.id;
    ensureChatDirs(chatId);
    const chatCfg = loadChatConfig(chatId, config.ownerId);
    const lines = [
      `<b>Settings for chat ${chatId}</b>`,
      ``,
      `<b>Personality:</b> ${chatCfg.personality}`,
      `<b>Tools:</b> ${chatCfg.allowedTools.join(", ") || "none"}`,
      `<b>Actions:</b> ${chatCfg.allowActions ? "on" : "off"}`,
      `<b>Confirm actions:</b> ${chatCfg.actionsRequireConfirmation ? "on" : "off"}`,
      `<b>Load memory:</b> ${chatCfg.loadMemory ? "on" : "off"}`,
      `<b>History limit:</b> ${config.historyLimit}`,
      ``,
      `Commands:`,
      `/personality &lt;default|casual-vi&gt;`,
      `/tools &lt;tool1, tool2, ...&gt;`,
      `/toggle actions|confirm|memory`,
      `/prompt — view current system prompt`,
      `/adduser &lt;userId&gt;`,
      `/removeuser &lt;userId&gt;`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("personality", async (ctx) => {
    if (!isOwner(ctx)) return;
    const value = ctx.match?.trim();
    if (!value) { await ctx.reply("Usage: /personality <default|casual-vi>"); return; }
    const chatId = ctx.chat!.id;
    ensureChatDirs(chatId);
    const chatCfg = loadChatConfig(chatId, config.ownerId);
    chatCfg.personality = value;
    saveChatConfig(chatId, chatCfg);
    await ctx.reply(`Personality set to: ${value}`);
    logger.bot(`Personality changed to ${value}`, chatId);
  });

  bot.command("tools", async (ctx) => {
    if (!isOwner(ctx)) return;
    const value = ctx.match?.trim();
    if (!value) { await ctx.reply("Usage: /tools WebSearch, WebFetch, Read, Edit, Write"); return; }
    const chatId = ctx.chat!.id;
    ensureChatDirs(chatId);
    const chatCfg = loadChatConfig(chatId, config.ownerId);
    chatCfg.allowedTools = value.split(",").map((s) => s.trim()).filter(Boolean);
    saveChatConfig(chatId, chatCfg);
    await ctx.reply(`Allowed tools: ${chatCfg.allowedTools.join(", ")}`);
  });

  bot.command("toggle", async (ctx) => {
    if (!isOwner(ctx)) return;
    const field = ctx.match?.trim();
    const chatId = ctx.chat!.id;
    ensureChatDirs(chatId);
    const chatCfg = loadChatConfig(chatId, config.ownerId);
    const toggleMap: Record<string, keyof ChatConfig> = {
      actions: "allowActions",
      confirm: "actionsRequireConfirmation",
      memory: "loadMemory",
    };
    const key = toggleMap[field ?? ""];
    if (!key) { await ctx.reply("Usage: /toggle actions|confirm|memory"); return; }
    (chatCfg as unknown as Record<string, unknown>)[key] = !chatCfg[key];
    saveChatConfig(chatId, chatCfg);
    await ctx.reply(`${field}: ${chatCfg[key] ? "on" : "off"}`);
  });

  bot.command("prompt", async (ctx) => {
    if (!isOwner(ctx)) return;
    const chatId = ctx.chat!.id;
    const paths = chatPaths(chatId);
    const { readFileSync, existsSync } = await import("fs");
    const logPath = `${paths.root}/last-prompt.md`;
    if (!existsSync(logPath)) { await ctx.reply("No prompt logged yet. Send a message first."); return; }
    const content = readFileSync(logPath, "utf-8");
    // Telegram message limit is 4096 chars
    if (content.length > 4000) {
      await ctx.reply(`Prompt is ${content.length} chars. First 4000:\n\n<pre>${escapeHtml(content.slice(0, 4000))}</pre>`, { parse_mode: "HTML" });
    } else {
      await ctx.reply(`<pre>${escapeHtml(content)}</pre>`, { parse_mode: "HTML" });
    }
  });

  bot.command("memory", async (ctx) => {
    if (!isOwner(ctx)) return;
    const chatId = ctx.chat!.id;
    const userId = ctx.from!.id;
    ensureChatDirs(chatId);
    ensureUserDirs(userId);
    const { readMemory } = await import("./memory.js");
    const chatMem = readMemory(chatPaths(chatId).memoryDir);
    const userMem = readMemory(userPaths(userId).memoryDir);
    const sections: string[] = [];
    if (userMem) sections.push(`<b>User memory:</b>\n${escapeHtml(userMem)}`);
    if (chatMem) sections.push(`<b>Chat memory:</b>\n${escapeHtml(chatMem)}`);
    if (!sections.length) { await ctx.reply("No memory stored."); return; }
    const display = sections.join("\n\n---\n\n");
    const output = display.length > 4000 ? display.slice(0, 4000) + "\n\n... (truncated)" : display;
    await ctx.reply(output, { parse_mode: "HTML" });
  });

  bot.command("adduser", async (ctx) => {
    if (!isOwner(ctx)) return;
    const id = Number(ctx.match?.trim());
    if (!id) { await ctx.reply("Usage: /adduser <userId>"); return; }
    if (!config.allowedIds.includes(id)) {
      config.allowedIds.push(id);
      saveConfig(config);
    }
    await ctx.reply(`User ${id} added. Total allowed: ${config.allowedIds.length}`);
  });

  bot.command("removeuser", async (ctx) => {
    if (!isOwner(ctx)) return;
    const id = Number(ctx.match?.trim());
    if (!id) { await ctx.reply("Usage: /removeuser <userId>"); return; }
    config.allowedIds = config.allowedIds.filter((i) => i !== id);
    saveConfig(config);
    await ctx.reply(`User ${id} removed.`);
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
    const senderId = msg.from?.id;
    if (senderId) ensureUserDirs(senderId);
    const paths = chatPaths(chatId);
    const uPaths = senderId ? userPaths(senderId) : undefined;
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
      userMemoryDir: uPaths?.memoryDir,
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

      const replyOpts = isGroup ? { reply_parameters: { message_id: msg.message_id } } : {};
      let sentMsg: { message_id: number } = await ctx.reply("Thinking...", replyOpts);
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
            userMemoryDir: uPaths?.memoryDir,
          });
          const keyboard = new InlineKeyboard()
            .text("✓ Confirm", `confirm:${key}`)
            .text("✗ Cancel", `cancel:${key}`);
          await ctx.reply(summary, { reply_markup: keyboard, parse_mode: "HTML" });
        } else {
          executeActions(stateActions, paths.memoryDir, paths.remindersPath, uPaths?.memoryDir);
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
      executeActions(pending.actions, pending.memoryDir, pending.remindersPath, pending.userMemoryDir);
      await ctx.answerCallbackQuery({ text: "Done." });
      await ctx.editMessageText("✓ Actions executed.");
    } else {
      await ctx.answerCallbackQuery({ text: "Cancelled." });
      await ctx.editMessageText("✗ Actions cancelled.");
    }
  });

  return bot;
}
