import { Bot, InlineKeyboard, InputFile } from "grammy";
import { getBalance, deductBalance, formatBalance, formatCost, getBalanceRub, COSTS } from "../../services/balance.js";

function formatSize(w: number, h: number): string {
  if (!w || !h) return "auto";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  return `${w}×${h} (${w / d}:${h / d})`;
}

// Temporary in-memory stores until SQLite in Phase 3
export const promptStore = new Map<string, string>();

// Extended face swap state
export interface PendingFaceSwapState {
  prompt: string;
  refImageUrl?: string;
  userPhotoUrl?: string;
  hairColor?: string | null;
  height?: string;
  bodyType?: string;
  hairstyle?: string;
  messageId?: number; // message with inline keyboard to edit
  chatId?: number;
}

// userId → state — waiting for user's face photo or param selection
export const pendingFaceSwap = new Map<number, PendingFaceSwapState>();

// Hairstyle options
const hairstyleOptions: Array<{ key: string; label: string; prompt: string }> = [
  { key: "loose_waves", label: "🌊 Локоны", prompt: "loose wavy hair, soft flowing waves" },
  { key: "straight", label: "✨ Прямые", prompt: "sleek straight hair, smooth and shiny" },
  { key: "ponytail", label: "💇‍♀️ Хвост", prompt: "high ponytail, elegant pulled-back hair" },
  { key: "bun", label: "💫 Пучок", prompt: "messy bun updo, stylish top knot" },
  { key: "bob", label: "✂️ Каре", prompt: "bob haircut, chin-length sleek bob" },
];

/** Build the parameter selection inline keyboard, highlighting chosen values */
function buildParamKeyboard(state: PendingFaceSwapState): InlineKeyboard {
  const h = state.height;
  const b = state.bodyType;
  const hs = state.hairstyle;

  const kb = new InlineKeyboard()
    .text(
      `${h === "tall" ? "✅ " : "🔹 "}Высокая (170-180)`,
      "fs_height:tall",
    )
    .text(
      `${h === "medium" ? "✅ " : "🔸 "}Средняя (160-170)`,
      "fs_height:medium",
    )
    .text(
      `${h === "petite" ? "✅ " : "🔻 "}Миниатюрная (150-160)`,
      "fs_height:petite",
    )
    .row()
    .text(
      `${b === "slim" ? "✅ " : ""}Стройная`,
      "fs_body:slim",
    )
    .text(
      `${b === "athletic" ? "✅ " : ""}Спортивная`,
      "fs_body:athletic",
    )
    .text(
      `${b === "curvy" ? "✅ " : ""}Пышная`,
      "fs_body:curvy",
    )
    .text(
      `${b === "average" ? "✅ " : ""}Обычная`,
      "fs_body:average",
    )
    .row();

  // Hairstyle buttons (2 rows: 3 + 2)
  for (let i = 0; i < hairstyleOptions.length; i++) {
    const opt = hairstyleOptions[i];
    kb.text(
      `${hs === opt.key ? "✅ " : ""}${opt.label}`,
      `fs_hair:${opt.key}`,
    );
    if (i === 2) kb.row(); // break after 3rd
  }

  kb.row().text("🏠 Сначала", "restart:0");

  return kb;
}

/** Build the text message shown with the param keyboard */
function buildParamText(state: PendingFaceSwapState): string {
  const hairLine = state.hairColor
    ? `💇 Цвет волос (авто): ${state.hairColor}`
    : "💇 Цвет волос: не определён";

  const heightLine = state.height
    ? `📏 Рост: ${({ tall: "Высокая", medium: "Средняя", petite: "Миниатюрная" } as Record<string, string>)[state.height] ?? state.height}`
    : "📏 Рост: не выбран";

  const bodyLine = state.bodyType
    ? `🏋️ Фигура: ${({ slim: "Стройная", athletic: "Спортивная", curvy: "Пышная", average: "Обычная" } as Record<string, string>)[state.bodyType] ?? state.bodyType}`
    : "🏋️ Фигура: не выбрана";

  const hairstyleLine = state.hairstyle
    ? `💇‍♀️ Причёска: ${hairstyleOptions.find(o => o.key === state.hairstyle)?.label ?? state.hairstyle}`
    : "💇‍♀️ Причёска: авто (по фото)";

  let text = `📸 Фото получено! Настрой параметры:\n\n${hairLine}\n${heightLine}\n${bodyLine}\n${hairstyleLine}\n\n`;

  if (state.height && state.bodyType) {
    text += "✅ Всё выбрано — генерирую...";
  } else {
    text += "⬇️ Выбери рост и фигуру для генерации:";
  }

  return text;
}

