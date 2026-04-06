import { Bot, GrammyError, HttpError, InlineKeyboard, InputFile, Keyboard } from "grammy";
import { config } from "../config.js";
import { generateImage } from "../services/seedream.js";
import { promptStore } from "./handlers/callback.js";
import { registerPhotoHandler } from "./handlers/photo.js";
import { registerCallbackHandler } from "./handlers/callback.js";
import { getBalance, deductBalance, formatBalance, formatCost, getBalanceRub, COSTS } from "../services/balance.js";
import { generateCADFromDescription, isCadQueryAvailable } from "../services/cad.js";

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
      "Привет! Я генерирую картинки и 3D модели ✨\n\n" +
        "📷 Отправь фото — получишь промпт + варианты:\n" +
        "  🎨 Сгенерировать картинку\n" +
        "  🗿 3D модель (для печати/просмотра)\n" +
        "  ⚙️ CAD модель (STEP для инженерии)\n\n" +
        "✍️ Напиши текст — сгенерирую картинку\n" +
        "/cad <описание> — CAD модель по описанию\n\n" +
        "Попробуй: «космический кот на крыше небоскрёба»",
      { reply_markup: mainKeyboard },
    ),
  );

  // /cad <description> — generate CAD model from text
  bot.command("cad", async (ctx) => {
    const description = ctx.match?.trim();
    if (!description) {
      return ctx.reply(
        "⚙️ Опиши деталь для CAD-моделирования:\n\n" +
          "Пример: `/cad bracket 80x40x3mm with 4 mounting holes 6mm, fillets 3mm`",
        { parse_mode: "Markdown", reply_markup: mainKeyboard },
      );
    }

    const userId = ctx.from?.id;
    const cost = COSTS.cadGeneration;

    if (userId) {
      const bal = getBalance(userId);
      if (bal < cost) {
        return ctx.reply(
          `❌ Недостаточно средств.\n💰 ${formatBalance(userId)} · 💵 ${formatCost(cost)}`,
          { reply_markup: mainKeyboard },
        );
      }
    }

    const cadAvailable = await isCadQueryAvailable();
    if (!cadAvailable) {
      return ctx.reply("⚙️ CadQuery не установлен. Администратор: `pip install cadquery`", {
        parse_mode: "Markdown",
        reply_markup: mainKeyboard,
      });
    }

    await ctx.replyWithChatAction("upload_document");
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("upload_document").catch(() => {});
    }, 4000);

    try {
      await ctx.reply("⚙️ Генерирую CAD модель...");
      const result = await generateCADFromDescription(description);

      if (userId) deductBalance(userId, cost);
      const balAfter = userId ? formatBalance(userId) : "0 ₽";

      if (result.stepPath) {
        await ctx.replyWithDocument(
          new InputFile(result.stepPath, "model.step"),
          { caption: "📐 STEP — FreeCAD, SolidWorks, Fusion 360" },
        );
      }
      if (result.stlPath) {
        await ctx.replyWithDocument(
          new InputFile(result.stlPath, "model.stl"),
          { caption: "🗿 STL — готов к 3D-печати" },
        );
      }

      await ctx.reply(`⚙️ Готово! 💵 ${formatCost(cost)} · 💰 ${balAfter}`, {
        reply_markup: mainKeyboard,
      });

      // Cleanup
      const { cleanupCADFiles } = await import("../services/cad.js");
      cleanupCADFiles(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
      await ctx.reply(`Ошибка CAD: ${msg}`, { reply_markup: mainKeyboard });
    } finally {
      clearInterval(typingInterval);
    }
  });

  // Keep /imagine for backward compat
  bot.command("imagine", (ctx) => handleGenerate(ctx, ctx.match?.trim()));

  // Balance check
  bot.command("balance", (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return ctx.reply("Не могу определить пользователя.");
    return ctx.reply(
      `💰 Баланс: ${formatBalance(uid)}\n\n` +
      `Стоимость:\n` +
      `• Генерация: ${formatCost(COSTS.textToImage)}\n` +
      `• Face swap: ${formatCost(COSTS.faceSwap)}\n\n` +
      `Для пополнения: @Amoskv`,
      { reply_markup: mainKeyboard },
    );
  });

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
        "*Картинки:*\n" +
        "• Напиши текст → получишь картинку\n" +
        "• Отправь фото → промпт \\+ генерация\n" +
        "• 🎲 Случайный → сюрприз\\!\n\n" +
        "*3D модели:*\n" +
        "• Отправь фото → нажми 🗿 3D модель\n" +
        "• 3 уровня качества: быстро/стандарт/высокое\n" +
        "• Результат: GLB файл для печати\n\n" +
        "*CAD модели:*\n" +
        "• Отправь фото детали → нажми ⚙️ CAD\n" +
        "• Или: `/cad bracket 80x40mm with holes`\n" +
        "• Результат: STEP \\+ STL файлы\n\n" +
        "💡 *Советы:*\n" +
        "• Для 3D: фото на чистом фоне\n" +
        "• Для CAD: фото инженерной детали\n" +
        "• Пиши на английском для лучшего результата",
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

  const userId = ctx.from?.id;
  const cost = COSTS.textToImage;

  // Check balance
  if (userId) {
    const balance = getBalance(userId);
    if (balance < cost) {
      return ctx.reply(
        `❌ Недостаточно средств.\n\n` +
        `💰 Баланс: ${formatBalance(userId)}\n` +
        `💵 Стоимость: ${formatCost(cost)}\n\n` +
        `Обратись к @Amoskv для пополнения.`,
        { reply_markup: mainKeyboard },
      );
    }
  }

  await ctx.replyWithChatAction("upload_photo");

  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("upload_photo").catch(() => {});
  }, 4000);

  try {
    const result = await generateImage(prompt);

    // Deduct balance
    if (userId) {
      deductBalance(userId, cost);
    }

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
    const maxPromptLen = 700;
    const displayPrompt = prompt.length > maxPromptLen
      ? prompt.slice(0, maxPromptLen) + "…"
      : prompt;

    const balanceAfterRub = userId ? formatBalance(userId) : "0 ₽";
    const sizeStr = formatSize(result.width, result.height);

    await ctx.replyWithPhoto(new InputFile({ url: result.url }), {
      caption:
        `✨ *${escapeMarkdown(displayPrompt)}*\n` +
        `📐 ${escapeMarkdown(sizeStr)} · seed: \`${result.seed}\`\n` +
        `💵 ${escapeMarkdown(formatCost(cost))} · 💰 ${escapeMarkdown(balanceAfterRub)}`,
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

function formatSize(w: number, h: number): string {
  if (!w || !h) return "auto";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  return `${w}×${h} (${w / d}:${h / d})`;
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
