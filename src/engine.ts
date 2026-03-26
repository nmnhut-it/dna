import { spawn } from "child_process";
import { readMemory, appendMemory, removeMemoryEntry } from "./memory.js";
import { loadHistory, getTodayFileName } from "./history.js";
import { loadReminders, addReminder } from "./reminders.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { parseActions, stripActions, type ParsedAction } from "./actions.js";

export interface ChatContext {
  chatId: number;
  chatTitle?: string;
  senderName?: string;
  isGroup: boolean;
}

interface ContextPaths {
  memoryDir: string;
  historyDir: string;
  remindersPath: string;
  historyLimit: number;
  isGroup?: boolean;
  chat?: ChatContext;
}

export function assembleContext(paths: ContextPaths): string {
  const today = getTodayFileName();
  const history = loadHistory(paths.historyDir, today, paths.historyLimit);

  const historySnippet = history
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  if (paths.isGroup) {
    return buildSystemPrompt({ memory: "", reminders: [], historySnippet, isGroup: true, chat: paths.chat });
  }

  const memory = readMemory(paths.memoryDir);
  const reminders = loadReminders(paths.remindersPath).filter((r) => !r.notified);
  return buildSystemPrompt({ memory, reminders, historySnippet, isGroup: false, chat: paths.chat });
}

export function executeActions(
  actions: ParsedAction[],
  memoryDir: string,
  remindersPath: string
): void {
  for (const action of actions) {
    switch (action.type) {
      case "REMEMBER":
        appendMemory(memoryDir, action.params.category, action.params.content);
        break;
      case "FORGET":
        removeMemoryEntry(memoryDir, action.params.category, action.params.content);
        break;
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
  onChunk: (accumulated: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = `${systemPrompt}\n\n---\n\nUser: ${userMessage}`;
    const proc = spawn("claude", [
      "-p",
      "--allowedTools", "WebSearch", "WebFetch", "Read",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const killTimer = setTimeout(() => {
      console.warn("claude process timed out after 5min, killing");
      proc.kill();
    }, 300_000);

    proc.stdin.write(input);
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
      console.error("claude stderr:", data.toString());
    });

    proc.on("close", (code, signal) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve(output.trim());
      } else if (output.trim()) {
        // Got partial output before crash — use what we have
        console.warn(`claude exited with code=${code} signal=${signal}, using partial output`);
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

  let rawResponse = "";
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      rawResponse = await streamFromClaude(userMessage, systemPrompt, onChunk);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Claude attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  if (lastError) throw lastError;
  const actions = parseActions(rawResponse);
  if (!paths.isGroup) {
    executeActions(actions, paths.memoryDir, paths.remindersPath);
  }
  const reply = stripActions(rawResponse).trim();
  return { reply, actions };
}
