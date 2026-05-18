import { Router } from "express";
import type { Request } from "express";
import { ZodError } from "zod";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import type { ConfigPayload } from "../config-platform/contracts.js";
import { getConfigPlatformService } from "../config-platform/service.js";
import {
  completeTranslationRequestSchema,
  createTranslationRequestSchema,
  type TranslationOption
} from "../translation-requests/contracts.js";
import { getTranslationRequestService } from "../translation-requests/service.js";

export const translationRequestsRouter = Router();

const configService = getConfigPlatformService();
const translationRequestService = getTranslationRequestService();
const METHOD_OPTIONS_KEY = "options.settings.translation_request_methods";
const LANGUAGE_OPTIONS_KEY = "options.settings.translation_request_languages";
const PRIORITY_OPTIONS_KEY = "options.settings.translation_request_priorities";

type ConfigListItem = ReturnType<typeof configService.listDocuments>["items"][number];

function actorFromRequest(req: Request) {
  return {
    id: req.auth?.sub ?? "unknown",
    role: req.auth?.role ?? "viewer"
  } as const;
}

function getRequiredParam(req: Request, name: string) {
  const rawValue = req.params[name];
  const value = Array.isArray(rawValue) ? rawValue[0] ?? "" : rawValue ?? "";
  if (!value.trim()) {
    throw new Error(`Missing required route parameter: ${name}.`);
  }
  return value;
}

function getPreferredPayload(row: ConfigListItem) {
  return row.published?.payload ?? row.draft?.payload ?? null;
}

function toManagedOptions(row: ConfigListItem | undefined): TranslationOption[] {
  const payload = row ? getPreferredPayload(row) : null;
  if (!payload || typeof payload !== "object" || !("items" in payload)) {
    return [];
  }

  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as {
        value?: unknown;
        label?: unknown;
        enabled?: unknown;
        sortOrder?: unknown;
      };
      const value = typeof candidate.value === "string" ? candidate.value.trim() : "";
      const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
      if (!value || !label || candidate.enabled === false) {
        return null;
      }

      return {
        value,
        label,
        sortOrder: typeof candidate.sortOrder === "number" ? candidate.sortOrder : index + 1
      };
    })
    .filter((item): item is TranslationOption & { sortOrder: number } => Boolean(item))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder: _sortOrder, ...option }) => option);
}

function resolveSourceLanguage(row: ConfigListItem, languageOptions: TranslationOption[]) {
  const payload = getPreferredPayload(row);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const candidate = payload as {
      sourceLanguage?: unknown;
      language?: unknown;
      locale?: unknown;
      languages?: unknown;
    };

    if (typeof candidate.sourceLanguage === "string" && candidate.sourceLanguage.trim()) {
      return candidate.sourceLanguage.trim();
    }

    if (typeof candidate.language === "string" && candidate.language.trim()) {
      return candidate.language.trim();
    }

    if (typeof candidate.locale === "string" && candidate.locale.trim()) {
      return candidate.locale.trim();
    }

    if (candidate.languages && typeof candidate.languages === "object") {
      const languageKeys = Object.keys(candidate.languages as Record<string, unknown>).filter(Boolean);
      if (languageKeys.length > 0) {
        return languageKeys[0] ?? "";
      }
    }
  }

  return languageOptions[0]?.value ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function applyTranslationToPayload(
  type: ConfigListItem["document"]["type"],
  payload: ConfigPayload,
  targetLanguage: string,
  translatedContent: string
) {
  if (!isRecord(payload)) {
    throw new Error("Translated content can only be applied to object-based content payloads.");
  }

  const payloadRecord = payload as Record<string, unknown>;
  const translationEntry = {
    [targetLanguage]: translatedContent
  };
  const payloadBody = payloadRecord.body;
  const payloadLanguages = payloadRecord.languages;

  if (type === "lesson_content") {
    if (isRecord(payloadBody)) {
      return {
        ...payload,
        body: {
          ...payloadBody,
          ...translationEntry
        }
      };
    }

    if (isRecord(payloadLanguages)) {
      return {
        ...payload,
        languages: {
          ...payloadLanguages,
          ...translationEntry
        }
      };
    }

    throw new Error(
      "This lesson content item does not have a supported language container for translation output."
    );
  }

  if (isRecord(payloadBody)) {
    return {
      ...payload,
      body: {
        ...payloadBody,
        ...translationEntry
      }
    };
  }

  if (isRecord(payloadLanguages)) {
    return {
      ...payload,
      languages: {
        ...payloadLanguages,
        ...translationEntry
      }
    };
  }

  return {
    ...payload,
    ...translationEntry
  };
}

translationRequestsRouter.use(authenticateJwt);

