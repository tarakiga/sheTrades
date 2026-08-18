/**
 * Live payout probe: send ONE real airtime payment through the production
 * provider adapter using the PUBLISHED payouts config.
 *
 * SPENDS REAL MONEY. Dry run is the default; --confirm actually pays.
 *
 * Use after a credential rotation, a provider switch, or an account-level
 * change at the provider (e.g. airtime being enabled), when you need proof
 * the stored config works without waiting for a learner to finish a module.
 *
 * Dry run - reads the published config, sends nothing:
 *   POSTGRES_URL=... AT_TEST_PHONE=+234... AT_TEST_AMOUNT=100 \
 *     npx tsx src/ops/at-live-probe.ts
 *
 * Execute:  ... npx tsx src/ops/at-live-probe.ts --confirm
 *
 * Deliberately NOT wired to an npm script - spending money should take a
 * full command someone had to look up.
 */
import { africasTalkingAdapter } from "../payouts/providers/africas-talking.js";
import type { PayoutsIntegrationPayload } from "../payouts/providers/contracts.js";
import { prisma } from "../admin/prisma.js";

async function main() {
  const phone = process.env.AT_TEST_PHONE ?? "";
  const amount = Number(process.env.AT_TEST_AMOUNT ?? "0");
  if (!phone || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("AT_TEST_PHONE and AT_TEST_AMOUNT are required");
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ payload: unknown }>>(
    `SELECT v.payload FROM config_versions v
       JOIN config_documents d ON d.id = v.document_id
      WHERE d.key = 'integration.payouts.primary' AND v.state = 'published'
      LIMIT 1`
  );
  const config = rows[0]?.payload as PayoutsIntegrationPayload | undefined;
  if (!config) throw new Error("No published payouts config found");

  console.log(JSON.stringify({
    event: "at.probe.config",
    provider: config.provider,
    sandbox: config.sandbox,
    currency: config.defaults?.currency,
    username: (config as { africasTalking?: { username?: string } }).africasTalking?.username
  }));

  if (!process.argv.includes("--confirm")) {
    console.log(JSON.stringify({ event: "at.probe.dry_run", phone, amount }));
    return;
  }

  const result = await africasTalkingAdapter.dispatch(
    { id: "live-probe", amount, channel: "airtime", learnerPhone: phone, retryCount: 0 },
    config
  );
  console.log(JSON.stringify({ event: "at.probe.result", phone, amount, result }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: "at.probe.error", message: String(error) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
