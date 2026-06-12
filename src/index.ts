import { createBot } from "./bot/index.js";

const bot = createBot();

// Surface async errors that would otherwise be silently swallowed
// (handler errors are caught separately by bot.catch in bot/index.ts).
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

bot.start({
  onStart: () => console.log("Seedream bot started (long polling)"),
}).catch((err) => {
  console.error("Bot polling crashed:", err);
  process.exit(1);
});

// Graceful shutdown
const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
