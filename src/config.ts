import { readFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CONFIG_PATH = join(DATA_DIR, "config.json");

interface Config {
  telegramBotToken: string;
  allowedUserId: number;
  historyLimit: number;
  mcpServerUrl: string;
}

export function loadConfig(): Config {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Config;
}

export { DATA_DIR };
