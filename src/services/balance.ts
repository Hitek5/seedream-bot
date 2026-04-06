import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BALANCE_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../data/balances.json");

// Costs per operation (USD) — internal
export const COSTS = {
  textToImage: 0.04,
  faceSwap: 0.08,
  threeDFast: 0.08,     // TripoSR
  threeDStandard: 0.10,  // Hunyuan3D mini turbo + background removal
  threeDHigh: 0.05,      // Trellis + background removal
  cadGeneration: 0.02,   // Claude Vision + Claude code gen (no GPU cost)
} as const;

// Display markup: user sees cost ×3 in RUB
const MARKUP = 3;
const USD_TO_RUB = 80;

type Balances = Record<string, number>;

function ensureDir(): void {
  const dir = dirname(BALANCE_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadBalances(): Balances {
  try {
    if (existsSync(BALANCE_FILE)) {
      return JSON.parse(readFileSync(BALANCE_FILE, "utf-8"));
    }
  } catch {
    // corrupted file — reset
  }
  return {};
}

function saveBalances(balances: Balances): void {
  ensureDir();
  writeFileSync(BALANCE_FILE, JSON.stringify(balances, null, 2));
}

export function getBalance(userId: number): number {
  const balances = loadBalances();
  return balances[String(userId)] ?? 0;
}

export function setBalance(userId: number, amount: number): void {
  const balances = loadBalances();
  balances[String(userId)] = Math.round(amount * 100) / 100;
  saveBalances(balances);
}

export function deductBalance(userId: number, cost: number): boolean {
  const balance = getBalance(userId);
  if (balance < cost) return false;
  setBalance(userId, balance - cost);
  return true;
}

export function addBalance(userId: number, amount: number): number {
  const current = getBalance(userId);
  const newBalance = current + amount;
  setBalance(userId, newBalance);
  return newBalance;
}

/** Show balance in RUB (internal USD × rate) */
export function formatBalance(userId: number): string {
  const rub = getBalance(userId) * USD_TO_RUB;
  return `${Math.round(rub)} ₽`;
}

/** Show cost in RUB (internal USD × markup × rate) */
export function formatCost(cost: number): string {
  const rub = cost * MARKUP * USD_TO_RUB;
  return `${rub.toFixed(1)} ₽`;
}

/** Balance in RUB for display */
export function getBalanceRub(userId: number): string {
  const rub = getBalance(userId) * USD_TO_RUB;
  return `${Math.round(rub)} ₽`;
}
