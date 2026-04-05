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
  unsummarizedCount: number;
}

const SUMMARY_FILE = "summary.json";
const SUMMARIZE_EVERY = 10;
const MAX_HISTORY_WORDS = 3000;
const FLUSH_INTERVAL_MS = 2_000;
const SUMMARIZE_DEBOUNCE_MS = 5_000;

// --- in-memory write buffers (per historyDir) ---

interface DirBuffer {
  /** Pending messages grouped by date key. */
  pending: Map<string, HistoryMessage[]>;
  /** In-memory unsummarized counter (loaded from disk on first access). */
  unsummarizedCount: number;
  /** Whether the counter has been loaded from disk yet. */
  counterLoaded: boolean;
  /** Flush timer handle. */
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** Summarization debounce timer. */
  summarizeTimer: ReturnType<typeof setTimeout> | null;
}

const buffers = new Map<string, DirBuffer>();
const summarizingDirs = new Set<string>();

function getBuffer(historyDir: string): DirBuffer {
  let buf = buffers.get(historyDir);
  if (!buf) {
    buf = {
      pending: new Map(),
      unsummarizedCount: 0,
      counterLoaded: false,
      flushTimer: null,
      summarizeTimer: null,
    };
    buffers.set(historyDir, buf);
  }
  if (!buf.counterLoaded) {
    const summary = loadSummary(historyDir);
    buf.unsummarizedCount = summary?.unsummarizedCount ?? 0;
    buf.counterLoaded = true;
  }
  return buf;
}

/**
 * Loads context-ready history: rolling summary + last `limit` raw messages.
 * Flushes pending buffer first so reads are consistent.
 * Triggers summarization if word budget exceeded.
 */
export function loadHistoryWithSummary(historyDir: string, limit: number): HistoryMessage[] {
  flushBuffer(historyDir);
  const raw = loadRecentMessages(historyDir, limit);
  const summary = loadSummary(historyDir);

  if (countWords(raw) > MAX_HISTORY_WORDS && raw.length > SUMMARIZE_EVERY) {
    scheduleSummarization(historyDir);
  }

  return summary?.text
    ? [{ role: "system", content: `[Earlier conversation summary] ${summary.text}`, timestamp: summary.throughTimestamp }, ...raw]
    : raw;
}

/** Loads the last `limit` raw messages across day files (reads newest first, stops early). */
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

/** Buffers a message in memory; flushes to disk after FLUSH_INTERVAL_MS or on next read. */
export function appendHistory(historyDir: string, date: string, message: HistoryMessage): void {
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }

  const buf = getBuffer(historyDir);

  if (!buf.pending.has(date)) {
    buf.pending.set(date, []);
  }
  buf.pending.get(date)!.push(message);
  buf.unsummarizedCount++;

  // Schedule a flush if not already pending
  if (!buf.flushTimer) {
    buf.flushTimer = setTimeout(() => flushBuffer(historyDir), FLUSH_INTERVAL_MS);
  }

  // Check summarization threshold (debounced, no disk I/O)
  if (buf.unsummarizedCount >= SUMMARIZE_EVERY) {
    scheduleSummarization(historyDir);
  }
}

/** Flushes all buffered messages for a chat to disk. */
export function flushBuffer(historyDir: string): void {
  const buf = buffers.get(historyDir);
  if (!buf || buf.pending.size === 0) return;

  if (buf.flushTimer) {
    clearTimeout(buf.flushTimer);
    buf.flushTimer = null;
  }

  for (const [date, newMessages] of buf.pending) {
    const filePath = join(historyDir, `${date}.json`);
    const existing: HistoryMessage[] = existsSync(filePath)
      ? JSON.parse(readFileSync(filePath, "utf-8"))
      : [];
    existing.push(...newMessages);
    writeFileSync(filePath, JSON.stringify(existing, null, 2));
  }
  buf.pending.clear();

  // Persist the counter
  persistUnsummarizedCount(historyDir, buf.unsummarizedCount);
}

/** Flush all chat buffers (call on graceful shutdown). */
export function flushAll(): void {
  for (const historyDir of buffers.keys()) {
    flushBuffer(historyDir);
  }
}

export function getTodayFileName(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- internals ---

function countWords(messages: HistoryMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0);
}

function loadSummary(historyDir: string): HistorySummary | null {
  const path = join(historyDir, SUMMARY_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveSummary(historyDir: string, summary: HistorySummary): void {
  writeFileSync(join(historyDir, SUMMARY_FILE), JSON.stringify(summary, null, 2));
}

function persistUnsummarizedCount(historyDir: string, count: number): void {
  const summary = loadSummary(historyDir) ?? {
    text: "",
    throughTimestamp: "",
    messageCount: 0,
    unsummarizedCount: 0,
  };
  summary.unsummarizedCount = count;
  saveSummary(historyDir, summary);
}

/** Debounced summarization — waits for message burst to settle before spawning Claude. */
function scheduleSummarization(historyDir: string): void {
  const buf = getBuffer(historyDir);
  if (buf.summarizeTimer) {
    clearTimeout(buf.summarizeTimer);
  }
  buf.summarizeTimer = setTimeout(() => {
    buf.summarizeTimer = null;
    triggerSummarization(historyDir);
  }, SUMMARIZE_DEBOUNCE_MS);
}

/** Fire-and-forget with concurrency guard — at most one summarization per chat. */
function triggerSummarization(historyDir: string): void {
  flushBuffer(historyDir); // ensure all messages on disk before summarizing
  if (summarizingDirs.has(historyDir)) return;
  summarizingDirs.add(historyDir);
  doSummarize(historyDir)
    .catch(() => {})
    .finally(() => summarizingDirs.delete(historyDir));
}

/** Loads only messages after a cutoff timestamp (skips old day files). */
function loadMessagesAfterCutoff(historyDir: string, cutoffTs: string): HistoryMessage[] {
  const cutoffDate = cutoffTs.slice(0, 10);
  const files = readdirSync(historyDir)
    .filter((f) => f.endsWith(".json") && f !== SUMMARY_FILE)
    .sort();

  const relevantFiles = cutoffDate
    ? files.filter((f) => f.replace(".json", "") >= cutoffDate)
    : files;

  const result: HistoryMessage[] = [];
  for (const file of relevantFiles) {
    const messages: HistoryMessage[] = JSON.parse(readFileSync(join(historyDir, file), "utf-8"));
    for (const m of messages) {
      if (m.timestamp > cutoffTs) result.push(m);
    }
  }
  return result;
}

async function doSummarize(historyDir: string): Promise<void> {
  const summary = loadSummary(historyDir);
  const cutoff = summary?.throughTimestamp ?? "";
  const unsummarized = loadMessagesAfterCutoff(historyDir, cutoff);

  if (unsummarized.length < SUMMARIZE_EVERY) return;

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
  const newCount = SUMMARIZE_EVERY; // the kept-back messages
  saveSummary(historyDir, {
    text: result,
    throughTimestamp: lastSummarized.timestamp,
    messageCount: (summary?.messageCount ?? 0) + toSummarize.length,
    unsummarizedCount: newCount,
  });

  // Sync the in-memory counter
  const buf = buffers.get(historyDir);
  if (buf) buf.unsummarizedCount = newCount;
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
