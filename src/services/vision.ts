import OpenAI from "openai";
import { config } from "../config.js";

const client = new OpenAI({ apiKey: config.openaiKey });

const SYSTEM_PROMPT =
  "You are an expert prompt engineer for Seedream v4.5 image generation model. " +
  "Given a reference image, create a detailed text-to-image prompt in English that would recreate a similar image. " +
  "Include: composition, lighting, camera angle, colors, mood, style, clothing details, pose, background, artistic style. " +
  "Be specific and vivid. Output ONLY the prompt, nothing else.";

export async function analyzeImage(imageUrl: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Vision API returned empty response");
  }
  return text;
}
