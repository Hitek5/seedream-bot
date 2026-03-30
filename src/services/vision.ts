import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropicKey });

const SYSTEM_PROMPT =
  "You are an expert prompt engineer for Seedream v4.5 image generation model. " +
  "Given a reference image, create a detailed text-to-image prompt in English that would recreate a similar image. " +
  "Include: composition, lighting, camera angle, colors, mood, style, clothing details, pose, background, artistic style. " +
  "Be specific and vivid. Output ONLY the prompt, nothing else.";

export async function analyzeImage(imageUrl: string): Promise<string> {
  // Download image and convert to base64 for Anthropic API
  const response = await fetch(imageUrl);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  // Detect media type from URL or default to jpeg
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  if (imageUrl.includes(".png")) mediaType = "image/png";
  else if (imageUrl.includes(".webp")) mediaType = "image/webp";
  else if (imageUrl.includes(".gif")) mediaType = "image/gif";

  const result = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: "Analyze this image and create a detailed Seedream v4.5 prompt." },
        ],
      },
    ],
  });

  const text = result.content[0];
  if (!text || text.type !== "text" || !text.text.trim()) {
    throw new Error("Vision API returned empty response");
  }
  return text.text.trim();
}
