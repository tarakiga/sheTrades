import { z } from "zod";
import {
  notificationIntegrationPayloadSchema,
  whatsappIntegrationPayloadSchema
} from "../config-platform/contracts.js";

export const testIntegrationResultSchema = z.object({
  provider: z.enum(["meta_whatsapp_cloud", "smtp"]),
  status: z.enum(["connected", "failed", "invalid"]),
  summary: z.string().min(1),
  details: z.string().optional(),
  testedAt: z.string().datetime()
});
export type TestIntegrationResult = z.infer<typeof testIntegrationResultSchema>;

export const testWhatsAppConnectionRequestSchema = z.object({
  config: whatsappIntegrationPayloadSchema
});
export type TestWhatsAppConnectionRequest = z.infer<typeof testWhatsAppConnectionRequestSchema>;

export const testNotificationConnectionRequestSchema = z.object({
  config: notificationIntegrationPayloadSchema
});
export type TestNotificationConnectionRequest = z.infer<
  typeof testNotificationConnectionRequestSchema
>;
