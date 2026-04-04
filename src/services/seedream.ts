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

export interface FaceSwapParams {
  height?: string;
  bodyType?: string;
  hairColor?: string | null;
  hairstyle?: string;
}

/**
 * Generate image with face/body swap using Seedream v4.5 edit.
 * Takes a prompt + user's face photo as reference + optional body params.
 */
export async function generateWithFaceSwap(
  prompt: string,
  userPhotoUrl: string,
  options: GenerateOptions = {},
  faceSwapParams: FaceSwapParams = {},
): Promise<GenerateResult> {
  // Upload user's photo to fal.ai storage (Telegram URLs aren't public)
  const falImageUrl = await uploadToFal(userPhotoUrl);

  // Build body description from params
  const bodyParts: string[] = [];

  if (faceSwapParams.hairColor) {
    bodyParts.push(faceSwapParams.hairColor);
  }

  const heightMap: Record<string, string> = {
    tall: "tall, long legs, elongated elegant proportions, fashion model height",
    medium: "average height, natural proportions",
    petite: "petite, compact build, shorter stature",
  };

  const bodyTypeMap: Record<string, string> = {
    slim: "slim, slender body, lean figure",
    athletic: "athletic build, toned body, fit physique",
    curvy: "curvy figure, voluptuous, full-figured",
    average: "average build, natural body proportions",
  };

  if (faceSwapParams.height && heightMap[faceSwapParams.height]) {
    bodyParts.push(heightMap[faceSwapParams.height]);
  }
  if (faceSwapParams.bodyType && bodyTypeMap[faceSwapParams.bodyType]) {
    bodyParts.push(bodyTypeMap[faceSwapParams.bodyType]);
  }
  if (faceSwapParams.hairstyle) {
    bodyParts.push(faceSwapParams.hairstyle);
  }

  const bodyDesc = bodyParts.length > 0 ? `, ${bodyParts.join(", ")}` : "";

  // Seedream v4.5 edit: image_urls is an array, prompt references "Figure 1"
  const editPrompt = `Using the person's face and body from Figure 1 as reference, generate: ${prompt}${bodyDesc}. Keep the person's facial features exactly as in Figure 1.`;

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

  // Log response shape for debugging (first 500 chars)
  console.log("[parseImageResult] keys:", Object.keys(d), "images?", Array.isArray(d.images));

  // fal.ai может вернуть images[] или output.images[] — пробуем оба
  let images = d.images as Array<{ url: string; width?: number; height?: number; content_type?: string }> | undefined;
  if (!images && d.output) {
    images = (d.output as Record<string, unknown>).images as typeof images;
  }

  const image = images?.[0];
  if (!image) {
    console.error("[parseImageResult] unexpected response shape:", JSON.stringify(d).slice(0, 500));
    throw new Error("No image returned from Seedream API");
  }

  let w = image.width ?? 0;
  let h = image.height ?? 0;

  // fal.ai often returns 0×0 for auto sizes — try to extract from URL
  // URL pattern: .../{width}x{height}/... or query params
  if ((!w || !h) && image.url) {
    const sizeMatch = image.url.match(/\/(\d{3,4})x(\d{3,4})\//);
    if (sizeMatch) {
      w = parseInt(sizeMatch[1], 10);
      h = parseInt(sizeMatch[2], 10);
    }
  }

  return {
    url: image.url,
    seed: (d.seed as number) ?? 0,
    width: w,
    height: h,
  };
}
