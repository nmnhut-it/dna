import { EventEmitter } from "events";

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export interface ChatEvent {
  type: "message" | "log";
  chatId: number;
  role: string;
  content: string;
  timestamp: string;
}
