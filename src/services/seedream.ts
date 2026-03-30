import { fal } from "@fal-ai/client";
import { config } from "../config.js";

fal.config({ credentials: config.falKey });

const ENDPOINT = "fal-ai/bytedance/seedream/v4.5/text-to-image" as const;

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

export async function generateImage(
  prompt: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const result = await fal.subscribe(ENDPOINT, {
    input: {
      prompt,
      image_size: options.imageSize ?? config.defaultSize,
      num_images: 1,
      ...(options.seed != null && { seed: options.seed }),
    },
  });

  const data = result.data as {
    images: Array<{ url: string; width: number; height: number }>;
    seed: number;
  };

  const image = data.images[0];
  if (!image) {
    throw new Error("No image returned from Seedream API");
  }

  return {
    url: image.url,
    seed: data.seed,
    width: image.width,
    height: image.height,
  };
}
