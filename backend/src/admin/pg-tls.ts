type PostgresSslOptions = {
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function normalizePem(raw: string | undefined) {
  if (!raw) return undefined;
  // Supports storing PEM values in env with escaped newlines.
  return raw.replace(/\\n/g, "\n");
}

export function getPostgresSslConfig(): boolean | PostgresSslOptions {
  const enabled = parseBoolean(process.env.PG_SSL_ENABLED, true);
  const rejectUnauthorized = parseBoolean(process.env.PG_SSL_REJECT_UNAUTHORIZED, true);
  const ca = normalizePem(process.env.PG_SSL_CA_CERT);
  const cert = normalizePem(process.env.PG_SSL_CLIENT_CERT);
  const key = normalizePem(process.env.PG_SSL_CLIENT_KEY);

  if (process.env.NODE_ENV === "production" && !rejectUnauthorized) {
    throw new Error("PG_SSL_REJECT_UNAUTHORIZED=false is not allowed in production.");
  }

  if (!enabled) {
    return false;
  }

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
    ...(cert ? { cert } : {}),
    ...(key ? { key } : {})
  };
}
