import { fal } from "@fal-ai/client";
import { config } from "../config.js";
import { analyzeImageWithClaude } from "./claude.js";

fal.config({ credentials: config.falKey });

const FLORENCE_ENDPOINT = "fal-ai/florence-2-large/more-detailed-caption" as const;

// Seedream v4.5 prompt engineering system prompt
const SEEDREAM_SYSTEM_PROMPT = `You are a Seedream v4.5 prompt engineer. Analyze the image and generate an optimal generation prompt that would reproduce a similar image.

Structure your prompt as a single flowing paragraph covering:
1. Subject: who/what is the main subject, physical details, expression, pose
2. Action/State: what's happening
3. Environment: setting, background, depth
4. Lighting: type, direction, color temperature, shadows
5. Camera: angle, lens feel (wide/tele/macro), depth of field
6. Style: photographic/painterly/3D/illustration, artistic references if recognizable
7. Color palette: dominant and accent colors
8. Mood/Atmosphere: emotional tone

Rules:
- Output ONLY the prompt text, no labels, no markdown, no quotes
- Start with the main subject
- Be specific and descriptive (80-150 words)
- Do NOT add generic quality tags like "8K", "highly detailed", "masterpiece" — Seedream handles quality automatically
- If there is text in the image, do not include it in the prompt
- Write in English`;

const SEEDREAM_USER_PROMPT = "Generate a Seedream v4.5 prompt for this image.";

// 3D-oriented description system prompt
const THREED_SYSTEM_PROMPT = `You are a 3D modeling expert. Describe this object for 3D reconstruction from a single image.

Include:
1. Overall shape and proportions (height:width:depth ratio)
2. Primary geometric primitives it resembles (cylinder, sphere, box, cone...)
3. Symmetry axes and planes
4. Surface details: texture, patterns, reliefs, engravings
5. Concavities, undercuts, thin features
6. Material appearance (matte/glossy, color, transparency)
7. What parts are visible vs occluded from this angle

Rules:
- Output a structured description, no markdown
- Be precise about proportions and spatial relationships
- Focus on geometry, not artistic interpretation
- Write in English`;

// CAD-oriented description system prompt
const CAD_SYSTEM_PROMPT = `You are a mechanical engineering expert. Describe this part for parametric CAD modeling.

Include:
1. Overall dimensions estimate (H×W×D proportions)
2. Base geometric primitives: plates, cylinders, cones, spheres, extrusions
3. Features: holes (through/blind, relative diameter), fillets (radius), chamfers, slots, ribs, bosses
4. Boolean operations needed: what should be subtracted/added
5. Symmetry: which axes, full or partial
6. Material hints: metal, plastic, rubber, wood
7. Mounting/connection features: bolt patterns, snap-fits, threads
8. Construction sequence: what to model first, then add/subtract

Rules:
- Output as a structured numbered list
- Be precise about relative proportions and feature sizes
- Think like a CAD operator building this in SolidWorks
- If uncertain about hidden features, note it explicitly
- Write in English`;

/**
 * Analyze image and generate a Seedream v4.5 prompt.
 * Uses Claude Vision as primary, Florence-2 as fallback.
 */
export async function analyzeImage(imageUrl: string): Promise<string> {
  // Try Claude Vision first
  if (config.anthropicKey) {
    try {
      const prompt = await analyzeImageWithClaude(
        imageUrl,
        SEEDREAM_SYSTEM_PROMPT,
        SEEDREAM_USER_PROMPT,
      );
      return prompt.trim();
    } catch (error) {
      console.error("[vision] Claude Vision failed, falling back to Florence-2:", error);
    }
  }

  // Fallback: Florence-2
  return analyzeImageFlorence(imageUrl);
}

/**
 * Analyze image for 3D reconstruction (used by /3d flow).
 */
export async function analyzeImageFor3D(imageUrl: string): Promise<string> {
  if (config.anthropicKey) {
    try {
      return await analyzeImageWithClaude(
        imageUrl,
        THREED_SYSTEM_PROMPT,
        "Describe this object for 3D reconstruction.",
      );
    } catch (error) {
      console.error("[vision] Claude 3D analysis failed:", error);
      throw error;
    }
  }
  throw new Error("Claude API key required for 3D analysis");
}

/**
 * Analyze image for CAD modeling (used by /cad flow).
 */
export async function analyzeImageForCAD(imageUrl: string): Promise<string> {
  if (config.anthropicKey) {
    try {
      return await analyzeImageWithClaude(
        imageUrl,
        CAD_SYSTEM_PROMPT,
        "Describe this engineering part for CAD modeling.",
      );
    } catch (error) {
      console.error("[vision] Claude CAD analysis failed:", error);
      throw error;
    }
  }
  throw new Error("Claude API key required for CAD analysis");
}

/**
 * Florence-2 fallback for basic image captioning.
 */
async function analyzeImageFlorence(imageUrl: string): Promise<string> {
  const result = await fal.subscribe(FLORENCE_ENDPOINT, {
    input: { image_url: imageUrl },
  });

  const data = result.data as { results: string };
  const caption = typeof data.results === "string" ? data.results : String(data.results);

  if (!caption) {
    throw new Error("Florence-2 returned empty caption");
  }

  return enhancePrompt(caption);
}

/**
 * Legacy: enhance a basic Florence-2 caption with quality tags.
 */
function enhancePrompt(caption: string): string {
  let prompt = caption.trim();

  const qualityTags = [
    "highly detailed",
    "professional photography",
    "cinematic lighting",
    "8K resolution",
    "sharp focus",
  ];

  const tagsToAdd = qualityTags.filter(
    (tag) => !prompt.toLowerCase().includes(tag.toLowerCase()),
  );

  if (tagsToAdd.length > 0) {
    prompt += `, ${tagsToAdd.join(", ")}`;
  }

  return prompt;
}

/**
 * Extract hair color from an image using Florence-2 captioning.
 */
export async function extractHairColor(imageUrl: string): Promise<string | null> {
  const result = await fal.subscribe(FLORENCE_ENDPOINT, {
    input: { image_url: imageUrl },
  });

  const data = result.data as { results: string };
  const caption = typeof data.results === "string" ? data.results : String(data.results);

  if (!caption) return null;

  const lower = caption.toLowerCase();

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
