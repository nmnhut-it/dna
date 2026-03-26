import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Represents a single conversation message stored in daily history files.
export interface HistoryMessage {
  role: string;
  content: string;
  timestamp: string;
}

/**
 * Loads messages from a daily history file.
 * Input: historyDir (folder path), date (YYYY-MM-DD), limit (max messages to return).
 * Output: last `limit` HistoryMessage entries, or [] if file absent.
 */
export function loadHistory(historyDir: string, date: string, limit: number): HistoryMessage[] {
  const filePath = join(historyDir, `${date}.json`);
  if (!existsSync(filePath)) return [];
  const messages: HistoryMessage[] = JSON.parse(readFileSync(filePath, "utf-8"));
  return messages.slice(-limit);
}

/**
 * Appends a message to the daily history file, creating it if needed.
 * Input: historyDir, date (YYYY-MM-DD), message to append.
 * Output: void — writes updated JSON array to disk.
 */
export function appendHistory(historyDir: string, date: string, message: HistoryMessage): void {
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }
  const filePath = join(historyDir, `${date}.json`);
  const messages: HistoryMessage[] = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf-8"))
    : [];
  messages.push(message);
  writeFileSync(filePath, JSON.stringify(messages, null, 2));
}

/**
 * Returns today's date as a YYYY-MM-DD string for use as a history filename.
 */
export function getTodayFileName(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}
