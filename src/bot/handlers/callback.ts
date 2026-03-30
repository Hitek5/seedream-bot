import { Bot } from "grammy";

// Temporary in-memory stores until SQLite in Phase 3
export const promptStore = new Map<string, string>();

// userId → { prompt, refImageUrl } — waiting for user's face photo
export const pendingFaceSwap = new Map<number, { prompt: string; refImageUrl?: string }>();

export function registerCallbackHandler(bot: Bot): void {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [action, id] = data.split(":");
    const userId = ctx.from?.id;

    const prompt = id ? promptStore.get(id) : undefined;
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
            "💰 Стоимость: ~$0.04–0.08\n" +
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
        await ctx.answerCallbackQuery({ text: "🔄 Генерирую новый вариант..." });
        await ctx.replyWithChatAction("upload_photo");
        const typingInterval = setInterval(() => {
          ctx.replyWithChatAction("upload_photo").catch(() => {});
        }, 4000);

        try {
          const { generateImage } = await import("../../services/seedream.js");
          const result = await generateImage(prompt);

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
            .text("💾 Сохранить", `save_prompt:${newId}`);

          const w = result.width ?? "?";
          const h = result.height ?? "?";
          const seed = result.seed ?? "random";

          await ctx.replyWithPhoto(new IF({ url: result.url }), {
            caption: `🔄 Новый вариант\n📐 ${w}×${h} · seed: ${seed}`,
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

      default:
        await ctx.answerCallbackQuery({ text: "Неизвестное действие" });
    }
  });
}
