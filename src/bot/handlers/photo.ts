import { Bot, InlineKeyboard } from "grammy";
import { analyzeImage } from "../../services/vision.js";
import { promptStore } from "./callback.js";

export function registerPhotoHandler(bot: Bot): void {
  bot.on("message:photo", async (ctx) => {
    await ctx.replyWithChatAction("typing");

    // Get the largest photo size
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);

    try {
      const prompt = await analyzeImage(fileUrl);

      // Store prompt for callback buttons
      const id = Date.now().toString(36);
      promptStore.set(id, prompt);

      const keyboard = new InlineKeyboard()
        .text("💾 В библиотеку", `save_prompt:${id}`)
        .text("🎨 Сгенерировать", `generate:${id}`)
        .row()
        .text("✏️ Редактировать промпт", `edit_prompt:${id}`);

      await ctx.reply(
        `📝 *Промпт по картинке:*\n\n\`${escapeMarkdown(prompt)}\``,
        { parse_mode: "MarkdownV2", reply_markup: keyboard },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
      await ctx.reply(`Ошибка анализа: ${msg}`);
    } finally {
      clearInterval(typingInterval);
    }
  });
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
