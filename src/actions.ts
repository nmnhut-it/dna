/**
 * Action parser — extracts and strips ACTION markers from Claude output.
 * ACTION markers have the form: [ACTION:TYPE key="value" ...]
 * Related: index.ts (where Claude responses are processed)
 */

export interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

// Matches full action tags, e.g. [ACTION:REMIND text="a" datetime="b"]
const ACTION_PATTERN = /\[ACTION:(\w+)((?:\s+\w+="[^"]*")*)\]/g;

// Matches individual key="value" pairs within an action tag
const PARAM_PATTERN = /(\w+)="([^"]*)"/g;

/** Parses all ACTION markers from text, returning typed action objects. */
export function parseActions(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  for (const match of text.matchAll(ACTION_PATTERN)) {
    const type = match[1];
    const paramString = match[2];
    const params: Record<string, string> = {};
    for (const paramMatch of paramString.matchAll(PARAM_PATTERN)) {
      params[paramMatch[1]] = paramMatch[2];
    }
    actions.push({ type, params });
  }
  return actions;
}

/** Removes all ACTION markers from text, leaving the surrounding content. */
export function stripActions(text: string): string {
  return text.replace(ACTION_PATTERN, "");
}
