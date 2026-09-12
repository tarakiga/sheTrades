import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ensurePrismaTables() is the schema bootstrap the service runs at startup,
 * and the ONLY thing that creates tables on a fresh database - CI never runs
 * `prisma migrate deploy`. It is a long sequence of CREATE TABLE IF NOT EXISTS
 * and ALTER TABLE ADD COLUMN IF NOT EXISTS statements, and the order matters:
 * an ALTER on a table that has not been created yet throws "relation does not
 * exist" and aborts the whole bootstrap.
 *
 * That bug is invisible on any database where the tables already exist -
 * which is every environment except a fresh one. Twice now a column block has
 * been added near the feature it belongs to, above the CREATE that makes it
 * possible, and only CI noticed. This test reads the source and refuses any
 * ALTER that appears before its table's CREATE, so the next such block fails
 * here rather than in CI three weeks later.
 *
 * Static on purpose: it needs no database, so it runs everywhere.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "prisma.ts"), "utf8");

function firstLineMatching(pattern: RegExp): Map<string, number> {
  const seen = new Map<string, number>();
  source.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(pattern)) {
      const table = match[1]!;
      if (!seen.has(table)) seen.set(table, index + 1);
    }
  });
  return seen;
}

const creates = firstLineMatching(/CREATE TABLE IF NOT EXISTS\s+"?([a-z_]+)"?/g);
const alters = firstLineMatching(/ALTER TABLE\s+"?([a-z_]+)"?/g);

test("every table that is ALTERed in the bootstrap is CREATEd somewhere in it", () => {
  const orphans = [...alters.keys()].filter((table) => !creates.has(table));
  assert.deepEqual(orphans, [], `ALTERed but never created: ${orphans.join(", ")}`);
});

test("no ALTER TABLE precedes the CREATE TABLE IF NOT EXISTS for the same table", () => {
  const outOfOrder = [...alters.entries()]
    .filter(([table, alterLine]) => (creates.get(table) ?? Infinity) > alterLine)
    .map(([table, alterLine]) => `${table}: ALTER at line ${alterLine}, CREATE at line ${creates.get(table)}`);
  assert.deepEqual(
    outOfOrder,
    [],
    `On a fresh database these ALTERs throw "relation does not exist" and abort the bootstrap:\n  ${outOfOrder.join("\n  ")}`
  );
});

test("the bootstrap creates the tables the tests themselves depend on", () => {
  // The suite's database-backed tests assume these exist after setup. If one
  // is renamed, this fails with a clear name rather than 48 tests skipping.
  for (const table of ["users", "user_sessions", "admin_accounts", "consent_events", "certificates"]) {
    assert.ok(creates.has(table), `${table} is not created by ensurePrismaTables`);
  }
});
