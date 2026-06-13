import { fal } from "@fal-ai/client";
import type { Api } from "grammy";
import { config } from "../config.js";

fal.config({ credentials: config.falKey });

/**
 * Download a Telegram file by file_id and return its bytes.
 *
 * The Telegram download URL embeds the bot token
 * (https://api.telegram.org/file/bot<TOKEN>/<path>), so the URL must never
 * leave this process. Fetching it here (bot → Telegram API) is fine; only
 * the resulting Buffer is handed to callers.
 */
export async function getTelegramFileBuffer(api: Api, fileId: string): Promise<Buffer> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram getFile returned no file_path");
  }
  const url = `https://api.telegram.org/file/bot${api.token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Telegram file download failed: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Download a Telegram file and re-upload it to fal.ai storage.
 *
 * Returns a fal storage URL that is safe to pass to external services
 * (fal.ai endpoints, Claude Vision): unlike the Telegram file URL it does
 * not contain the bot token.
 */
export async function uploadTelegramFileToFal(api: Api, fileId: string): Promise<string> {
  const buffer = await getTelegramFileBuffer(api, fileId);
  // Copy into a plain Uint8Array: Buffer's ArrayBufferLike backing store is not
  // assignable to BlobPart under strict TypeScript.
  const file = new File([new Uint8Array(buffer)], "photo.jpg", { type: "image/jpeg" });
  return fal.storage.upload(file);
}
