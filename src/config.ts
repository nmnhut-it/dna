import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CONFIG_PATH = join(DATA_DIR, "config.json");

interface Config {
  telegramBotToken: string;
  allowedIds: number[];
  ownerId: number;
  pairSecret: string;
  historyLimit: number;
  mcpServerUrl: string;
}

export function loadConfig(): Config {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as Config;
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export { DATA_DIR };
