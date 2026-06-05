import test from "node:test";
import request from "supertest";
import { createApp } from "../app.js";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";

// The admin-team router validates the JWT against ADMIN_CONFIG_JWT_SECRET.
process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-secret";

const app = createApp();

function token(role: "admin" | "editor" | "viewer") {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    { sub: "user-1", role, iat: now, exp: now + 3600 },
    process.env.ADMIN_CONFIG_JWT_SECRET as string
  );
}

test("GET /api/admin/team without a token returns 401", async () => {
  await request(app).get("/api/admin/team").expect(401);
});

test("GET /api/admin/team with a viewer token returns 403", async () => {
  await request(app)
    .get("/api/admin/team")
    .set("Authorization", `Bearer ${token("viewer")}`)
    .expect(403);
});

test("GET /api/admin/team with an editor token returns 403", async () => {
  await request(app)
    .get("/api/admin/team")
    .set("Authorization", `Bearer ${token("editor")}`)
    .expect(403);
});

test("POST /api/admin/team without a token returns 401", async () => {
  await request(app).post("/api/admin/team").send({}).expect(401);
});

test("DELETE /api/admin/team/:id without a token returns 401", async () => {
  await request(app).delete("/api/admin/team/some-id").expect(401);
});

test("DELETE /api/admin/team/:id with a viewer token returns 403", async () => {
  await request(app)
    .delete("/api/admin/team/some-id")
    .set("Authorization", `Bearer ${token("viewer")}`)
    .expect(403);
});
