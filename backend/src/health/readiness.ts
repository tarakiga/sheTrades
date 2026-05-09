import { Firestore } from "@google-cloud/firestore";
import { Pool } from "pg";
import { getDataAccessPolicy, getProviderMode } from "../admin/config.js";
import { getPostgresSslConfig } from "../admin/pg-tls.js";

type CheckStatus = "up" | "down" | "skipped";

type DependencyCheck = {
  status: CheckStatus;
  reason?: string;
};

export type ReadinessResult = {
  ok: boolean;
  mode: "postgres" | "firestore" | "hybrid";
  checks: {
    postgres: DependencyCheck;
    firestore: DependencyCheck;
  };
};

async function checkPostgres(): Promise<DependencyCheck> {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    return { status: "down", reason: "POSTGRES_URL is not configured" };
  }

  const policy = getDataAccessPolicy();
  let pool: Pool | null = null;

  try {
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: policy.connectTimeoutMs,
      statement_timeout: policy.statementTimeoutMs,
      query_timeout: policy.queryTimeoutMs,
      max: 1,
      ssl: getPostgresSslConfig()
    });
    await pool.query("SELECT 1");
    return { status: "up" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Postgres readiness failed";
    return { status: "down", reason };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

async function checkFirestore(): Promise<DependencyCheck> {
  const projectId = process.env.FIRESTORE_PROJECT_ID;
  if (!projectId) {
    return { status: "down", reason: "FIRESTORE_PROJECT_ID is not configured" };
  }

  const policy = getDataAccessPolicy();
  const firestore = new Firestore({ projectId });

  try {
    await Promise.race([
      firestore.collection("_health").limit(1).get(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("Firestore readiness timeout")), policy.queryTimeoutMs);
      })
    ]);
    return { status: "up" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Firestore readiness failed";
    return { status: "down", reason };
  }
}

export async function getReadiness(): Promise<ReadinessResult> {
  const mode = getProviderMode();
  const checks = {
    postgres: { status: "skipped" as CheckStatus },
    firestore: { status: "skipped" as CheckStatus }
  };

  if (mode === "postgres" || mode === "hybrid") {
    checks.postgres = await checkPostgres();
  }
  if (mode === "firestore" || mode === "hybrid") {
    checks.firestore = await checkFirestore();
  }

  let ok = false;
  if (mode === "postgres") {
    ok = checks.postgres.status === "up";
  } else if (mode === "firestore") {
    ok = checks.firestore.status === "up";
  } else {
    ok = checks.postgres.status === "up" || checks.firestore.status === "up";
  }

  return { ok, mode, checks };
}
