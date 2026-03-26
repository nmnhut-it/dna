import { describe, it, expect } from "vitest";
import { parseActions, stripActions } from "../actions.js";

describe("parseActions", () => {
  it("parses REMIND action", () => {
    const text = 'Sure! [ACTION:REMIND text="standup" datetime="2026-03-27T09:00:00" recurring="daily"] Done.';
    const actions = parseActions(text);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: "REMIND",
      params: { text: "standup", datetime: "2026-03-27T09:00:00", recurring: "daily" },
    });
  });

  it("parses REMEMBER action", () => {
    const text = '[ACTION:REMEMBER category="preferences" content="likes dark roast"] Noted!';
    const actions = parseActions(text);
    expect(actions[0]).toEqual({
      type: "REMEMBER",
      params: { category: "preferences", content: "likes dark roast" },
    });
  });

  it("parses FORGET action", () => {
    const text = '[ACTION:FORGET category="facts" content="likes tea"]';
    const actions = parseActions(text);
    expect(actions[0]).toEqual({
      type: "FORGET",
      params: { category: "facts", content: "likes tea" },
    });
  });

  it("parses multiple actions", () => {
    const text = '[ACTION:REMIND text="a" datetime="2026-03-27T09:00:00" recurring="null"] [ACTION:REMEMBER category="facts" content="b"]';
    const actions = parseActions(text);
    expect(actions).toHaveLength(2);
  });

  it("returns empty array when no actions", () => {
    expect(parseActions("Just a normal response.")).toEqual([]);
  });
});

describe("stripActions", () => {
  it("removes action markers from text", () => {
    const text = 'Sure! [ACTION:REMIND text="standup" datetime="2026-03-27T09:00:00" recurring="daily"] I set that up for you.';
    const stripped = stripActions(text);
    expect(stripped).toBe("Sure!  I set that up for you.");
  });

  it("returns text unchanged when no actions", () => {
    expect(stripActions("Hello there")).toBe("Hello there");
  });
});
