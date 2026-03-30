import { Bot, InlineKeyboard } from "grammy";
import { analyzeImage } from "../../services/vision.js";
import { promptStore, pendingFaceSwap } from "./callback.js";

export function registerPhotoHandler(bot: Bot): void {
  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is uploading their face photo for a pending generation
    const pending = pendingFaceSwap.get(userId);
    if (pending) {
      pendingFaceSwap.delete(userId);
      
      await ctx.replyWithChatAction("upload_photo");
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("upload_photo").catch(() => {});
      }, 4000);

      try {
        // Get user's photo URL
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const file = await ctx.api.getFile(photo.file_id);
        const userPhotoUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

        // Import dynamically to avoid circular deps
        const { generateWithFaceSwap } = await import("../../services/seedream.js");
        const result = await generateWithFaceSwap(pending.prompt, userPhotoUrl);

        await ctx.replyWithPhoto(new (await import("grammy")).InputFile({ url: result.url }), {
          caption: `✨ Готово! Твоё фото + промпт\n📐 ${result.width}×${result.height} · seed: ${result.seed}`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Неизвестная ошибка";
        await ctx.reply(`Ошибка генерации: ${msg}`);
      } finally {
        clearInterval(typingInterval);
      }
      return;
    }

    // Otherwise — analyze the reference image
    await ctx.replyWithChatAction("typing");

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);

    try {
      const prompt = await analyzeImage(fileUrl);

      const id = Date.now().toString(36);
      promptStore.set(id, prompt);

      // Store reference image URL too
      promptStore.set(`ref_${id}`, fileUrl);

      const keyboard = new InlineKeyboard()
        .text("🧑 Создать с моим фото", `face_swap:${id}`)
        .row()
        .text("✏️ Редактировать промпт", `edit_prompt:${id}`)
        .text("💾 В библиотеку", `save_prompt:${id}`);

      const cost = "$0.04–0.08";
      const time = "~15–30 сек";

      await ctx.reply(
        `📝 *Промпт по картинке:*\n\n\`${escapeMarkdown(prompt)}\`\n\n` +
          `💰 Стоимость: ${escapeMarkdown(cost)}\n⏱ Время: ${escapeMarkdown(time)}`,
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
