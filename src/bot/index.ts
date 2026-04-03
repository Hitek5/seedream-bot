import { Bot, GrammyError, HttpError, InlineKeyboard, InputFile, Keyboard } from "grammy";
import { config } from "../config.js";
import { generateImage } from "../services/seedream.js";
import { promptStore } from "./handlers/callback.js";
import { registerPhotoHandler } from "./handlers/photo.js";
import { registerCallbackHandler } from "./handlers/callback.js";

// Persistent reply keyboard — always visible
const mainKeyboard = new Keyboard()
  .text("🎲 Случайный")
  .text("ℹ️ Помощь")
  .resized()
  .persistent();

// Random prompts for discovery
const randomPrompts = [
  "A crystal palace floating among aurora borealis clouds, ethereal glow",
  "Cyberpunk Tokyo street at midnight, neon reflections on wet asphalt, cinematic",
  "A giant tree growing through an abandoned cathedral, sunbeams through stained glass",
  "Underwater city with bioluminescent architecture, deep ocean, volumetric light",
  "Steampunk airship docking at a mountain fortress, golden hour, dramatic clouds",
  "A fox made of autumn leaves walking through a misty forest, magical realism",
  "Futuristic greenhouse on Mars, red desert visible through glass dome, cozy interior",
  "Ancient library with floating books and glowing runes, dark academia aesthetic",
  "A dragon sleeping on a pile of gold coins, medieval treasure room, dramatic lighting",
  "Japanese zen garden in heavy rain, stone lantern glowing warmly, peaceful mood",
  "Astronaut sitting on the edge of a cliff on an alien planet, two moons in sky",
  "Art deco robot serving tea in a 1920s Parisian café, warm vintage tones",
];

export function createBot(): Bot {
  const bot = new Bot(config.botToken);

  // /start — greeting + keyboard
  bot.command("start", (ctx) =>
    ctx.reply(
      "Привет! Я генерирую картинки через Seedream v4.5 ✨\n\n" +
        "Просто напиши что хочешь увидеть — и я создам.\n" +
        "Или отправь фото — я проанализирую и предложу промпт.\n\n" +
        "Попробуй: «космический кот на крыше небоскрёба»",
      { reply_markup: mainKeyboard },
    ),
  );

  // Keep /imagine for backward compat
  bot.command("imagine", (ctx) => handleGenerate(ctx, ctx.match?.trim()));

  // Phase 2: photo analysis + inline callback buttons
  registerPhotoHandler(bot);
  registerCallbackHandler(bot);

  // Button: random prompt
  bot.hears("🎲 Случайный", (ctx) => {
    const prompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
    return handleGenerate(ctx, prompt);
  });

  // Button: help
  bot.hears("ℹ️ Помощь", (ctx) =>
    ctx.reply(
      "🎨 *Как пользоваться:*\n\n" +
        "• Напиши текст → получишь картинку\n" +
        "• Отправь фото → получишь промпт по нему\n" +
        "• 🎲 Случайный → сюрприз\\!\n\n" +
        "💡 *Советы:*\n" +
        "• Пиши на английском для лучшего качества\n" +
        "• Добавляй стиль: _cinematic, watercolor, anime_\n" +
        "• Описывай свет: _golden hour, dramatic lighting_\n\n" +
        "После генерации используй кнопки под картинкой:\n" +
        "🔄 Ещё вариант · ✏️ Изменить · 🧑 С моим фото",
      { parse_mode: "MarkdownV2", reply_markup: mainKeyboard },
    ),
  );

  // Any text message = prompt for generation
  bot.on("message:text", (ctx) => handleGenerate(ctx, ctx.message.text));

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

// Shared generation logic
async function handleGenerate(ctx: any, prompt: string | undefined) {
  if (!prompt) {
    return ctx.reply("Напиши что хочешь увидеть 🎨", { reply_markup: mainKeyboard });
  }

  await ctx.replyWithChatAction("upload_photo");

  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("upload_photo").catch(() => {});
  }, 4000);

  try {
    const result = await generateImage(prompt);

    // Store prompt for inline buttons
    const id = Date.now().toString(36);
    promptStore.set(id, prompt);
    promptStore.set(`seed_${id}`, String(result.seed));

    const kb = new InlineKeyboard()
      .text("🔄 Ещё вариант", `regenerate:${id}`)
      .text("✏️ Изменить", `edit_prompt:${id}`)
      .row()
      .text("🧑 С моим фото", `face_swap:${id}`)
      .text("💾 Сохранить", `save_prompt:${id}`)
      .row()
      .text("🏠 Сначала", `restart:0`);

    // Telegram caption limit: 1024 chars. Truncate long prompts.
    const maxPromptLen = 800;
    const displayPrompt = prompt.length > maxPromptLen
      ? prompt.slice(0, maxPromptLen) + "…"
      : prompt;

    await ctx.replyWithPhoto(new InputFile({ url: result.url }), {
      caption:
        `✨ *${escapeMarkdown(displayPrompt)}*\n` +
        `📐 ${result.width}×${result.height} · seed: \`${result.seed}\``,
      parse_mode: "MarkdownV2",
      reply_markup: kb,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    await ctx.reply(`Ошибка генерации: ${message}`, { reply_markup: mainKeyboard });
  } finally {
    clearInterval(typingInterval);
  }
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
