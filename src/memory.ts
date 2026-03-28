import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, relative, basename, dirname } from "path";
import { spawn } from "child_process";

/** Reads all markdown files from memoryDir (recursively) into a single string. */
export function readMemory(memoryDir: string): string {
  const sections: string[] = [];
  collectMarkdownFiles(memoryDir, memoryDir, sections);
  return sections.join("\n\n---\n\n");
}

/**
 * Reads only relevant memory: root-level files always loaded,
 * topic files loaded only if their name appears in recent messages.
 */
export function readRelevantMemory(memoryDir: string, recentMessages: string[]): string {
  if (!existsSync(memoryDir)) return "";
  const keywords = extractKeywords(recentMessages);
  const sections: string[] = [];
  collectRelevantFiles(memoryDir, memoryDir, keywords, sections);
  return sections.join("\n\n---\n\n");
}

/** Extracts lowercase words from messages for keyword matching. */
function extractKeywords(messages: string[]): Set<string> {
  const words = new Set<string>();
  for (const msg of messages) {
    for (const word of msg.toLowerCase().split(/\W+/)) {
      if (word.length > 2) words.add(word);
    }
  }
  return words;
}

/** Collects files: root-level always, subdirectory files only if name matches keywords. */
function collectRelevantFiles(
  dir: string, baseDir: string, keywords: Set<string>, sections: string[]
): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  const isRoot = dir === baseDir;

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRelevantFiles(fullPath, baseDir, keywords, sections);
    } else if (entry.name.endsWith(".md")) {
      const stem = entry.name.replace(/\.md$/, "").toLowerCase();
      if (isRoot || keywords.has(stem)) {
        const label = relative(baseDir, fullPath).replace(/\.md$/, "");
        const content = readFileSync(fullPath, "utf-8").trim();
        if (content.split("\n").length > 1) {
          sections.push(`[${label}]\n${content}`);
        }
      }
    }
  }
}

/** Recursively collects non-empty markdown file contents into sections array. */
function collectMarkdownFiles(dir: string, baseDir: string, sections: string[]): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, baseDir, sections);
    } else if (entry.name.endsWith(".md")) {
      const label = relative(baseDir, fullPath).replace(/\.md$/, "");
      const content = readFileSync(fullPath, "utf-8").trim();
      if (content.split("\n").length > 1) {
        sections.push(`[${label}]\n${content}`);
      }
    }
  }
}

/** Appends a bullet entry to a category memory file. Creates the file if missing. */
export function appendMemory(memoryDir: string, category: string, content: string): void {
  const filePath = join(memoryDir, `${category}.md`);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(filePath)) {
    const title = basename(category).charAt(0).toUpperCase() + basename(category).slice(1);
    writeFileSync(filePath, `# ${title}\n\n- ${content}\n`);
    return;
  }
  const existing = readFileSync(filePath, "utf-8");
  writeFileSync(filePath, existing.trimEnd() + `\n- ${content}\n`);
}

/** Removes lines containing the given content string from a category memory file. */
export function removeMemoryEntry(memoryDir: string, category: string, content: string): void {
  const filePath = join(memoryDir, `${category}.md`);
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf-8").split("\n");
  const filtered = lines.filter((line) => !line.includes(content));
  writeFileSync(filePath, filtered.join("\n"));
}

/** Lists all memory file names (without .md extension) relative to memoryDir. */
export function listMemoryFiles(memoryDir: string): string[] {
  const results: string[] = [];
  collectFileNames(memoryDir, memoryDir, results);
  return results;
}

/** Recursively collects markdown filenames (without extension) relative to baseDir. */
function collectFileNames(dir: string, baseDir: string, results: string[]): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFileNames(fullPath, baseDir, results);
    } else if (entry.name.endsWith(".md")) {
      results.push(relative(baseDir, fullPath).replace(/\.md$/, ""));
    }
  }
}

/** Counts bullet point lines in a text. */
export function countBulletPoints(text: string): number {
  return text.split("\n").filter((line) => line.trimStart().startsWith("- ")).length;
}

/** Rough token estimate: ~1 token per 0.75 words. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length / 0.75);
}

const SUMMARIZE_THRESHOLD = 30;
const KEEP_RECENT = 5;

/**
 * Summarizes a memory file if it exceeds the bullet threshold.
 * Keeps the last KEEP_RECENT entries, summarizes the rest via Claude CLI.
 */
export async function summarizeMemoryFile(filePath: string, threshold = SUMMARIZE_THRESHOLD): Promise<boolean> {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const bulletLines = lines.filter((l) => l.trimStart().startsWith("- "));
  if (bulletLines.length < threshold) return false;

  const heading = lines.find((l) => l.startsWith("# ")) ?? "# Memory";
  const oldBullets = bulletLines.slice(0, -KEEP_RECENT);
  const recentBullets = bulletLines.slice(-KEEP_RECENT);

  const summaryText = await callClaudeSummarize(oldBullets.join("\n"));
  if (!summaryText) return false;

  const newContent = [
    heading,
    "",
    "## Summary",
    summaryText,
    "",
    "## Recent",
    ...recentBullets,
    "",
  ].join("\n");

  writeFileSync(filePath, newContent);
  return true;
}

/** Calls claude -p to summarize text. Returns summary or null on failure. */
function callClaudeSummarize(text: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("claude", [
      "-p", "--no-session-persistence",
    ], { stdio: ["pipe", "pipe", "pipe"] });

    const prompt = `Summarize these notes into 2-3 concise sentences. Keep only the important facts. Output only the summary, nothing else.\n\n${text}`;
    proc.stdin.write(prompt);
    proc.stdin.end();

    let output = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.on("close", (code) => {
      resolve(code === 0 && output.trim() ? output.trim() : null);
    });
    proc.on("error", () => resolve(null));

    setTimeout(() => { proc.kill(); resolve(null); }, 60_000);
  });
}

/** Summarizes all memory files in a directory that exceed the threshold. */
export async function summarizeAllMemory(memoryDir: string): Promise<number> {
  if (!existsSync(memoryDir)) return 0;
  const files = listMemoryFiles(memoryDir);
  let count = 0;
  for (const file of files) {
    const filePath = join(memoryDir, `${file}.md`);
    const did = await summarizeMemoryFile(filePath);
    if (did) count++;
  }
  return count;
}
