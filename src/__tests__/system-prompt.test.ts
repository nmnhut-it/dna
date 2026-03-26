import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../system-prompt.js";

describe("buildSystemPrompt", () => {
  it("includes identity section", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "" });
    expect(prompt).toContain("You are DNA");
  });

  it("includes current date/time", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "" });
    expect(prompt).toMatch(/Current date and time:/);
  });

  it("includes memory when provided", () => {
    const prompt = buildSystemPrompt({ memory: "Likes coffee", reminders: [], historySnippet: "" });
    expect(prompt).toContain("Likes coffee");
  });

  it("includes active reminders", () => {
    const reminders = [{ id: "r1", text: "standup", datetime: "2026-03-27T09:00:00", recurring: "daily", notified: false }];
    const prompt = buildSystemPrompt({ memory: "", reminders, historySnippet: "" });
    expect(prompt).toContain("standup");
    expect(prompt).toContain("2026-03-27T09:00:00");
  });

  it("includes action format instructions", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "" });
    expect(prompt).toContain("[ACTION:REMIND");
    expect(prompt).toContain("[ACTION:REMEMBER");
    expect(prompt).toContain("[ACTION:FORGET");
  });
});
