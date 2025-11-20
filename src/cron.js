import { updateFromTelegram } from "./scraper/telegramScraper.js";

console.log("⏳ CRON: Updating outages…");
await updateFromTelegram();
console.log("✅ Done.");
process.exit(0);
