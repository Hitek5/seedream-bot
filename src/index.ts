import { createBot } from "./bot/index.js";

const bot = createBot();

bot.start({
  onStart: () => console.log("Seedream bot started (long polling)"),
});

// Graceful shutdown
const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
