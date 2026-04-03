import { Bot, InlineKeyboard, InputFile } from "grammy";
import { analyzeImage, extractHairColor } from "../../services/vision.js";
import { promptStore, pendingFaceSwap, buildParamKeyboard, buildParamText } from "./callback.js";

export function registerPhotoHandler(bot: Bot): void {
  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is uploading their face photo for a pending generation
    const pending = pendingFaceSwap.get(userId);
    if (pending && !pending.userPhotoUrl) {
      // Get user's photo URL
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      const userPhotoUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

      await ctx.replyWithChatAction("typing");

      // Analyze hair color from photo
      let hairColor: string | null = null;
      try {
        hairColor = await extractHairColor(userPhotoUrl);
      } catch (error) {
        console.error("[extractHairColor] error:", error);
      }

      // Update pending state
      pending.userPhotoUrl = userPhotoUrl;
      pending.hairColor = hairColor;
      pendingFaceSwap.set(userId, pending);

      // Show parameter selection keyboard
      const keyboard = buildParamKeyboard(pending);
      const text = buildParamText(pending);

      await ctx.reply(text, { reply_markup: keyboard });
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
        .text("💾 В библиотеку", `save_prompt:${id}`)
        .row()
        .text("🏠 Сначала", `restart:0`);

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
