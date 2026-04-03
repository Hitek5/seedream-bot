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
 * Extract hair color from an image using Florence-2 captioning.
 * Returns a hair color string (e.g. "blonde", "black", "brown", "red") or null if not detected.
 */
export async function extractHairColor(imageUrl: string): Promise<string | null> {
  const result = await fal.subscribe(FLORENCE_ENDPOINT, {
    input: { image_url: imageUrl },
  });

  const data = result.data as { results: string };
  const caption = typeof data.results === "string" ? data.results : String(data.results);

  if (!caption) return null;

  const lower = caption.toLowerCase();

  // Map of patterns → hair color descriptors for prompt
  const hairPatterns: Array<[RegExp, string]> = [
    [/\b(platinum\s+)?blonde\b/, "blonde hair"],
    [/\bgolden\s+hair\b/, "golden blonde hair"],
    [/\blight\s+(brown\s+)?hair\b/, "light brown hair"],
    [/\bbrunette\b/, "brunette, brown hair"],
    [/\bbrown\s+hair\b/, "brown hair"],
    [/\bdark\s+hair\b/, "dark hair"],
    [/\bblack\s+hair\b/, "black hair"],
    [/\bred\s*[-\s]?hair\b/, "red hair"],
    [/\bredhead\b/, "red hair"],
    [/\bginger\b/, "ginger hair"],
    [/\bauburn\b/, "auburn hair"],
    [/\bwhite\s+hair\b/, "white hair"],
    [/\bgr[ae]y\s+hair\b/, "gray hair"],
    [/\bsilver\s+hair\b/, "silver hair"],
    [/\bpink\s+hair\b/, "pink hair"],
    [/\bblue\s+hair\b/, "blue hair"],
  ];

  for (const [pattern, color] of hairPatterns) {
    if (pattern.test(lower)) {
      return color;
    }
  }

  return null;
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
