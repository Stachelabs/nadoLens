/**
 * Fetch Gateway subaccount_info and print per-position unrealized = v_quote + amount × oracle (BigInt-safe).
 *
 * Usage: pnpm exec tsx scripts/debug-unrealized.ts 0xYourWalletAddress
 */
import { fromX18BigInt } from "../types/nado";

const addr = process.argv[2];
if (!addr) {
  console.error("Usage: pnpm exec tsx scripts/debug-unrealized.ts <0xAddress>");
  process.exit(1);
}

function addressToSubaccount(address: string): string {
  const a = address.toLowerCase().replace("0x", "");
  if (a.length === 64) return `0x${a}`;
  return `0x${a}64656661756c740000000000`;
}

const NADO_GATEWAY =
  process.env.NADO_GATEWAY_REST ?? "https://gateway.prod.nado.xyz/v1";

async function main(): Promise<void> {
  const sub = addressToSubaccount(addr);
  const res = await fetch(`${NADO_GATEWAY}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "subaccount_info", subaccount: sub }),
  });
  if (!res.ok) {
    console.error("HTTP", res.status, await res.text());
    process.exit(1);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const perp = (data.perp_balances as Array<Record<string, unknown>>) ?? [];
  const products =
    (data.perp_products as Array<Record<string, unknown>>) ?? [];
  const productsById = new Map(
    products.map((p) => [p.product_id as number, p]),
  );

  let sum = 0;
  for (const b of perp) {
    const bal = b.balance as { amount: string; v_quote_balance: string };
    const amt = fromX18BigInt(bal.amount);
    const vq = fromX18BigInt(bal.v_quote_balance);
    const prod = productsById.get(b.product_id as number) as
      | { oracle_price_x18: string }
      | undefined;
    const oracle = prod ? fromX18BigInt(prod.oracle_price_x18) : 0;
    const upnl = vq + amt * oracle;
    sum += upnl;
    const impliedEntry =
      Math.abs(amt) > 1e-18 && Number.isFinite(-vq / amt) ? -vq / amt : oracle;
    console.log(`product_id=${String(b.product_id)}`, {
      amount: amt,
      v_quote_balance: vq,
      oracle_price: oracle,
      unrealized_v_quote_plus_amt_times_oracle: upnl,
      implied_avg_entry: impliedEntry,
    });
  }
  console.log("sum_unrealized_usd", sum);
}

void main();
