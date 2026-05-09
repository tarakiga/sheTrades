import test from "node:test";
import assert from "node:assert/strict";
import { getPostgresSslConfig } from "./pg-tls.js";

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("getPostgresSslConfig defaults to strict TLS", async () => {
  await withEnv(
    {
      PG_SSL_ENABLED: undefined,
      PG_SSL_REJECT_UNAUTHORIZED: undefined,
      PG_SSL_CA_CERT: undefined,
      PG_SSL_CLIENT_CERT: undefined,
      PG_SSL_CLIENT_KEY: undefined,
      NODE_ENV: undefined
    },
    () => {
      const config = getPostgresSslConfig();
      assert.deepEqual(config, { rejectUnauthorized: true });
    }
  );
});

test("getPostgresSslConfig supports escaped newline CA cert", async () => {
  await withEnv(
    {
      PG_SSL_CA_CERT: "-----BEGIN CERT-----\\nabc123\\n-----END CERT-----"
    },
    () => {
      const config = getPostgresSslConfig();
      assert.equal(typeof config, "object");
      assert.equal((config as { ca?: string }).ca?.includes("\n"), true);
    }
  );
});

test("getPostgresSslConfig supports escaped newline client cert and key", async () => {
  await withEnv(
    {
      PG_SSL_CLIENT_CERT: "-----BEGIN CERT-----\\ncert123\\n-----END CERT-----",
      PG_SSL_CLIENT_KEY: "-----BEGIN KEY-----\\nkey123\\n-----END KEY-----"
    },
    () => {
      const config = getPostgresSslConfig();
      assert.equal(typeof config, "object");
      assert.equal((config as { cert?: string }).cert?.includes("\n"), true);
      assert.equal((config as { key?: string }).key?.includes("\n"), true);
    }
  );
});

test("getPostgresSslConfig allows non-production rejectUnauthorized override", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      PG_SSL_REJECT_UNAUTHORIZED: "false"
    },
    () => {
      const config = getPostgresSslConfig();
      assert.deepEqual(config, { rejectUnauthorized: false });
    }
  );
});

test("getPostgresSslConfig blocks insecure production TLS override", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      PG_SSL_REJECT_UNAUTHORIZED: "false"
    },
    () => {
      assert.throws(
        () => getPostgresSslConfig(),
        /PG_SSL_REJECT_UNAUTHORIZED=false is not allowed in production\./
      );
    }
  );
});
