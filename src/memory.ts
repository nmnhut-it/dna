import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, relative, basename, dirname } from "path";

/** Reads all markdown files from memoryDir (recursively) into a single string. */
export function readMemory(memoryDir: string): string {
  const sections: string[] = [];
  collectMarkdownFiles(memoryDir, memoryDir, sections);
  return sections.join("\n\n---\n\n");
}

/** Recursively collects non-empty markdown file contents into sections array. */
function collectMarkdownFiles(dir: string, baseDir: string, sections: string[]): void {
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
