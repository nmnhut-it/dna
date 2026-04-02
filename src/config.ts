import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CONFIG_PATH = join(DATA_DIR, "config.json");
const CHATS_DIR = join(DATA_DIR, "chats");
const USERS_DIR = join(DATA_DIR, "users");

export interface Config {
  telegramBotToken: string;
  allowedIds: number[];
  ownerId: number;
  historyLimit: number;
  webPort: number;
}

/** Per-chat configuration — controls personality, tool access, and action behavior. */
export interface ChatConfig {
  personality: "default" | "casual-vi" | string;
  allowedTools: string[];
  allowActions: boolean;
  actionsRequireConfirmation: boolean;
  loadMemory: boolean;
  listenAll: boolean;
}

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  personality: "default",
  allowedTools: ["WebSearch", "WebFetch", "Read", "Edit", "Write"],
  allowActions: true,
  actionsRequireConfirmation: true,
  loadMemory: true,
  listenAll: false,
};

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

/** Loads config from disk. Throws if file missing. */
export function loadConfig(): Config {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Config;
}

/** Returns true if setup is complete (has owner). */
export function isConfigured(): boolean {
  if (!existsSync(CONFIG_PATH)) return false;
  const config = loadConfig();
  return config.ownerId > 0;
}

/** First-time setup: resolves token from env or terminal prompt. Owner set later via /start. */
export async function initConfig(): Promise<Config> {
  if (existsSync(CONFIG_PATH)) {
    return loadConfig();
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    const config = buildDefaultConfig(token);
    saveConfig(config);
    return config;
  }

  console.log("\n=== DNA Setup ===\n");
  const entered = await prompt("Telegram bot token: ");
  if (!entered) { console.error("Token is required."); process.exit(1); }

  const config = buildDefaultConfig(entered);
  saveConfig(config);
  return config;
}

function buildDefaultConfig(token: string): Config {
  return {
    telegramBotToken: token,
    allowedIds: [],
    ownerId: 0,
    historyLimit: 20,
    webPort: 3000,
  };
}

export function saveConfig(config: Config): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Returns the root directory for a chat's data: data/chats/<chatId>/ */
export function chatDir(chatId: number): string {
  const dir = join(CHATS_DIR, String(chatId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Per-chat subdirectory paths. */
export function chatPaths(chatId: number) {
  const root = chatDir(chatId);
  return {
    root,
    config: join(root, "config.json"),
    memoryDir: join(root, "memory"),
    historyDir: join(root, "history"),
    remindersPath: join(root, "reminders.json"),
    tmpDir: join(root, "tmp"),
  };
}

/** Loads per-chat config, creating defaults if missing. Owner gets casual-vi preset. */
export function loadChatConfig(chatId: number, ownerId: number): ChatConfig {
  const paths = chatPaths(chatId);
  if (existsSync(paths.config)) {
    const raw = readFileSync(paths.config, "utf-8");
    return { ...DEFAULT_CHAT_CONFIG, ...JSON.parse(raw) };
  }
  const isGroup = chatId < 0;
  const config: ChatConfig = {
    ...DEFAULT_CHAT_CONFIG,
    personality: chatId === ownerId ? "casual-vi" : "default",
    actionsRequireConfirmation: chatId !== ownerId,
    loadMemory: !isGroup,
  };
  saveChatConfig(chatId, config);
  return config;
}

export function saveChatConfig(chatId: number, config: ChatConfig): void {
  const paths = chatPaths(chatId);
  writeFileSync(paths.config, JSON.stringify(config, null, 2));
}

/** Bootstraps all directories for a chat. */
export function ensureChatDirs(chatId: number): void {
  const paths = chatPaths(chatId);
  mkdirSync(join(paths.memoryDir, "topics"), { recursive: true });
  mkdirSync(paths.historyDir, { recursive: true });
  mkdirSync(paths.tmpDir, { recursive: true });
}

/** Per-user directory paths (memory that follows a user across chats). */
export function userPaths(userId: number) {
  const root = join(USERS_DIR, String(userId));
  mkdirSync(root, { recursive: true });
  return {
    root,
    memoryDir: join(root, "memory"),
  };
}

/** Bootstraps user directories. */
export function ensureUserDirs(userId: number): void {
  const paths = userPaths(userId);
  mkdirSync(join(paths.memoryDir, "topics"), { recursive: true });
}

export { DATA_DIR, CHATS_DIR, USERS_DIR };
