import { Bot, GrammyError, HttpError, InputFile } from "grammy";
import { config } from "../config.js";
import { generateImage } from "../services/seedream.js";
import { registerPhotoHandler } from "./handlers/photo.js";
import { registerCallbackHandler } from "./handlers/callback.js";

export function createBot(): Bot {
  const bot = new Bot(config.botToken);

  bot.command("start", (ctx) =>
    ctx.reply(
      "Привет! Я генерирую изображения через Seedream v4.5.\n\n" +
        "Используй /imagine <описание> — и я создам картинку.\n\n" +
        "Пример: /imagine красивый закат над океаном",
    ),
  );

  bot.command("imagine", async (ctx) => {
    const prompt = ctx.match?.trim();
    if (!prompt) {
      return ctx.reply("Укажи промпт после команды.\nПример: /imagine futuristic city at night");
    }

    await ctx.replyWithChatAction("upload_photo");

    // Keep typing indicator alive while generating
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("upload_photo").catch(() => {});
    }, 4000);

    try {
      const result = await generateImage(prompt);

      await ctx.replyWithPhoto(new InputFile({ url: result.url }), {
        caption:
          `✨ *${escapeMarkdown(prompt)}*\n` +
          `📐 ${result.width}×${result.height} · seed: \`${result.seed}\``,
        parse_mode: "MarkdownV2",
      });
    } catch (error) {
      const message = getErrorMessage(error);
      await ctx.reply(`Ошибка генерации: ${message}`);
    } finally {
      clearInterval(typingInterval);
    }
  });

  // Phase 2: photo analysis + callback buttons
  registerPhotoHandler(bot);
  registerCallbackHandler(bot);

  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error(`Grammy error [${ctx.update.update_id}]:`, e.description);
    } else if (e instanceof HttpError) {
      console.error("HTTP error:", e);
    } else {
      console.error("Unexpected error:", e);
    }
  });

  return bot;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return "Таймаут — fal.ai не ответил вовремя. Попробуй ещё раз.";
    }
    if (msg.includes("safety") || msg.includes("nsfw") || msg.includes("content_filter")) {
      return "Промпт заблокирован фильтром безопасности. Попробуй другой.";
    }
    if (msg.includes("rate") || msg.includes("429")) {
      return "Слишком много запросов. Подожди немного.";
    }
    return error.message;
  }
  return "Неизвестная ошибка";
}
