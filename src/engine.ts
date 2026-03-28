import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { readRelevantMemory, appendMemory, removeMemoryEntry } from "./memory.js";
import { loadHistoryWithSummary } from "./history.js";
import { loadReminders, addReminder } from "./reminders.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { parseActions, stripActions, type ParsedAction } from "./actions.js";
import type { ChatConfig } from "./config.js";
import { logger } from "./logger.js";

export interface ChatContext {
  chatId: number;
  chatTitle?: string;
  senderName?: string;
  isGroup: boolean;
}

interface ContextPaths {
  memoryDir: string;
  userMemoryDir?: string;
  historyDir: string;
  remindersPath: string;
  historyLimit: number;
  isGroup?: boolean;
  chat?: ChatContext;
  chatConfig?: ChatConfig;
  chatDir?: string;
}

export function assembleContext(paths: ContextPaths): string {
  const history = loadHistoryWithSummary(paths.historyDir, paths.historyLimit);

  const historySnippet = history
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const personality = paths.chatConfig?.personality ?? "default";
  const shouldLoadMemory = paths.chatConfig?.loadMemory ?? !paths.isGroup;

  const recentTexts = history.map((m) => m.content);
  const chatMemory = shouldLoadMemory
    ? readRelevantMemory(paths.memoryDir, recentTexts)
    : "";
  const userMemory = shouldLoadMemory && paths.userMemoryDir
    ? readRelevantMemory(paths.userMemoryDir, recentTexts)
    : "";
  const memory = [chatMemory, userMemory].filter(Boolean).join("\n\n---\n\n");

  const reminders = shouldLoadMemory
    ? loadReminders(paths.remindersPath).filter((r) => !r.notified)
    : [];

  return buildSystemPrompt({
    memory, reminders, historySnippet,
    isGroup: paths.isGroup, chat: paths.chat, personality,
  });
}

export function executeActions(
  actions: ParsedAction[],
  memoryDir: string,
  remindersPath: string,
  userMemoryDir?: string
): void {
  for (const action of actions) {
    switch (action.type) {
      case "REMEMBER": {
        const cat = action.params.category;
        const isUserMemory = cat.startsWith("user/");
        const targetDir = isUserMemory && userMemoryDir ? userMemoryDir : memoryDir;
        const targetCat = isUserMemory ? cat.slice(5) : cat;
        appendMemory(targetDir, targetCat, action.params.content);
        break;
      }
      case "FORGET": {
        const cat = action.params.category;
        const isUserMemory = cat.startsWith("user/");
        const targetDir = isUserMemory && userMemoryDir ? userMemoryDir : memoryDir;
        const targetCat = isUserMemory ? cat.slice(5) : cat;
        removeMemoryEntry(targetDir, targetCat, action.params.content);
        break;
      }
      case "REMIND":
        addReminder(remindersPath, {
          text: action.params.text,
          datetime: action.params.datetime,
          recurring: action.params.recurring === "null" ? null : action.params.recurring,
        });
        break;
    }
  }
}

/**
 * Streams response from claude -p, calling onChunk with accumulated text.
 * Returns the full response when done.
 */
export function streamFromClaude(
  userMessage: string,
  systemPrompt: string,
  onChunk: (accumulated: string) => void,
  allowedTools: string[] = ["WebSearch", "WebFetch", "Read"],
  chatDir?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const toolArgs = allowedTools.length > 0 ? ["--allowedTools", ...allowedTools] : [];
    const dirArgs = chatDir ? ["--add-dir", chatDir] : [];
    const proc = spawn("claude", [
      "-p",
      "--no-session-persistence",
      "--permission-mode", "acceptEdits",
      "--system-prompt", systemPrompt,
      ...toolArgs,
      ...dirArgs,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: chatDir || undefined,
    });

    const killTimer = setTimeout(() => {
      logger.warn("Claude process timed out after 5min, killing");
      proc.kill();
    }, 300_000);

    proc.stdin.write(userMessage);
    proc.stdin.end();

    let output = "";
    let lastEmit = 0;
    const THROTTLE_MS = 1500;

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      const now = Date.now();
      if (now - lastEmit > THROTTLE_MS) {
        lastEmit = now;
        onChunk(stripActions(output).trim());
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      logger.error(`Claude stderr: ${data.toString().trim()}`);
    });

    proc.on("close", (code, signal) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve(output.trim());
      } else if (output.trim()) {
        // Got partial output before crash — use what we have
        logger.warn(`Claude exited code=${code} signal=${signal}, using partial output`);
        resolve(output.trim());
      } else {
        reject(new Error(`claude exited with code=${code} signal=${signal}`));
      }
    });

    proc.on("error", reject);
  });
}

export interface ProcessResult {
  reply: string;
  actions: ParsedAction[];
}

/**
 * Async streaming pipeline: assembles context, streams from Claude,
 * calls onChunk for progressive updates, then executes actions.
 */
const MAX_RETRIES = 3;

export async function processMessageStream(
  userMessage: string,
  paths: ContextPaths & { memoryDir: string; remindersPath: string },
  onChunk: (text: string) => void
): Promise<ProcessResult> {
  const systemPrompt = assembleContext(paths);

  // Log full prompt to chat dir for debugging
  if (paths.chatDir) {
    const chatId = paths.chat?.chatId;
    try {
      const logPath = join(paths.chatDir, "last-prompt.md");
      const logContent = `# Prompt sent at ${new Date().toISOString()}\n\n## System Prompt\n\n${systemPrompt}\n\n## User Message\n\n${userMessage}\n`;
      writeFileSync(logPath, logContent);
      logger.engine(`Prompt logged to last-prompt.md (${systemPrompt.length} chars)`, chatId);
    } catch { /* non-critical */ }
  }

  let rawResponse = "";
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const allowedTools = paths.chatConfig?.allowedTools ?? ["WebSearch", "WebFetch", "Read"];
      rawResponse = await streamFromClaude(userMessage, systemPrompt, onChunk, allowedTools, paths.chatDir);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.error(`Claude attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  if (lastError) throw lastError;
  const actions = parseActions(rawResponse);
  const reply = stripActions(rawResponse).trim();
  return { reply, actions };
}
