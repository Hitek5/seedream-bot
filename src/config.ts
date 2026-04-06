import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  falKey: required("FAL_KEY"),
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  adminIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter(Boolean),
  maxDailyImages: parseInt(process.env.MAX_DAILY_IMAGES ?? "20", 10),
  defaultSize: process.env.DEFAULT_SIZE ?? "auto_2K",
} as const;
