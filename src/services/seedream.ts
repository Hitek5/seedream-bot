import { fal } from "@fal-ai/client";
import { config } from "../config.js";

fal.config({ credentials: config.falKey });

const T2I_ENDPOINT = "fal-ai/bytedance/seedream/v4.5/text-to-image" as const;
const EDIT_ENDPOINT = "fal-ai/bytedance/seedream/v4.5/edit" as const;

export interface GenerateOptions {
  imageSize?: string;
  seed?: number;
}

export interface GenerateResult {
  url: string;
  seed: number;
  width: number;
  height: number;
}

/**
 * Text-to-image generation via Seedream v4.5
 */
export async function generateImage(
  prompt: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const result = await fal.subscribe(T2I_ENDPOINT, {
    input: {
      prompt,
      image_size: options.imageSize ?? config.defaultSize,
      num_images: 1,
      ...(options.seed != null && { seed: options.seed }),
    },
  });

  return parseImageResult(result.data);
}

/**
 * Upload a Telegram file URL to fal.ai storage (Telegram URLs are not publicly accessible).
 */
async function uploadToFal(telegramUrl: string): Promise<string> {
  const response = await fetch(telegramUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
  const falUrl = await fal.storage.upload(file);
  return falUrl;
}

/**
 * Generate image with face/body swap using Seedream v4.5 edit.
 * Takes a prompt + user's face photo as reference.
 */
export async function generateWithFaceSwap(
  prompt: string,
  userPhotoUrl: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  // Upload user's photo to fal.ai storage (Telegram URLs aren't public)
  const falImageUrl = await uploadToFal(userPhotoUrl);

  // Seedream v4.5 edit: image_urls is an array, prompt references "Figure 1"
  const editPrompt = `Using the person's face and body from Figure 1 as reference, generate: ${prompt}. Keep the person's facial features exactly as in Figure 1.`;

  const result = await fal.subscribe(EDIT_ENDPOINT, {
    input: {
      prompt: editPrompt,
      image_urls: [falImageUrl],
      num_images: 1,
      ...(options.seed != null && { seed: options.seed }),
    },
  });

  return parseImageResult(result.data);
}

function parseImageResult(data: unknown): GenerateResult {
  const d = data as Record<string, unknown>;

  // fal.ai может вернуть images[] или output.images[] — пробуем оба
  let images = d.images as Array<{ url: string; width?: number; height?: number }> | undefined;
  if (!images && d.output) {
    images = (d.output as Record<string, unknown>).images as typeof images;
  }

  const image = images?.[0];
  if (!image) {
    console.error("[parseImageResult] unexpected response shape:", JSON.stringify(d).slice(0, 500));
    throw new Error("No image returned from Seedream API");
  }

  return {
    url: image.url,
    seed: (d.seed as number) ?? 0,
    width: image.width ?? 0,
    height: image.height ?? 0,
  };
}
