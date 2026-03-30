import { Bot, InputFile } from "grammy";
import { generateImage } from "../../services/seedream.js";

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

      case "generate": {
        await ctx.answerCallbackQuery();
        await ctx.replyWithChatAction("upload_photo");

        const typingInterval = setInterval(() => {
          ctx.replyWithChatAction("upload_photo").catch(() => {});
        }, 4000);

        try {
          const result = await generateImage(prompt);
          await ctx.replyWithPhoto(new InputFile({ url: result.url }), {
            caption: `✨ Сгенерировано\n📐 ${result.width}×${result.height} · seed: ${result.seed}`,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
          await ctx.reply(`Ошибка генерации: ${msg}`);
        } finally {
          clearInterval(typingInterval);
        }
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

      default:
        await ctx.answerCallbackQuery({ text: "Неизвестное действие" });
    }
  });
}
