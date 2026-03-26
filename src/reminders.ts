import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

// Reminder stored in active.json; datetime is ISO-8601 local (no Z suffix)
export interface Reminder {
  id: string;
  text: string;
  datetime: string;
  recurring: string | null;
  notified: boolean;
}

interface NewReminder {
  text: string;
  datetime: string;
  recurring: string | null;
}

// Days to advance per recurrence type
const RECURRENCE_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

/** Read all reminders from filePath. */
export function loadReminders(filePath: string): Reminder[] {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

/** Persist reminders array to filePath. */
function saveReminders(filePath: string, reminders: Reminder[]): void {
  writeFileSync(filePath, JSON.stringify(reminders, null, 2));
}

/** Append a new reminder and return it. */
export function addReminder(filePath: string, input: NewReminder): Reminder {
  const reminders = loadReminders(filePath);
  const reminder: Reminder = {
    id: randomUUID().slice(0, 8),
    text: input.text,
    datetime: input.datetime,
    recurring: input.recurring,
    notified: false,
  };
  reminders.push(reminder);
  saveReminders(filePath, reminders);
  return reminder;
}

/** Return reminders whose datetime <= now and not yet notified. */
export function getDueReminders(filePath: string): Reminder[] {
  const now = new Date();
  return loadReminders(filePath).filter(
    (r) => !r.notified && new Date(r.datetime) <= now
  );
}

/** Set notified=true for the reminder with the given id. */
export function markNotified(filePath: string, id: string): void {
  const reminders = loadReminders(filePath);
  const target = reminders.find((r) => r.id === id);
  if (target) {
    target.notified = true;
    saveReminders(filePath, reminders);
  }
}

/**
 * Advance an ISO-8601 local datetime string (YYYY-MM-DDTHH:mm:ss) by N days.
 * Operates on date parts directly to avoid UTC timezone shifting.
 */
function advanceDatetimeByDays(datetime: string, days: number): string {
  const [datePart, timePart] = datetime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const d = new Date(year, month - 1, day + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}T${timePart}`;
}

/** Append a new reminder scheduled one recurrence interval after the source. */
export function scheduleNextOccurrence(filePath: string, id: string): void {
  const reminders = loadReminders(filePath);
  const source = reminders.find((r) => r.id === id);
  if (!source || !source.recurring) return;

  const days = RECURRENCE_DAYS[source.recurring];
  if (!days) return;

  // Parse datetime parts directly to avoid UTC offset shifting
  const nextDatetime = advanceDatetimeByDays(source.datetime, days);

  const next: Reminder = {
    id: randomUUID().slice(0, 8),
    text: source.text,
    datetime: nextDatetime,
    recurring: source.recurring,
    notified: false,
  };
  reminders.push(next);
  saveReminders(filePath, reminders);
}
