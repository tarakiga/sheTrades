import { z } from "zod";

export const translationRequestMethodSchema = z.enum(["internal_request", "integration_job"]);

export const translationRequestStatusSchema = z.enum([
  "pending",
  "queued_for_integration",
  "in_review",
  "ready_for_review",
  "completed",
  "integration_failed"
]);

export const translationIntegrationStateSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed"
]);

export const translationRequestValueSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_.-]+$/);

export const createTranslationRequestSchema = z.object({
  contentDocumentId: z.string().min(1),
  method: translationRequestMethodSchema,
  targetLanguage: translationRequestValueSchema,
  priority: translationRequestValueSchema,
  note: z.string().trim().max(1000).optional().default("")
});

export const completeTranslationRequestSchema = z.object({
  translatedContent: z.string().trim().min(1).max(20000),
  completionNote: z.string().trim().max(1000).optional().default("")
});

export const translationRequestRecordSchema = z.object({
  id: z.string().min(1),
  contentDocumentId: z.string().min(1),
  contentKey: z.string().min(1),
  contentTitle: z.string().min(1),
  sourceLanguage: z.string(),
  method: translationRequestMethodSchema,
  targetLanguage: translationRequestValueSchema,
  priority: translationRequestValueSchema,
  note: z.string(),
  status: translationRequestStatusSchema,
  integrationState: translationIntegrationStateSchema.optional(),
  integrationJobId: z.string().min(1).optional(),
  completionNote: z.string().optional(),
  completedAt: z.string().min(1).optional(),
  completedBy: z.string().min(1).optional(),
  reviewDraftVersionId: z.string().uuid().optional(),
  requestedBy: z.string().min(1),
  requestedAt: z.string().min(1)
});

export const translationOptionSchema = z.object({
  value: translationRequestValueSchema,
  label: z.string().min(1).max(120)
});

export const translationRequestBootstrapSchema = z.object({
  actorRole: z.enum(["admin", "editor", "viewer"]),
  requests: z.array(translationRequestRecordSchema),
  contentItems: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      title: z.string().min(1)
    })
  ),
  methodOptions: z.array(translationOptionSchema),
  targetLanguageOptions: z.array(translationOptionSchema),
  priorityOptions: z.array(translationOptionSchema)
});

export type TranslationRequestMethod = z.infer<typeof translationRequestMethodSchema>;
export type TranslationRequestStatus = z.infer<typeof translationRequestStatusSchema>;
export type TranslationIntegrationState = z.infer<typeof translationIntegrationStateSchema>;
export type CreateTranslationRequestInput = z.infer<typeof createTranslationRequestSchema>;
export type CompleteTranslationRequestInput = z.infer<typeof completeTranslationRequestSchema>;
export type TranslationRequestRecord = z.infer<typeof translationRequestRecordSchema>;
export type TranslationOption = z.infer<typeof translationOptionSchema>;
export type TranslationRequestBootstrap = z.infer<typeof translationRequestBootstrapSchema>;
