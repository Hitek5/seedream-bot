import { Bot, InputFile } from "grammy";
import { generateImage } from "../../services/seedream.js";

// Temporary in-memory store until SQLite in Phase 3
export const promptStore = new Map<string, string>();

export function registerCallbackHandler(bot: Bot): void {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [action, id] = data.split(":");

    const prompt = id ? promptStore.get(id) : undefined;
    if (!prompt) {
      await ctx.answerCallbackQuery({ text: "Промпт не найден (истёк)" });
      return;
    }

    switch (action) {
      case "save_prompt": {
        // Phase 3: save to SQLite
        console.log(`[save_prompt] id=${id} prompt="${prompt.slice(0, 80)}..."`);
        await ctx.answerCallbackQuery({ text: "💾 Сохранено (пока в лог)" });
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
            caption: `✨ Сгенерировано по промпту из фото\n📐 ${result.width}×${result.height}`,
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
