import { z } from "zod";
import { payoutsIntegrationPayloadSchema } from "../payouts/providers/contracts.js";

export const configNamespaceSchema = z.enum(["content", "options", "legal", "integration"]);
export type ConfigNamespace = z.infer<typeof configNamespaceSchema>;

export const publicConfigNamespaceSchema = z.enum(["content", "options", "legal"]);
export type PublicConfigNamespace = z.infer<typeof publicConfigNamespaceSchema>;

export const configDocumentTypeSchema = z.enum([
  "lesson_content",
  "option_set",
  "legal_block",
  "ui_copy",
  "integration_config"
]);
export type ConfigDocumentType = z.infer<typeof configDocumentTypeSchema>;

export const configStateSchema = z.enum(["draft", "published", "archived"]);
export type ConfigState = z.infer<typeof configStateSchema>;

const optionItemSchema = z.object({
  id: z.string().min(1),
  value: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

const languageContentSchema = z.object({
  en: z.string().min(1),
  pcm: z.string().optional(),
  ig: z.string().optional()
});

export const legalBlockPayloadSchema = z.object({
  title: z.string().min(1),
  body: languageContentSchema,
  complianceTag: z.string().min(1),
  effectiveFrom: z.string().datetime()
});

export const optionSetPayloadSchema = z.object({
  title: z.string().min(1),
  items: z.array(optionItemSchema).min(1)
});

export const lessonContentPayloadSchema = z.object({
  title: z.string().min(1),
  body: languageContentSchema,
  audioUrls: z
    .object({
      en: z.string().url().optional(),
      pcm: z.string().url().optional(),
      ig: z.string().url().optional()
    })
    .default({})
});

export const whatsappIntegrationPayloadSchema = z.object({
  title: z.string().min(1),
  provider: z.literal("meta_whatsapp_cloud"),
  enabled: z.boolean().default(true),
  verifyToken: z.string().trim().min(1),
  accessToken: z.string().trim().min(1),
  appSecret: z.string().trim().optional().default(""),
  phoneNumberId: z.string().trim().min(1),
  businessAccountId: z.string().trim().optional().default(""),
  webhookPath: z.string().trim().min(1).regex(/^\/.*/),
  apiVersion: z.string().trim().min(1).default("v23.0"),
  notes: z.string().max(1000).optional().default("")
});
export type WhatsAppIntegrationPayload = z.infer<typeof whatsappIntegrationPayloadSchema>;

export const notificationIntegrationPayloadSchema = z.object({
  title: z.string().min(1),
  provider: z.literal("smtp"),
  enabled: z.boolean().default(true),
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().min(1),
  password: z.string().trim().min(1),
  fromName: z.string().trim().min(1),
  fromEmail: z.string().trim().email(),
  replyToEmail: z.union([z.string().trim().email(), z.literal("")]).optional().default(""),
  notes: z.string().max(1000).optional().default("")
});
export type NotificationIntegrationPayload = z.infer<typeof notificationIntegrationPayloadSchema>;

// Plain union (not discriminatedUnion) because payoutsIntegrationPayloadSchema
// is itself a discriminated union on `provider` over a different set of literal
// values (africas_talking | termii | reloadly). z.union tries each member and
// succeeds on the first match, which correctly routes whatsapp/notification to
// their literal-provider schemas and payouts payloads to the payouts union.
// Without payouts here, a payouts payload only survived via the generic
// z.record catch-all in configPayloadSchema — i.e. stored as an unvalidated
// blob — which is what the spec's "validate on both client and server" rule
// forbids. The frontend serializes an extra `title` into the payload; the
// payouts schemas strip it (zod drops unknown keys), and the document-level
// title field preserves it regardless.
export const integrationConfigPayloadSchema = z.union([
  whatsappIntegrationPayloadSchema,
  notificationIntegrationPayloadSchema,
  payoutsIntegrationPayloadSchema
]);
export type IntegrationConfigPayload = z.infer<typeof integrationConfigPayloadSchema>;

export const rewardRulesPayloadSchema = z.object({
  kind: z.literal("reward_rules"),
  amount: z.number().positive(),
  channel: z.literal("airtime"),
  enabled: z.boolean()
});
export type RewardRulesPayload = z.infer<typeof rewardRulesPayloadSchema>;

export const configPayloadSchema = z.union([
  legalBlockPayloadSchema,
  optionSetPayloadSchema,
  lessonContentPayloadSchema,
  integrationConfigPayloadSchema,
  rewardRulesPayloadSchema,
  z.record(z.string(), z.unknown())
]);
export type ConfigPayload = z.infer<typeof configPayloadSchema>;

export const configDocumentSchema = z.object({
  id: z.string().uuid(),
  namespace: configNamespaceSchema,
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  type: configDocumentTypeSchema,
  title: z.string().min(1).max(160),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1)
});
export type ConfigDocument = z.infer<typeof configDocumentSchema>;

export const configVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  state: configStateSchema,
  payload: configPayloadSchema,
  schemaVersion: z.number().int().positive().default(1),
  changeSummary: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  publishedAt: z.string().datetime().optional(),
  publishedBy: z.string().min(1).optional(),
  rolledBackFromVersionId: z.string().uuid().optional()
});
export type ConfigVersion = z.infer<typeof configVersionSchema>;

export const configAuditLogSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  actorId: z.string().min(1),
  actorRole: z.enum(["admin", "editor", "viewer"]),
  action: z.enum([
    "document_created",
    "draft_created",
    "draft_updated",
    "published",
    "rolled_back",
    "archived",
    "reactivated"
  ]),
  fromVersionId: z.string().uuid().optional(),
  toVersionId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime()
});
export type ConfigAuditLog = z.infer<typeof configAuditLogSchema>;

export const createDocumentRequestSchema = z.object({
  namespace: configNamespaceSchema,
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  type: configDocumentTypeSchema,
  title: z.string().min(1).max(160),
  initialPayload: configPayloadSchema
});

export const updateDraftRequestSchema = z.object({
  payload: configPayloadSchema,
  changeSummary: z.string().max(500).optional()
});

export const publishDocumentRequestSchema = z.object({
  expectedDraftVersionId: z.string().uuid(),
  publishNote: z.string().max(500).optional()
});

export const rollbackDocumentRequestSchema = z.object({
  targetVersionId: z.string().uuid(),
  rollbackReason: z.string().max(500).optional()
});

export const archiveDocumentRequestSchema = z.object({
  archiveReason: z.string().max(500).optional()
});

export const reactivateDocumentRequestSchema = z.object({
  reactivateReason: z.string().max(500).optional()
});

export const listDocumentsQuerySchema = z.object({
  namespace: configNamespaceSchema.optional(),
  type: configDocumentTypeSchema.optional(),
  keyPrefix: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const publicConfigResponseSchema = z.object({
  namespace: publicConfigNamespaceSchema,
  key: z.string().min(1),
  versionTag: z.string().min(1),
  data: configPayloadSchema,
  updatedAt: z.string().datetime()
});

export const publicConfigBundleResponseSchema = z.object({
  versionTag: z.string().min(1),
  documents: z.array(publicConfigResponseSchema)
});
