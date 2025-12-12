import { orchestrator } from "./services/SyncEngine.js";

console.log("⏳ CRON: Syncing outages via SyncEngine…");
await orchestrator();
console.log("✅ Done.");
process.exit(0);
