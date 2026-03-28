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

describe("personality presets", () => {
  it("uses professional default personality by default", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "" });
    expect(prompt).toContain("friendly, sharp, and concise");
    expect(prompt).not.toContain("casual-vi");
  });

  it("uses default personality when personality is 'default'", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", personality: "default" });
    expect(prompt).toContain("friendly, sharp, and concise");
  });

  it("uses casual-vi personality when specified", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", personality: "casual-vi" });
    expect(prompt).toContain("close friend");
    expect(prompt).toContain("Xưng hô");
  });

  it("falls back to default for unknown personality", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", personality: "nonexistent" });
    expect(prompt).toContain("friendly, sharp, and concise");
  });

  it("does not include Vietnamese slang in default personality", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", personality: "default" });
    expect(prompt).not.toContain("ủa");
    expect(prompt).not.toContain("dzậy");
  });

  it("includes Vietnamese elements in casual-vi personality", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", personality: "casual-vi" });
    expect(prompt).toContain("ủa");
  });
});

describe("group chat rules", () => {
  it("includes group rules when isGroup is true", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", isGroup: true });
    expect(prompt).toContain("group chat");
    expect(prompt).toContain("NEVER reveal personal information");
  });

  it("does not include actions section in group chats", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", isGroup: true });
    expect(prompt).not.toContain("[ACTION:REMEMBER");
  });

  it("respects personality in group chats", () => {
    const prompt = buildSystemPrompt({ memory: "", reminders: [], historySnippet: "", isGroup: true, personality: "casual-vi" });
    expect(prompt).toContain("close friend");
  });
});