export function registerCallbackHandler(bot: Bot): void {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from?.id;

    // Handle face swap parameter buttons
    if (data.startsWith("fs_height:") || data.startsWith("fs_body:") || data.startsWith("fs_hair:")) {
      if (!userId) {
        await ctx.answerCallbackQuery();
        return;
      }

      const state = pendingFaceSwap.get(userId);
      if (!state || !state.userPhotoUrl) {
        await ctx.answerCallbackQuery({ text: "Сессия истекла. Начни заново." });
        return;
      }

      if (data.startsWith("fs_height:")) {
        state.height = data.split(":")[1];
      } else if (data.startsWith("fs_body:")) {
        state.bodyType = data.split(":")[1];
      } else if (data.startsWith("fs_hair:")) {
        state.hairstyle = data.split(":")[1];
      }

      // Both selected → generate
      if (state.height && state.bodyType) {
        const fsCost = COSTS.faceSwap;
        if (userId) {
          const bal = getBalance(userId);
          if (bal < fsCost) {
            await ctx.answerCallbackQuery({ text: `❌ Недостаточно средств (${formatBalance(userId)})` });
            return;
          }
        }
        await ctx.answerCallbackQuery({ text: "🎨 Генерирую..." });

        // Update message to show final state
        try {
          await ctx.editMessageText(buildParamText(state));
        } catch { /* ignore edit errors */ }

        await ctx.replyWithChatAction("upload_photo");
        const typingInterval = setInterval(() => {
          ctx.replyWithChatAction("upload_photo").catch(() => {});
        }, 4000);

        try {
          const { generateWithFaceSwap } = await import("../../services/seedream.js");
          const hairstylePrompt = state.hairstyle
            ? hairstyleOptions.find(o => o.key === state.hairstyle)?.prompt
            : undefined;

          const result = await generateWithFaceSwap(
            state.prompt,
            state.userPhotoUrl,
            {},
            {
              height: state.height,
              bodyType: state.bodyType,
              hairColor: state.hairColor,
              hairstyle: hairstylePrompt,
            },
          );

          if (userId) deductBalance(userId, fsCost);
          pendingFaceSwap.delete(userId);

          const resultId = Date.now().toString(36);
          promptStore.set(resultId, state.prompt);
          promptStore.set(`seed_${resultId}`, String(result.seed));

          const w = result.width || 0;
          const h = result.height || 0;
          const seed = result.seed ?? "random";
          const balAfterRubFs = userId ? formatBalance(userId) : "0 ₽";

          const { InlineKeyboard: IK, InputFile: IF } = await import("grammy");
          const resultKeyboard = new IK()
            .text("🔄 Ещё вариант", `regenerate:${resultId}`)
            .text("🔍 Увеличить", `upscale:${resultId}`)
            .row()
            .text("✏️ Изменить промпт", `edit_prompt:${resultId}`)
            .text("🧑 Другое фото", `face_swap:${resultId}`)
            .row()
            .text("💾 Сохранить", `save_prompt:${resultId}`)
            .text("🏠 Сначала", `restart:0`);

          await ctx.replyWithPhoto(new IF({ url: result.url }), {
            caption: `✨ Готово! Твоё фото + промпт\n📐 ${formatSize(w, h)} · seed: ${seed}\n💵 ${formatCost(fsCost)} · 💰 ${balAfterRubFs}`,
            reply_markup: resultKeyboard,
          });
        } catch (error) {
          pendingFaceSwap.delete(userId);
          const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
          await ctx.reply(`Ошибка генерации: ${msg}`);
        } finally {
          clearInterval(typingInterval);
        }
      } else {
        // Update keyboard to show selection
        await ctx.answerCallbackQuery();
        try {
          await ctx.editMessageText(buildParamText(state), {
            reply_markup: buildParamKeyboard(state),
          });
        } catch { /* ignore if message didn't change */ }
      }

      return;
    }

    // Original callback handlers
    const [action, id] = data.split(":");
    let prompt = id ? promptStore.get(id) : undefined;

    // Fallback: extract prompt from the message caption (survives bot restarts)
    if (!prompt && ctx.callbackQuery.message) {
      const caption = (ctx.callbackQuery.message as any).caption as string | undefined;
      if (caption) {
        // Caption format: "✨ <prompt>\n📐 ..." — extract between ✨ and newline
        const match = caption.match(/✨\s*(.+?)(?:\n|$)/);
        if (match) {
          prompt = match[1].trim();
          // Re-store for future button presses
          if (id) {
            promptStore.set(id, prompt);
          }
        }
      }
    }

    if (!prompt) {
      await ctx.answerCallbackQuery({ text: "Промпт не найден (истёк)" });
      return;
    }

    switch (action) {
      case "face_swap": {
        // Ask user to upload their photo
        if (!userId) break;
        
        const refImageUrl = promptStore.get(`ref_${id}`);
        pendingFaceSwap.set(userId, { prompt, refImageUrl });

        await ctx.answerCallbackQuery();
        await ctx.reply(
          "📷 Отправь своё фото (портрет, лицо видно чётко).\n\n" +
            "Я совмещу твоё лицо с образом из промпта.\n" +
            `💰 Стоимость: ${formatCost(COSTS.faceSwap)}\n` +
            "⏱ Время: ~15–30 секунд",
        );
        break;
      }

      case "save_prompt": {
        console.log(`[save_prompt] id=${id} prompt="${prompt.slice(0, 80)}..."`);
        await ctx.answerCallbackQuery({ text: "💾 Сохранено в библиотеку" });
        break;
      }

      case "edit_prompt": {
        await ctx.answerCallbackQuery();
        await ctx.reply(
          "✏️ Отправь исправленный промпт текстом.\n\n" +
            `Текущий:\n\`${prompt}\``,
          { parse_mode: "Markdown" },
        );
        break;
      }

      case "regenerate": {
        const regenCost = COSTS.textToImage;
        if (userId) {
          const bal = getBalance(userId);
          if (bal < regenCost) {
            await ctx.answerCallbackQuery({ text: `❌ Недостаточно средств (${formatBalance(userId)})` });
            break;
          }
        }
        await ctx.answerCallbackQuery({ text: "🔄 Генерирую новый вариант..." });
        await ctx.replyWithChatAction("upload_photo");
        const typingInterval = setInterval(() => {
          ctx.replyWithChatAction("upload_photo").catch(() => {});
        }, 4000);

        try {
          const { generateImage } = await import("../../services/seedream.js");
          const result = await generateImage(prompt);

          if (userId) deductBalance(userId, regenCost);

          const newId = Date.now().toString(36);
          promptStore.set(newId, prompt);
          promptStore.set(`seed_${newId}`, String(result.seed));

          const { InlineKeyboard: IK, InputFile: IF } = await import("grammy");
          const kb = new IK()
            .text("🔄 Ещё вариант", `regenerate:${newId}`)
            .text("🔍 Увеличить", `upscale:${newId}`)
            .row()
            .text("✏️ Изменить промпт", `edit_prompt:${newId}`)
            .text("🧑 С моим фото", `face_swap:${newId}`)
            .row()
            .text("💾 Сохранить", `save_prompt:${newId}`)
            .text("🏠 Сначала", `restart:0`);

          const w = result.width || 0;
          const h = result.height || 0;
          const seed = result.seed ?? "random";
          const balAfterRub = userId ? formatBalance(userId) : "0 ₽";

          await ctx.replyWithPhoto(new IF({ url: result.url }), {
            caption: `🔄 Новый вариант\n📐 ${formatSize(w, h)} · seed: ${seed}\n💵 ${formatCost(regenCost)} · 💰 ${balAfterRub}`,
            reply_markup: kb,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
          await ctx.reply(`Ошибка генерации: ${msg}`);
        } finally {
          clearInterval(typingInterval);
        }
        break;
      }

      case "upscale": {
        await ctx.answerCallbackQuery({ text: "🔍 Upscale пока в разработке" });
        break;
      }

      case "restart": {
        // Clear any pending state
        if (userId) {
          pendingFaceSwap.delete(userId);
        }
        await ctx.answerCallbackQuery();
        await ctx.reply(
          "🔄 Начинаем заново!\n\n" +
            "📷 Отправь фото — я проанализирую и предложу промпт.\n" +
            "✍️ Или напиши текст — я сгенерирую картинку.",
        );
        break;
      }

      default:
        await ctx.answerCallbackQuery({ text: "Неизвестное действие" });
    }
  });
}

// Export for use in photo.ts
export { buildParamKeyboard, buildParamText };
