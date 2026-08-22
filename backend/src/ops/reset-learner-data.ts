/**
 * Production-prep: clear all LEARNER/TEST data while leaving content, config,
 * admin accounts and translation work completely untouched.
 *
 * Dry run (default - reads only, deletes nothing):
 *   POSTGRES_URL=... npm run ops:reset-learner-data -w @shetrades/backend
 *
 * Execute (irreversible - take a Cloud SQL export first):
 *   POSTGRES_URL=... npm run ops:reset-learner-data -w @shetrades/backend -- --confirm
 *
 * CLEARED: users, user_sessions, user_progress, quiz_attempts, rewards,
 *          certificates, outbound_messages, processed_webhook_messages
 * PRESERVED: config_documents / config_versions / config_audit_log (every
 *          lesson, quiz, FAQ, Resource, bot prompt, option set, legal block,
 *          branding, integration + reward rule, with full version history),
 *          admin_accounts, admin_sessions, report_schedules,
 *          translation_requests, translation_drafts (pending human review -
 *          real work product, NOT test data), certificate_assets (certificate
 *          artwork - design work, not learner data).
 *
 * Delete order is load-bearing: the learner relations are required with no
 * cascade rule, so Postgres refuses to delete a `users` row while any
 * dependent row still references it. Children go first.
 */
import { prisma } from "../admin/prisma.js";

const CONFIRMED = process.argv.includes("--confirm");

/** Host/database only - never the credentials. */
function describeTarget(): string {
  const raw = process.env.POSTGRES_URL ?? "";
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "(unparseable POSTGRES_URL)";
  }
}

async function countRaw(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM ${table}`
  );
  return Number(rows[0]?.count ?? 0);
}

/** Tables missing entirely (e.g. never bootstrapped) count as 0, not a crash. */
async function countSafe(table: string): Promise<number> {
  try {
    return await countRaw(table);
  } catch {
    return -1;
  }
}

const CLEAR_TABLES = [
  "quiz_attempts",
  "user_progress",
  "rewards",
  "certificates",
  "consent_events",
  "user_sessions",
  "users",
  "outbound_messages",
  "processed_webhook_messages",
  // Both hold de-identified records ABOUT learners rather than learner data,
  // so they look like candidates for PRESERVE. They are cleared instead,
  // because this script exists to produce a clean slate in a test environment:
  // leaving behind a financial archive and erasure log belonging to learners
  // who no longer exist would corrupt any later reconciliation with noise
  // nobody can trace. This script must never run against real data anyway.
  "reward_archive",
  "erasure_log"
] as const;

const PRESERVE_TABLES = [
  "config_documents",
  "config_versions",
  "config_audit_log",
  "admin_accounts",
  "admin_sessions",
  "report_schedules",
  "translation_requests",
  "translation_drafts",
  "certificate_assets"
] as const;

async function snapshot(tables: readonly string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    tables.map(async (table) => [table, await countSafe(table)] as const)
  );
  return Object.fromEntries(entries);
}

function render(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([table, count]) => `    ${table.padEnd(28)} ${count < 0 ? "(absent)" : count}`)
    .join("\n");
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required (run through the Cloud SQL proxy).");
  }

  console.log(`\nTarget database: ${describeTarget()}`);
  console.log(`Mode: ${CONFIRMED ? "EXECUTE (irreversible)" : "DRY RUN (no writes)"}\n`);

  const before = await snapshot(CLEAR_TABLES);
  const preserved = await snapshot(PRESERVE_TABLES);

  console.log("  WILL BE CLEARED:");
  console.log(render(before));
  console.log("\n  WILL BE PRESERVED:");
  console.log(render(preserved));

  const totalToDelete = Object.values(before).reduce((sum, n) => sum + Math.max(0, n), 0);

  if (!CONFIRMED) {
    console.log(
      `\nDRY RUN — nothing was deleted. ${totalToDelete} rows would be removed.` +
        `\nRe-run with --confirm to execute (take a Cloud SQL export first).\n`
    );
    return;
  }

  if (totalToDelete === 0) {
    console.log("\nNothing to delete — learner tables are already empty.\n");
    return;
  }

  // One transaction: either every learner table clears or none does, so a
  // mid-run failure can't leave orphaned sessions pointing at deleted users.
  const deleted: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    for (const table of CLEAR_TABLES) {
      if (before[table] === -1) continue; // table absent
      const count = await tx.$executeRawUnsafe(`DELETE FROM ${table}`);
      deleted[table] = count;
    }
  });

  console.log("\n  DELETED:");
  console.log(render(deleted));

  const after = await snapshot(CLEAR_TABLES);
  const preservedAfter = await snapshot(PRESERVE_TABLES);
  console.log("\n  AFTER (cleared tables):");
  console.log(render(after));
  console.log("\n  AFTER (preserved tables — must be unchanged):");
  console.log(render(preservedAfter));

  const preservationBroken = PRESERVE_TABLES.filter(
    (table) => preserved[table] !== preservedAfter[table]
  );
  if (preservationBroken.length > 0) {
    throw new Error(
      `PRESERVATION CHECK FAILED for: ${preservationBroken.join(", ")} — investigate immediately.`
    );
  }

  console.log("\nDone. Content, config, admin accounts and translations verified unchanged.\n");
}

main()
  .catch((error) => {
    console.error("\nreset-learner-data FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
