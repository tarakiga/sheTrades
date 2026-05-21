const c = require("crypto");
const b = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const now = Math.floor(Date.now() / 1000);

const payload = {
  sub: "local-admin",
  role: "admin",
  iat: now,
  exp: now + 60 * 60 * 12
};

const header = { alg: "HS256", typ: "JWT" };
const signingInput = b(header) + "." + b(payload);
const secret = process.env.ADMIN_CONFIG_JWT_SECRET;

if (!secret) {
  throw new Error("ADMIN_CONFIG_JWT_SECRET missing in env");
}

const signature = c
  .createHmac("sha256", secret)
  .update(signingInput)
  .digest("base64url");

console.log(signingInput + "." + signature);
