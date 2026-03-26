import { execFileSync } from "child_process";
import { readMemory, appendMemory, removeMemoryEntry } from "./memory.js";
import { loadHistory, getTodayFileName } from "./history.js";
import { loadReminders, addReminder } from "./reminders.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { parseActions, stripActions, type ParsedAction } from "./actions.js";

// Paths needed to assemble context and execute actions
interface ContextPaths {
  memoryDir: string;
  historyDir: string;
  remindersPath: string;
  historyLimit: number;
  isGroup?: boolean;
}

/**
 * Builds the system prompt string from memory, history, and pending reminders.
 * Input: ContextPaths pointing to data dirs. Output: formatted string for Claude.
 */
export function assembleContext(paths: ContextPaths): string {
  const today = getTodayFileName();
  const history = loadHistory(paths.historyDir, today, paths.historyLimit);

  const historySnippet = history
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  if (paths.isGroup) {
    return buildSystemPrompt({ memory: "", reminders: [], historySnippet, isGroup: true });
  }

  const memory = readMemory(paths.memoryDir);
  const reminders = loadReminders(paths.remindersPath).filter((r) => !r.notified);
  return buildSystemPrompt({ memory, reminders, historySnippet, isGroup: false });
}

/**
 * Runs each parsed action against memory and reminders storage.
 * Input: actions array, memoryDir path, remindersPath. Output: void (side effects only).
 */
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
 * Calls the claude CLI with -p flag, passing combined system prompt and user message.
 * Input: userMessage string, systemPrompt string. Output: trimmed response string.
 */
export function sendToClaude(userMessage: string, systemPrompt: string): string {
  const input = `${systemPrompt}\n\n---\n\nUser: ${userMessage}`;
  const result = execFileSync("claude", ["-p", input], {
    encoding: "utf-8",
    timeout: 120_000,
  });
  return result.trim();
}

export interface ProcessResult {
  reply: string;
  actions: ParsedAction[];
}

/**
 * Full pipeline: assemble context, call Claude, parse+execute actions, return clean reply.
 * Input: userMessage and combined ContextPaths. Output: ProcessResult with reply and actions.
 */
export function processMessage(
  userMessage: string,
  paths: ContextPaths & { memoryDir: string; remindersPath: string }
): ProcessResult {
  const systemPrompt = assembleContext(paths);
  const rawResponse = sendToClaude(userMessage, systemPrompt);
  const actions = parseActions(rawResponse);
  if (!paths.isGroup) {
    executeActions(actions, paths.memoryDir, paths.remindersPath);
  }
  const reply = stripActions(rawResponse).trim();
  return { reply, actions };
}
