/**
 * Billing adapter for pybot.billing HTTP server.
 *
 * Drop-in wrapper that forwards balance/charge operations to billing_server.py
 * running on BILLING_URL (default http://127.0.0.1:18791).
 *
 * job_id convention: callers supply an opaque string unique to the operation.
 * For generation ops use: `gen:<type>:<tg_update_id>` (Telegram update IDs are
 * unique per-bot, making them a natural idempotency key).
 */

const BILLING_URL = process.env.BILLING_URL ?? "http://127.0.0.1:18791";

export { COSTS } from "./balance.js";

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${BILLING_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await resp.json()) as { ok: boolean; result?: T; error?: string };
  if (!data.ok) throw new Error(`billing: ${data.error}`);
  return data.result as T;
}

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${BILLING_URL}${path}`);
  const data = (await resp.json()) as { ok: boolean; result?: T; error?: string };
  if (!data.ok) throw new Error(`billing: ${data.error}`);
  return data.result as T;
}

export async function getBalanceRemote(userId: number): Promise<number> {
  const r = await get<{ balance_usd: number }>(`/balance/${userId}`);
  return r.balance_usd;
}

export async function addBalanceRemote(userId: number, amountUsd: number): Promise<number> {
  const r = await post<{ balance_usd: number }>("/balance/add", {
    user_id: userId,
    amount_usd: amountUsd,
  });
  return r.balance_usd;
}

/**
 * Idempotent charge. job_id must be unique per logical operation; safe to
 * retry with the same job_id if the process crashes before the Telegram reply.
 *
 * Returns false if balance is insufficient (HTTP 402).
 */
export async function chargeOnce(
  jobId: string,
  userId: number,
  amountUsd: number,
  description = "",
): Promise<boolean> {
  try {
    await post("/charge", {
      job_id: jobId,
      user_id: userId,
      amount_usd: amountUsd,
      description,
    });
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("billing:")) {
      return false; // InsufficientFunds
    }
    throw err;
  }
}

export async function refundCharge(jobId: string): Promise<void> {
  await post("/refund", { job_id: jobId });
}

const USD_TO_RUB = 80;
const MARKUP = 3;

export function formatBalanceUsd(usd: number): string {
  return `${Math.round(usd * USD_TO_RUB)} ₽`;
}

export function formatCostUsd(usd: number): string {
  return `${(usd * MARKUP * USD_TO_RUB).toFixed(1)} ₽`;
}
