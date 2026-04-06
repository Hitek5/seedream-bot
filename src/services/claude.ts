import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not set");
    }
    client = new Anthropic({ apiKey: config.anthropicKey });
  }
  return client;
}

/**
 * Analyze an image with Claude Vision and a custom system prompt.
 * Returns the text response.
 */
export async function analyzeImageWithClaude(
  imageUrl: string,
  systemPrompt: string,
  userPrompt: string = "Analyze this image.",
): Promise<string> {
  const anthropic = getClient();

  // Fetch image and convert to base64 (Claude API needs base64 for URLs)
  const response = await fetch(imageUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString("base64");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const mediaType = contentType.split(";")[0].trim() as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  const result = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const text = result.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  if (!text) throw new Error("Claude returned empty response");
  return text;
}

/**
 * Generate text with Claude (no image). Used for CAD code generation.
 */
export async function generateWithClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096,
): Promise<string> {
  const anthropic = getClient();

  const result = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = result.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  if (!text) throw new Error("Claude returned empty response");
  return text;
}
