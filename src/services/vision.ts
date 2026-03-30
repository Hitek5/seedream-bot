import { fal } from "@fal-ai/client";
import { config } from "../config.js";

fal.config({ credentials: config.falKey });

const FLORENCE_ENDPOINT = "fal-ai/florence-2-large/more-detailed-caption" as const;

/**
 * Analyze an image and generate a Seedream v4.5 prompt.
 * Uses Florence-2 (fal.ai) for detailed captioning, then enhances into a generation prompt.
 */
export async function analyzeImage(imageUrl: string): Promise<string> {
  // Step 1: Get detailed caption from Florence-2
  const result = await fal.subscribe(FLORENCE_ENDPOINT, {
    input: { image_url: imageUrl },
  });

  const data = result.data as { results: string };
  const caption = typeof data.results === "string" ? data.results : String(data.results);

  if (!caption) {
    throw new Error("Florence-2 returned empty caption");
  }

  // Step 2: Enhance caption into a proper Seedream v4.5 prompt
  const prompt = enhancePrompt(caption);
  return prompt;
}

/**
 * Enhance a basic image caption into a detailed Seedream v4.5 generation prompt.
 */
function enhancePrompt(caption: string): string {
  // Clean up caption
  let prompt = caption.trim();

  // Add quality modifiers for Seedream v4.5
  const qualityTags = [
    "highly detailed",
    "professional photography",
    "cinematic lighting",
    "8K resolution",
    "sharp focus",
  ];

  // Don't add tags if they're already present
  const tagsToAdd = qualityTags.filter(
    (tag) => !prompt.toLowerCase().includes(tag.toLowerCase()),
  );

  if (tagsToAdd.length > 0) {
    prompt += `, ${tagsToAdd.join(", ")}`;
  }

  return prompt;
}
