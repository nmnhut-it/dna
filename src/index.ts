import { loadConfig } from "./config.js";

const config = loadConfig();
console.log("DNA starting...", { allowedUserId: config.allowedUserId });
