import { fal } from "@fal-ai/client";
import { config } from "../config.js";

fal.config({ credentials: config.falKey });

// Background removal endpoint
const REMBG_ENDPOINT = "fal-ai/birefnet" as const;

// 3D generation endpoints (ordered by quality/price)
const THREED_ENDPOINTS = {
  hunyuan_turbo: "fal-ai/hunyuan3d/v2/mini/turbo" as const, // $0.08, fast, good quality
  trellis: "fal-ai/trellis" as const, // $0.02, cheap
  triposr: "fal-ai/triposr" as const, // $0.07, fastest (<0.5s)
};

export type ThreeDQuality = "fast" | "standard" | "high";

export interface ThreeDResult {
  modelUrl: string; // URL to GLB file
  format: string;
  quality: ThreeDQuality;
}

/**
 * Remove background from an image (required for clean 3D generation).
 */
export async function removeBackground(imageUrl: string): Promise<string> {
  const result = await fal.subscribe(REMBG_ENDPOINT, {
    input: { image_url: imageUrl },
  });

  const data = result.data as { image: { url: string } };
  if (!data?.image?.url) {
    throw new Error("Background removal returned no image");
  }
  return data.image.url;
}

/**
 * Generate a 3D model from an image.
 * Returns URL to a GLB file.
 */
export async function generateThreeD(
  imageUrl: string,
  quality: ThreeDQuality = "standard",
): Promise<ThreeDResult> {
  switch (quality) {
    case "fast":
      return generateTripoSR(imageUrl);
    case "standard":
      return generateHunyuanTurbo(imageUrl);
    case "high":
      return generateTrellis(imageUrl);
  }
}

async function generateTripoSR(imageUrl: string): Promise<ThreeDResult> {
  const result = await fal.subscribe(THREED_ENDPOINTS.triposr, {
    input: {
      image_url: imageUrl,
      output_format: "glb",
      mc_resolution: 256,
      foreground_ratio: 0.9,
    },
  });

  const data = result.data as { model_mesh: { url: string; file_name: string } };
  if (!data?.model_mesh?.url) {
    throw new Error("TripoSR returned no mesh");
  }

  return { modelUrl: data.model_mesh.url, format: "glb", quality: "fast" };
}

async function generateHunyuanTurbo(imageUrl: string): Promise<ThreeDResult> {
  const result = await fal.subscribe(THREED_ENDPOINTS.hunyuan_turbo, {
    input: {
      input_image_url: imageUrl,
      octree_resolution: 256,
      num_inference_steps: 30,
      guidance_scale: 5.5,
    },
  });

  const data = result.data as { model_mesh: { url: string } };
  if (!data?.model_mesh?.url) {
    throw new Error("Hunyuan3D returned no mesh");
  }

  return { modelUrl: data.model_mesh.url, format: "glb", quality: "standard" };
}

async function generateTrellis(imageUrl: string): Promise<ThreeDResult> {
  const result = await fal.subscribe(THREED_ENDPOINTS.trellis, {
    input: {
      image_url: imageUrl,
      ss_sampling_steps: 30,
      slat_sampling_steps: 30,
      mesh_simplify: 0.9,
    },
  });

  const data = result.data as { model_mesh: { url: string } };
  if (!data?.model_mesh?.url) {
    throw new Error("Trellis returned no mesh");
  }

  return { modelUrl: data.model_mesh.url, format: "glb", quality: "high" };
}
