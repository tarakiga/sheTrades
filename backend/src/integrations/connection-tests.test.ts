import test from "node:test";
import assert from "node:assert/strict";
import {
  testNotificationConnection,
  testWhatsAppConnection
} from "./connection-tests.js";

test("testWhatsAppConnection returns connected for a valid Graph response", async () => {
  const result = await testWhatsAppConnection(
    {
      title: "Primary WhatsApp Integration",
      provider: "meta_whatsapp_cloud",
      enabled: true,
      verifyToken: "verify-token",
      accessToken: "access-token",
      appSecret: "app-secret",
      phoneNumberId: "123456789",
      businessAccountId: "987654321",
      webhookPath: "/webhook/whatsapp",
      apiVersion: "v23.0",
      notes: ""
    },
    {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            display_phone_number: "+234800000001",
            verified_name: "SheTrades"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(result.status, "connected");
  assert.match(result.summary, /WhatsApp connected/i);
});

test("testNotificationConnection returns connected when transport verify succeeds", async () => {
  const result = await testNotificationConnection(
    {
      title: "SMTP Integration",
      provider: "smtp",
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      secure: false,
      username: "user",
      password: "password",
      fromName: "SheTrades",
      fromEmail: "noreply@example.com",
      replyToEmail: "support@example.com",
    helpRequestRecipient: "",
      notes: ""
    },
    {
      createTransport: (() => ({
        verify: async () => true
      })) as typeof import("nodemailer").createTransport
    }
  );

  assert.equal(result.status, "connected");
  assert.match(result.summary, /SMTP connected/i);
});
