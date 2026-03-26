import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadReminders, addReminder, markNotified, getDueReminders, scheduleNextOccurrence } from "../reminders.js";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "td-reminders", "reminders");
const ACTIVE_PATH = join(TEST_DIR, "active.json");

describe("reminders", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(ACTIVE_PATH, "[]");
  });

  afterEach(() => {
    rmSync(join(import.meta.dirname, "td-reminders"), { recursive: true, force: true });
  });

  it("loads empty reminders", () => {
    expect(loadReminders(ACTIVE_PATH)).toEqual([]);
  });

  it("adds a reminder", () => {
    addReminder(ACTIVE_PATH, { text: "standup", datetime: "2026-03-27T09:00:00", recurring: null });
    const reminders = loadReminders(ACTIVE_PATH);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].text).toBe("standup");
    expect(reminders[0].notified).toBe(false);
    expect(reminders[0].id).toBeDefined();
  });

  it("finds due reminders", () => {
    addReminder(ACTIVE_PATH, { text: "past", datetime: "2020-01-01T00:00:00", recurring: null });
    addReminder(ACTIVE_PATH, { text: "future", datetime: "2099-01-01T00:00:00", recurring: null });
    const due = getDueReminders(ACTIVE_PATH);
    expect(due).toHaveLength(1);
    expect(due[0].text).toBe("past");
  });

  it("marks a reminder as notified", () => {
    addReminder(ACTIVE_PATH, { text: "test", datetime: "2020-01-01T00:00:00", recurring: null });
    const reminders = loadReminders(ACTIVE_PATH);
    markNotified(ACTIVE_PATH, reminders[0].id);
    const updated = loadReminders(ACTIVE_PATH);
    expect(updated[0].notified).toBe(true);
  });

  it("schedules next occurrence for daily recurring", () => {
    addReminder(ACTIVE_PATH, { text: "standup", datetime: "2026-03-26T09:00:00", recurring: "daily" });
    const reminders = loadReminders(ACTIVE_PATH);
    scheduleNextOccurrence(ACTIVE_PATH, reminders[0].id);
    const updated = loadReminders(ACTIVE_PATH);
    expect(updated).toHaveLength(2);
    expect(updated[1].datetime).toBe("2026-03-27T09:00:00");
    expect(updated[1].notified).toBe(false);
  });

  it("schedules next occurrence for weekly recurring", () => {
    addReminder(ACTIVE_PATH, { text: "review", datetime: "2026-03-26T09:00:00", recurring: "weekly" });
    const reminders = loadReminders(ACTIVE_PATH);
    scheduleNextOccurrence(ACTIVE_PATH, reminders[0].id);
    const updated = loadReminders(ACTIVE_PATH);
    expect(updated[1].datetime).toBe("2026-04-02T09:00:00");
  });
});
