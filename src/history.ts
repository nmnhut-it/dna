import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

export interface HistoryMessage {
  role: string;
  content: string;
  timestamp: string;
}

interface HistorySummary {
  text: string;
  throughTimestamp: string;
  messageCount: number;
}

const SUMMARY_FILE = "summary.json";
const SUMMARIZE_EVERY = 10;

/**
 * Loads context-ready history: rolling summary + last `limit` raw messages.
 * Returns array where first entry may be a summary pseudo-message.
 */
export function loadHistoryWithSummary(historyDir: string, limit: number): HistoryMessage[] {
  const raw = loadRecentMessages(historyDir, limit);
  const summary = loadSummary(historyDir);

  // If over word budget, trigger summarization of older messages (fire and forget)
  if (countWords(raw) > MAX_HISTORY_WORDS && raw.length > SUMMARIZE_EVERY) {
    summarizeOldMessages(historyDir).catch(() => {});
  }

  const result = summary?.text
    ? [{ role: "system", content: `[Earlier conversation summary] ${summary.text}`, timestamp: summary.throughTimestamp } as HistoryMessage, ...raw]
    : raw;
  return result;
}

const MAX_HISTORY_WORDS = 3000;

/** Loads the last `limit` raw messages across day files. */
export function loadRecentMessages(historyDir: string, limit: number): HistoryMessage[] {
  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir)
    .filter((f) => f.endsWith(".json") && f !== SUMMARY_FILE)
    .sort()
    .reverse();

  const collected: HistoryMessage[] = [];
  for (const file of files) {
    const messages: HistoryMessage[] = JSON.parse(readFileSync(join(historyDir, file), "utf-8"));
    collected.unshift(...messages);
    if (collected.length >= limit) break;
  }
  return collected.slice(-limit);
}

/** Counts words in a message list. */
function countWords(messages: HistoryMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0);
}

/** Legacy overloads kept for compatibility. */
export function loadHistory(historyDir: string, limit: number): HistoryMessage[];
export function loadHistory(historyDir: string, date: string, limit: number): HistoryMessage[];
export function loadHistory(historyDir: string, dateOrLimit: string | number, maybeLimit?: number): HistoryMessage[] {
  if (typeof dateOrLimit === "string") {
    const filePath = join(historyDir, `${dateOrLimit}.json`);
    if (!existsSync(filePath)) return [];
    const messages: HistoryMessage[] = JSON.parse(readFileSync(filePath, "utf-8"));
    return messages.slice(-(maybeLimit ?? 20));
  }
  return loadRecentMessages(historyDir, dateOrLimit);
}

/** Appends a message and triggers summarization if enough unsummarized messages. */
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

  // Check if we should summarize (fire and forget)
  const unsummarized = countUnsummarizedMessages(historyDir);
  if (unsummarized >= SUMMARIZE_EVERY) {
    summarizeOldMessages(historyDir).catch(() => {});
  }
}

/** Counts messages newer than the last summary timestamp. */
function countUnsummarizedMessages(historyDir: string): number {
  const summary = loadSummary(historyDir);
  const cutoff = summary?.throughTimestamp ?? "";
  const allMessages = loadRecentMessages(historyDir, 1000);
  return allMessages.filter((m) => m.timestamp > cutoff).length;
}

function loadSummary(historyDir: string): HistorySummary | null {
  const path = join(historyDir, SUMMARY_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveSummary(historyDir: string, summary: HistorySummary): void {
  writeFileSync(join(historyDir, SUMMARY_FILE), JSON.stringify(summary, null, 2));
}

/**
 * Summarizes old messages: takes unsummarized messages except the last SUMMARIZE_EVERY,
 * combines with existing summary, produces a new rolling summary via Claude.
 */
async function summarizeOldMessages(historyDir: string): Promise<void> {
  const summary = loadSummary(historyDir);
  const cutoff = summary?.throughTimestamp ?? "";
  const allMessages = loadRecentMessages(historyDir, 1000);
  const unsummarized = allMessages.filter((m) => m.timestamp > cutoff);

  if (unsummarized.length < SUMMARIZE_EVERY) return;

  // Summarize all but the last SUMMARIZE_EVERY messages (keep those as raw context)
  const toSummarize = unsummarized.slice(0, -SUMMARIZE_EVERY);
  if (toSummarize.length === 0) return;

  const existing = summary?.text ?? "";
  const conversation = toSummarize
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = existing
    ? `Update this conversation summary with the new messages below. Output only the updated summary in 3-5 sentences.\n\nExisting summary:\n${existing}\n\nNew messages:\n${conversation}`
    : `Summarize this conversation in 3-5 sentences. Output only the summary.\n\n${conversation}`;

  const result = await callClaude(prompt);
  if (!result) return;

  const lastSummarized = toSummarize[toSummarize.length - 1];
  saveSummary(historyDir, {
    text: result,
    throughTimestamp: lastSummarized.timestamp,
    messageCount: (summary?.messageCount ?? 0) + toSummarize.length,
  });
}

function callClaude(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["-p", "--no-session-persistence"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdin.write(prompt);
    proc.stdin.end();

    let output = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.on("close", (code) => resolve(code === 0 && output.trim() ? output.trim() : null));
    proc.on("error", () => resolve(null));
    setTimeout(() => { proc.kill(); resolve(null); }, 60_000);
  });
}

export function getTodayFileName(): string {
  return new Date().toISOString().slice(0, 10);
}
