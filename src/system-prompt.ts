import type { Reminder } from "./reminders.js";

// Context passed to buildSystemPrompt; all fields are optional/empty by default
interface PromptContext {
  memory: string;
  reminders: Reminder[];
  historySnippet: string;
  isGroup?: boolean;
}

/**
 * Builds the full system prompt for DNA.
 * Input: PromptContext with memory string, active reminders, and recent history snippet.
 * Output: a multi-section string ready to send as the system message to the LLM.
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const sections: string[] = [];

  sections.push(buildIdentitySection(now));

  if (ctx.memory) {
    sections.push(`## What you know about the user\n\n${ctx.memory}`);
  }

  if (ctx.reminders.length > 0) {
    sections.push(buildRemindersSection(ctx.reminders));
  }

  if (ctx.historySnippet) {
    sections.push(`## Recent conversation\n\n${ctx.historySnippet}`);
  }

  if (ctx.isGroup) {
    sections.push(`## Group chat rules

You are in a group chat. Messages are prefixed with sender names.
NEVER reveal personal information about any user — no personal memories, preferences, tasks, or reminders.
Keep responses helpful but generic. Do NOT use action markers in group chats.`);
  } else {
    sections.push(buildActionsSection());
  }

  return sections.join("\n\n");
}

// Returns the identity/persona section with current timestamp
function buildIdentitySection(now: string): string {
  return `You are DNA (Definitely Not Assistant), a personal companion.
You are warm, concise, and helpful. You remember things about the user and help them stay organized.
Current date and time: ${now}`;
}

// Formats active reminders into a markdown list section
function buildRemindersSection(reminders: Reminder[]): string {
  const lines = reminders.map(
    (r) => `- [${r.id}] "${r.text}" at ${r.datetime}${r.recurring ? ` (${r.recurring})` : ""}`
  );
  return `## Active reminders\n\n${lines.join("\n")}`;
}

// Returns the action format instructions section
function buildActionsSection(): string {
  return `## Actions

When the user asks you to set a reminder, remember something, or forget something, include the appropriate action marker in your response. You may include multiple actions. Always also respond naturally in text.

Formats:
[ACTION:REMIND text="<reminder text>" datetime="<YYYY-MM-DDTHH:mm:ss>" recurring="<daily|weekly|monthly|null>"]
[ACTION:REMEMBER category="<facts|preferences|topics/name>" content="<what to remember>"]
[ACTION:FORGET category="<facts|preferences|topics/name>" content="<what to forget>"]`;
}