translationRequestsRouter.get(
  "/content/admin/translation-requests/bootstrap",
  requireRoles(["viewer", "editor", "admin"]),
  (req, res, next) => {
    try {
      const contentRows = configService.listDocuments({
        namespace: "content",
        page: 1,
        pageSize: 500
      }).items;
      const optionRows = configService.listDocuments({
        namespace: "options",
        page: 1,
        pageSize: 500
      }).items;

      const methodOptions = toManagedOptions(
        optionRows.find((item) => item.document.key === METHOD_OPTIONS_KEY)
      );
      const targetLanguageOptions = toManagedOptions(
        optionRows.find((item) => item.document.key === LANGUAGE_OPTIONS_KEY)
      );
      const priorityOptions = toManagedOptions(
        optionRows.find((item) => item.document.key === PRIORITY_OPTIONS_KEY)
      );

      res.status(200).json({
        actorRole: req.auth?.role ?? "viewer",
        requests: translationRequestService.listRequests(),
        contentItems: contentRows
          .filter((item) => item.document.isActive)
          .map((item) => ({
            id: item.document.id,
            key: item.document.key,
            title: item.document.title
          })),
        methodOptions,
        targetLanguageOptions,
        priorityOptions
      });
    } catch (error) {
      next(error);
    }
  }
);

translationRequestsRouter.post(
  "/content/admin/translation-requests",
  requireRoles(["editor", "admin"]),
  (req, res, next) => {
    try {
      const input = createTranslationRequestSchema.parse(req.body);
      const optionRows = configService.listDocuments({
        namespace: "options",
        page: 1,
        pageSize: 500
      }).items;
      const languageOptions = toManagedOptions(
        optionRows.find((item) => item.document.key === LANGUAGE_OPTIONS_KEY)
      );
      const priorityOptions = toManagedOptions(
        optionRows.find((item) => item.document.key === PRIORITY_OPTIONS_KEY)
      );

      if (!languageOptions.some((item) => item.value === input.targetLanguage)) {
        res.status(400).json({ message: "Select a valid target language before submitting." });
        return;
      }

      if (!priorityOptions.some((item) => item.value === input.priority)) {
        res.status(400).json({ message: "Select a valid priority before submitting." });
        return;
      }

      const contentRows = configService.listDocuments({
        namespace: "content",
        page: 1,
        pageSize: 500
      }).items;
      const contentRow = contentRows.find(
        (item) => item.document.id === input.contentDocumentId && item.document.isActive
      );
      if (!contentRow) {
        res.status(404).json({ message: "Selected content item could not be found." });
        return;
      }

      const created = translationRequestService.createRequest(actorFromRequest(req), input, {
        documentId: contentRow.document.id,
        key: contentRow.document.key,
        title: contentRow.document.title,
        sourceLanguage: resolveSourceLanguage(contentRow, languageOptions)
      });

      res.status(201).json({
        message: "Translation request created.",
        request: created
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          message: "Invalid translation request payload.",
          details: error.issues.map((issue) => issue.message)
        });
        return;
      }
      next(error);
    }
  }
);

translationRequestsRouter.post(
  "/content/admin/translation-requests/:requestId/complete",
  requireRoles(["editor", "admin"]),
  (req, res, next) => {
    try {
      const requestId = getRequiredParam(req, "requestId");
      const input = completeTranslationRequestSchema.parse(req.body);
      const requestRecord = translationRequestService.getRequestOrThrow(requestId);
      const contentRow = configService
        .listDocuments({
          namespace: "content",
          page: 1,
          pageSize: 500
        })
        .items.find(
          (item) =>
            item.document.id === requestRecord.contentDocumentId &&
            item.document.key === requestRecord.contentKey &&
            item.document.isActive
        );

      if (!contentRow) {
        res.status(404).json({
          message: "The linked content item could not be found for this translation request."
        });
        return;
      }

      const workingPayload = contentRow.draft?.payload ?? contentRow.published?.payload;
      if (!workingPayload) {
        res.status(400).json({
          message: "The linked content item does not have a draft or published payload to update."
        });
        return;
      }

      const nextPayload = applyTranslationToPayload(
        contentRow.document.type,
        workingPayload,
        requestRecord.targetLanguage,
        input.translatedContent
      );
      const draftUpdate = configService.updateDraft(actorFromRequest(req), contentRow.document.id, {
        payload: nextPayload,
        changeSummary: `Added ${requestRecord.targetLanguage} translation from the translation queue`
      });
      const completed = translationRequestService.completeRequest(actorFromRequest(req), requestId, {
        ...input,
        reviewDraftVersionId: draftUpdate.draft.id
      });

      res.status(200).json({
        message: "Translation added to a review draft.",
        request: completed,
        draft: draftUpdate.draft,
        document: draftUpdate.document
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          message: "Invalid translation completion payload.",
          details: error.issues.map((issue) => issue.message)
        });
        return;
      }
      next(error);
    }
  }
);
