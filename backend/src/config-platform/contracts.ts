import { z } from "zod";
import { payoutsIntegrationPayloadSchema } from "../payouts/providers/contracts.js";
import { translationIntegrationPayloadSchema } from "../translation/providers/contracts.js";

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

// NOTE: this schema describes a `{title, body, audioUrls}` shape that real
// lesson documents do NOT use — they are `{title, module, languages, audioUrls,
// quiz}` (see getRuntimeLessons and seed-lessons.ts). It is kept only as a
// member of configPayloadSchema below, where real lessons fall through to the
// z.record catch-all as they always have. Do not wire it into
// validatePayloadForDocumentType: it would reject every live lesson.
// The document-level schema is lessonDocumentPayloadSchema, further down.
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

/**
 * A learner-facing string: legacy bare string, or per-language object.
 *
 * `en` is optional because `normalizeLocalized` already coerces a missing one
 * to "". The governing rule for everything below is that this schema must
 * never reject a payload the bot already renders — publish validation exists
 * to stop learner-trapping data, not to enforce content completeness.
 */
const localizedValueSchema = z.union([
  z.string(),
  z.looseObject({
    en: z.string().optional(),
    pcm: z.string().optional(),
    ig: z.string().optional()
  })
]);

/**
 * One quiz question as stored in a published lesson document.
 *
 * Deliberately permissive about everything except the index bounds. The bounds
 * are the invariant the bot cannot defend itself against: an `answerIndex` that
 * does not reference a real option means no reply can ever match it, and since
 * the retry loop has no limit the learner is trapped until they give up. A
 * negative index is worse still — it collides with the resolver's -1 "no match"
 * sentinel. Both are caught here, at publish, where a human can fix them.
 */
export const lessonQuizItemSchema = z.looseObject({
  question: localizedValueSchema.nullish(),
  options: z.array(localizedValueSchema).nullish(),
  // `unknown`, not `number`: a non-numeric answerIndex is coerced to 0 at read
  // time, which is wrong but not learner-TRAPPING. Rejecting it would lock an
  // editor out of any stored lesson that already has one — they could not even
  // save the fix. The read-time warning surfaces it instead. The refinement
  // below only inspects values that are actually numbers.
  answerIndex: z.unknown().optional(),
  // Not an enum: an unrecognised kind is normalised to "scored" at read time,
  // so rejecting a future kind here would block content the bot handles fine.
  kind: z.string().nullish(),
  helpOptionIndex: z.unknown().optional()
});

/**
 * Document-level schema for `lesson_content`, applied on the publish path.
 *
 * Everything is optional and unknown keys pass through, because 43 lessons are
 * already live and this must not block the content team over a field this
 * schema happens not to know about. It exists to enforce ONE thing: that quiz
 * indices reference real options.
 */
export const lessonDocumentPayloadSchema = z
  .looseObject({
    title: localizedValueSchema.nullish(),
    module: z.string().nullish(),
    languages: z
      .looseObject({
        en: z.string().optional(),
        pcm: z.string().optional(),
        ig: z.string().optional()
      })
      .nullish(),
    // Values are `unknown`, not `string`: the runtime passes audioUrls through
    // untouched, so tightening it here would reject content the bot tolerates.
    audioUrls: z.record(z.string(), z.unknown()).nullish(),
    quiz: z.array(lessonQuizItemSchema).nullish()
  })
  // Refined at the document level rather than per item so the message can name
  // WHICH question is wrong — the admin error path forwards `issue.message`
  // and drops `issue.path`, so an unqualified message is unactionable on a
  // lesson with several questions.
  .superRefine((value, ctx) => {
    const quiz = Array.isArray(value.quiz) ? value.quiz : [];
    quiz.forEach((item, index) => {
      const options = Array.isArray(item?.options) ? item.options : [];
      // A question with no options yet is half-authored, not a learner trap:
      // the admin drawer seeds new questions with three EMPTY options and the
      // serializer filters empties out, so `options: []` is what "Add question
      // → Save" legitimately produces. There is nothing to render and nothing
      // to mis-score, so leave it alone.
      if (options.length === 0) return;

      const flag = (field: "answerIndex" | "helpOptionIndex", raw: unknown) => {
        if (typeof raw !== "number") return;
        if (Number.isInteger(raw) && raw >= 0 && raw < options.length) return;
        ctx.addIssue({
          code: "custom",
          path: ["quiz", index, field],
          message: `Question ${index + 1}: ${field} ${raw} does not reference an option — this question has ${options.length}.`
        });
      };

      flag("answerIndex", item?.answerIndex);
      flag("helpOptionIndex", item?.helpOptionIndex);
    });
  });
export type LessonDocumentPayload = z.infer<typeof lessonDocumentPayloadSchema>;

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
  /**
   * Where learner help requests are emailed. Lives with the SMTP settings
   * because that is where an admin looks for "who receives our mail", and
   * optional so existing published documents keep validating unchanged.
   */
  helpRequestRecipient: z
    .union([z.string().trim().email(), z.literal("")])
    .optional()
    .default(""),
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
// The reward-rule document is stored with type `integration_config` in the
// `integration` namespace, so it MUST be a member of integrationConfigPayloadSchema:
// the config-platform service re-validates every integration_config payload
// against THIS union in validatePayloadForDocumentType (service.ts /
// postgres-service.ts), not just against configPayloadSchema at the route layer.
// Defined here (above the integration union) so it can be included below.
// Client incentive plan (2026-08): payouts moved from flat per-module amounts
// to completion-count milestones. `modulesCompleted: "all"` resolves to the
// number of PUBLISHED modules at award time, so adding a sixth module later
// moves the finish line instead of paying the final milestone early.
export const rewardMilestoneSchema = z.object({
  modulesCompleted: z.union([z.number().int().min(1).max(50), z.literal("all")]),
  amount: z.number().positive(),
  label: z.string().trim().min(1).max(60).optional()
});
export type RewardMilestone = z.infer<typeof rewardMilestoneSchema>;

export const rewardRulesPayloadSchema = z.object({
  kind: z.literal("reward_rules"),
  // Legacy flat per-module amount. Still required so every published rule
  // has a usable fallback; IGNORED whenever `milestones` is non-empty.
  amount: z.number().positive(),
  channel: z.literal("airtime"),
  enabled: z.boolean(),
  // Milestone mode: when present and non-empty, replaces per-module payouts.
  milestones: z.array(rewardMilestoneSchema).max(10).optional()
});
export type RewardRulesPayload = z.infer<typeof rewardRulesPayloadSchema>;

// A discriminated `kind` keeps this distinct from the SMTP/whatsapp payloads,
// which are matched by their `provider` literal, and from the reward-rules
// payload, which uses kind: "reward_rules".
export const translationConfigPayloadSchema = translationIntegrationPayloadSchema.extend({
  kind: z.literal("translation")
});
export type TranslationConfigPayload = z.infer<typeof translationConfigPayloadSchema>;

export const integrationConfigPayloadSchema = z.union([
  whatsappIntegrationPayloadSchema,
  notificationIntegrationPayloadSchema,
  payoutsIntegrationPayloadSchema,
  rewardRulesPayloadSchema,
  translationConfigPayloadSchema
]);
export type IntegrationConfigPayload = z.infer<typeof integrationConfigPayloadSchema>;

export const configPayloadSchema = z.union([
  legalBlockPayloadSchema,
  optionSetPayloadSchema,
  lessonContentPayloadSchema,
  integrationConfigPayloadSchema,
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
