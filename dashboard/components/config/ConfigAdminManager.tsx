"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  ConfirmationModal,
  EmptyState,
  IconActionButton,
  Input,
  Select,
  Table
} from "../ui";
import type { TableColumn } from "../ui";
import { CategoryManagementDrawer, type CategoryManagerItem } from "./CategoryManagementDrawer";
import { ConfigEditorDrawer } from "./ConfigEditorDrawer";
import { ConfigPreviewDrawer } from "./ConfigPreviewDrawer";
import { GuidedInternalNameBuilder } from "./GuidedInternalNameBuilder";
import { SettingsWorkspaceHeader } from "./SettingsWorkspaceHeader";
import { SettingsWorkspaceToolbar } from "./SettingsWorkspaceToolbar";
import {
  ADMIN_CONFIG_TOKEN_KEY,
  ADMIN_CONFIG_TOKEN_UPDATED_EVENT,
  getStoredAdminConfigToken
} from "../../lib/admin-config-auth";

type ConfigNamespace = "content" | "options" | "legal";
type ConfigDocumentType = "lesson_content" | "option_set" | "legal_block" | "ui_copy";
type TableFilter = "all" | "draft" | "live" | "trash";
type EditorMode = "create" | "edit" | null;

type Version = {
  id: string;
  versionNumber: number;
  payload?: Record<string, unknown>;
  state?: "draft" | "published" | "archived";
};

type DocumentRow = {
  document: {
    id: string;
    key: string;
    type: ConfigDocumentType;
    title: string;
    updatedAt: string;
    isActive: boolean;
  };
  draft: Version | null;
  published: Version | null;
};

type ListResponse = {
  items: Array<DocumentRow>;
  total?: number;
  page?: number;
  pageSize?: number;
};

type HistoryResponse = {
  versions: Array<{
    id: string;
    versionNumber: number;
    state: "draft" | "published" | "archived";
  }>;
};

type DocumentDetailResponse = {
  document: {
    id: string;
    key: string;
    type: ConfigDocumentType;
    title: string;
    updatedAt: string;
    isActive: boolean;
    namespace?: ConfigNamespace;
  };
  draft: Version | null;
  published: Version | null;
};

type SessionResponse = {
  actor?: {
    id?: string;
    role?: "viewer" | "editor" | "admin";
  };
};

type ConfigAdminManagerSummaryMode = "default" | "content";

type ConfigAdminManagerPresentation = {
  workspaceTitle?: string;
  workspaceDescription?: string;
  summaryMode?: ConfigAdminManagerSummaryMode;
  actionLabel?: string;
  actionHint?: string;
  secondaryActionLabel?: string;
  tableTitle?: string;
  tableDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

type ConfigAdminManagerProps = {
  namespace: ConfigNamespace;
  defaultType: ConfigDocumentType;
  copy: Record<string, string>;
  presentation?: ConfigAdminManagerPresentation;
  showAccessControls?: boolean;
};

type AuthFeedback = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type WorkflowAction =
  | "create"
  | "saveDraft"
  | "publish"
  | "history"
  | "rollback"
  | "archive"
  | "categorySaveDraft"
  | "categoryPublish";

type WorkflowFeedback = {
  tone: "info" | "success" | "warning" | "danger";
  text: string;
};

type CategoryOption = {
  value: string;
  label: string;
};

type OptionSetPayload = {
  title?: string;
  items?: Array<{
    id?: string;
    value?: string;
    label?: string;
    enabled?: boolean;
    sortOrder?: number;
    metadata?: Record<string, unknown>;
  }>;
};

type NamespaceProfile = {
  keyPlaceholder: string;
  payloadPlaceholder: string;
  defaultPayload: string;
  categorySourceKey: string;
  slugPlaceholder: string;
  createTitleKey: string;
  createTitleFallback: string;
  createDescriptionKey: string;
  createDescriptionFallback: string;
  guideTitleKey: string;
  guideTitleFallback: string;
  guideDescriptionKey: string;
  guideDescriptionFallback: string;
  namingExamples: Array<string>;
  templates: Array<{
    id: string;
    labelKey: string;
    labelFallback: string;
    payload: string;
  }>;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const OPEN_CONFIG_DOCUMENT_EVENT = "config-admin-open-document";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "");
}

function getContentCategory(key: string, type: string) {
  const normalizedKey = key.toLowerCase();

  if (type === "lesson_content" || normalizedKey.startsWith("content.lesson.")) {
    return {
      id: "lessons",
      label: "Lessons & Modules",
      badgeVariant: "success" as const
    };
  }

  if (normalizedKey.startsWith("bot.language.") || normalizedKey === "bot.language") {
    return {
      id: "languages",
      label: "Language Settings",
      badgeVariant: "teal" as const
    };
  }

  if (normalizedKey.startsWith("bot.")) {
    return {
      id: "chatbot",
      label: "Chatbot Prompts",
      badgeVariant: "purple" as const
    };
  }

  if (normalizedKey.startsWith("admin.ui.") || type === "ui_copy") {
    return {
      id: "system",
      label: "Admin UI Copy",
      badgeVariant: "neutral" as const
    };
  }

  return {
    id: "other",
    label: "Other Copy",
    badgeVariant: "neutral" as const
  };
}

// Categories that produce bot.* keys instead of content.* keys
const CHATBOT_CATEGORY_VALUES = new Set([
  "awaiting_name",
  "awaiting_language",
  "main_menu",
  "module",
  "progress",
  "webhook"
]);

function resolveKeyRoot(namespace: ConfigNamespace, category: string): string {
  if (namespace === "content" && CHATBOT_CATEGORY_VALUES.has(normalizeCategoryValue(category))) {
    return "bot";
  }
  return namespace;
}

function buildInternalName(namespace: ConfigNamespace, category: string, slug: string) {
  const root = resolveKeyRoot(namespace, category);
  const segments = [root, category.trim(), slug.trim()].filter(Boolean);
  return segments.join(".");
}

function normalizeCategoryValue(value: string) {
  return normalizeSlug(value);
}

function isOptionSetPayload(payload: unknown): payload is OptionSetPayload {
  return Boolean(
    payload && typeof payload === "object" && "items" in (payload as Record<string, unknown>)
  );
}

function toCategoryManagerItems(payload: OptionSetPayload | null): Array<CategoryManagerItem> {
  if (!payload?.items?.length) {
    return [];
  }

  return payload.items
    .map((item, index) => ({
      id:
        typeof item.id === "string" && item.id.trim().length > 0
          ? item.id
          : globalThis.crypto.randomUUID(),
      value: typeof item.value === "string" ? item.value : "",
      label: typeof item.label === "string" ? item.label : "",
      enabled: item.enabled !== false,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index + 1
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function buildCategoryPayload(title: string, items: Array<CategoryManagerItem>) {
  return {
    title,
    items: items.map((item, index) => ({
      id: item.id,
      value: item.value.trim(),
      label: item.label.trim(),
      enabled: item.enabled,
      sortOrder: index + 1,
      metadata: {}
    }))
  };
}

function resolveContentDocumentType(
  category: string,
  fallbackType: Extract<ConfigDocumentType, "lesson_content" | "ui_copy">
) {
  const normalizedCategory = normalizeCategoryValue(category);

  if (normalizedCategory === "lesson") {
    return "lesson_content" as const;
  }

  if (
    normalizedCategory === "message" ||
    normalizedCategory === "ui" ||
    CHATBOT_CATEGORY_VALUES.has(normalizedCategory)
  ) {
    return "ui_copy" as const;
  }

  return fallbackType;
}

function resolveDocumentTypeForCreate(
  namespace: ConfigNamespace,
  category: string,
  fallbackType: ConfigDocumentType
) {
  if (namespace !== "content") {
    return fallbackType;
  }

  return resolveContentDocumentType(
    category,
    fallbackType === "lesson_content" || fallbackType === "ui_copy" ? fallbackType : "ui_copy"
  );
}

function PreviewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M2 10C3.8 6.8 6.6 5.2 10 5.2C13.4 5.2 16.2 6.8 18 10C16.2 13.2 13.4 14.8 10 14.8C6.6 14.8 3.8 13.2 2 10Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M4.2 13.8L13.8 4.2L15.8 6.2L6.2 15.8L3.5 16.5L4.2 13.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.8 6.2L13.8 8.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path d="M4.5 6H15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7.5 6V4.6C7.5 4.27 7.77 4 8.1 4H11.9C12.23 4 12.5 4.27 12.5 4.6V6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M6.2 6L6.8 14.4C6.84 14.97 7.31 15.4 7.88 15.4H12.12C12.69 15.4 13.16 14.97 13.2 14.4L13.8 6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M8.5 8.2V12.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.5 8.2V12.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
      <path
        d="M6.2 7.2H3.8V4.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 7C5.1 5.2 7.1 4 9.4 4C12.95 4 15.8 6.85 15.8 10.4C15.8 13.95 12.95 16.8 9.4 16.8C6.65 16.8 4.25 15.1 3.3 12.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const NAMESPACE_PROFILES: Record<ConfigNamespace, NamespaceProfile> = {
  content: {
    keyPlaceholder: "content.lesson.onboarding",
    payloadPlaceholder: '{"en":"Welcome content","pcm":"Welcome content","ig":"Welcome content"}',
    defaultPayload: '{"en":"Welcome content","pcm":"Welcome content","ig":"Welcome content"}',
    categorySourceKey: "options.settings.content_categories",
    slugPlaceholder: "onboarding",
    createTitleKey: "configAdmin.content.create.title",
    createTitleFallback: "Add New Content",
    createDescriptionKey: "configAdmin.content.create.description",
    createDescriptionFallback: "Add learning and message content that people will see in the app.",
    guideTitleKey: "configAdmin.content.guide.title",
    guideTitleFallback: "Content Workspace",
    guideDescriptionKey: "configAdmin.content.guide.description",
    guideDescriptionFallback: "Review, update, and publish your content from one guided table.",
    namingExamples: [
      "Content example: content.lesson.onboarding",
      "Content example: content.message.welcome"
    ],
    templates: [
      {
        id: "content-copy",
        labelKey: "configAdmin.content.template.copy",
        labelFallback: "Starter: Welcome Message",
        payload:
          '{"en":"Welcome to SheTrades","pcm":"Welcome to SheTrades","ig":"Welcome to SheTrades"}'
      },
      {
        id: "content-lesson",
        labelKey: "configAdmin.content.template.lesson",
        labelFallback: "Starter: Lesson Content",
        payload:
          '{"title":"Pricing Basics","module":"Module 1: Learning Path","languages":{"en":"Lesson body","pcm":"Lesson body","ig":"Lesson body"},"quiz":[{"question":"Sample question 1","options":["Option A","Option B","Option C"],"answerIndex":0},{"question":"Sample question 2","options":["Option A","Option B","Option C"],"answerIndex":1},{"question":"Sample question 3","options":["Option A","Option B","Option C"],"answerIndex":2}]}'
      }
    ]
  },
  options: {
    keyPlaceholder: "options.bot.language_options",
    payloadPlaceholder:
      '{"items":[{"id":"en","value":"en","label":"English","enabled":true,"sortOrder":1}]}',
    defaultPayload:
      '{"items":[{"id":"en","value":"en","label":"English","enabled":true,"sortOrder":1},{"id":"pcm","value":"pcm","label":"Pidgin","enabled":true,"sortOrder":2},{"id":"ig","value":"ig","label":"Igbo","enabled":true,"sortOrder":3}]}',
    categorySourceKey: "options.settings.options_categories",
    slugPlaceholder: "supported",
    createTitleKey: "configAdmin.options.create.title",
    createTitleFallback: "Add New Choices",
    createDescriptionKey: "configAdmin.options.create.description",
    createDescriptionFallback:
      "Manage dropdown and selection choices people can pick in forms and flows.",
    guideTitleKey: "configAdmin.options.guide.title",
    guideTitleFallback: "Options Workspace",
    guideDescriptionKey: "configAdmin.options.guide.description",
    guideDescriptionFallback: "Keep every selectable choice clear, current, and easy to manage.",
    namingExamples: [
      "Options example: options.language.supported",
      "Options example: options.profile.business_sector"
    ],
    templates: [
      {
        id: "options-language",
        labelKey: "configAdmin.options.template.language",
        labelFallback: "Starter: Language Choices",
        payload:
          '{"items":[{"id":"en","value":"en","label":"English","enabled":true,"sortOrder":1},{"id":"pcm","value":"pcm","label":"Pidgin","enabled":true,"sortOrder":2},{"id":"ig","value":"ig","label":"Igbo","enabled":true,"sortOrder":3}]}'
      },
      {
        id: "options-policy",
        labelKey: "configAdmin.options.template.policy",
        labelFallback: "Starter: Amount Rule",
        payload:
          '{"items":[{"id":"module_completion","value":"200","label":"Module Completion Amount","enabled":true,"sortOrder":1}]}'
      }
    ]
  },
  legal: {
    keyPlaceholder: "legal.privacy.notice",
    payloadPlaceholder: '{"en":"Legal text","pcm":"Legal text","ig":"Legal text"}',
    defaultPayload:
      '{"en":"By continuing you agree to the latest policy terms.","pcm":"By continuing you agree to the latest policy terms.","ig":"By continuing you agree to the latest policy terms.","effectiveDate":"2026-05-10"}',
    categorySourceKey: "options.settings.legal_categories",
    slugPlaceholder: "notice",
    createTitleKey: "configAdmin.legal.create.title",
    createTitleFallback: "Add Legal Text",
    createDescriptionKey: "configAdmin.legal.create.description",
    createDescriptionFallback:
      "Update legal, consent, and policy messages with a safe review and publish flow.",
    guideTitleKey: "configAdmin.legal.guide.title",
    guideTitleFallback: "Legal Workspace",
    guideDescriptionKey: "configAdmin.legal.guide.description",
    guideDescriptionFallback:
      "Keep consent and policy language accurate, reviewed, and ready to publish.",
    namingExamples: [
      "Legal example: legal.privacy.notice",
      "Legal example: legal.marketing.consent"
    ],
    templates: [
      {
        id: "legal-consent",
        labelKey: "configAdmin.legal.template.consent",
        labelFallback: "Starter: Consent Text",
        payload:
          '{"en":"I consent to receive updates.","pcm":"I consent to receive updates.","ig":"I consent to receive updates.","effectiveDate":"2026-05-10"}'
      },
      {
        id: "legal-marketing",
        labelKey: "configAdmin.legal.template.marketing",
        labelFallback: "Starter: Marketing Notice",
        payload:
          '{"en":"You can opt out at any time.","pcm":"You can opt out at any time.","ig":"You can opt out at any time.","effectiveDate":"2026-05-10"}'
      }
    ]
  }
};

export function ConfigAdminManager({
  namespace,
  defaultType,
  copy,
  presentation,
  showAccessControls = false
}: ConfigAdminManagerProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState("");
  const [docs, setDocs] = useState<Array<DocumentRow>>([]);
  const [optionDocs, setOptionDocs] = useState<Array<DocumentRow>>([]);
  const [role, setRole] = useState<string>("unknown");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [keyInput, setKeyInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [lessonNumberInput, setLessonNumberInput] = useState("1");
  const [titleInput, setTitleInput] = useState("");
  const [payloadInput, setPayloadInput] = useState('{"en":"New value"}');
  const [history, setHistory] = useState<Array<HistoryResponse["versions"][number]>>([]);
  const [authFeedback, setAuthFeedback] = useState<AuthFeedback | null>(null);
  const [isRefreshingAccess, setIsRefreshingAccess] = useState(false);
  const [activeWorkflowAction, setActiveWorkflowAction] = useState<WorkflowAction | null>(null);
  const [workflowFeedback, setWorkflowFeedback] = useState<WorkflowFeedback | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<DocumentDetailResponse | null>(null);
  const [previewHistory, setPreviewHistory] = useState<Array<HistoryResponse["versions"][number]>>(
    []
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [trashTarget, setTrashTarget] = useState<DocumentRow | null>(null);
  const [purgeTrashOpen, setPurgeTrashOpen] = useState(false);
  const [isPurgingTrash, setIsPurgingTrash] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categoryItems, setCategoryItems] = useState<Array<CategoryManagerItem>>([]);
  const [categoryFeedback, setCategoryFeedback] = useState<WorkflowFeedback | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [activeFilter, setActiveFilter] = useState<TableFilter>("all");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const hasAttemptedCategorySeedRef = useRef(false);
  const profile = NAMESPACE_PROFILES[namespace];
  const selectedDocumentRow = docs.find((item) => item.document.key === selectedKey) ?? null;
  const categoryDocumentRow =
    optionDocs.find((item) => item.document.key === profile.categorySourceKey) ?? null;

  const existingModules = useMemo(() => {
    const modules = new Set<string>();
    docs.forEach((row) => {
      const payload = row.draft?.payload ?? row.published?.payload;
      if (
        payload &&
        typeof payload === "object" &&
        "module" in payload &&
        typeof payload.module === "string"
      ) {
        const trimmed = payload.module.trim();
        if (trimmed) {
          modules.add(trimmed);
        }
      }
    });
    return Array.from(modules);
  }, [docs]);

  const t = useMemo(
    () => (key: string, fallback: string) => {
      const value = copy[key];
      return typeof value === "string" && value.trim().length > 0 ? value : fallback;
    },
    [copy]
  );

  useEffect(() => {
    const existing = getStoredAdminConfigToken();
    setTokenInput(existing);
    setToken(existing);

    function handleTokenUpdated() {
      const nextToken = getStoredAdminConfigToken();
      setTokenInput(nextToken);
      setToken(nextToken);
      void refresh({ accessToken: nextToken });
    }

    window.addEventListener(ADMIN_CONFIG_TOKEN_UPDATED_EVENT, handleTokenUpdated);
    return () => {
      window.removeEventListener(ADMIN_CONFIG_TOKEN_UPDATED_EVENT, handleTokenUpdated);
    };
  }, []);

  useEffect(() => {
    setPayloadInput(profile.defaultPayload);
  }, [profile.defaultPayload]);

  const managedCategoryOptions = useMemo(() => {
    const sourcePayload =
      categoryDocumentRow?.draft?.payload ?? categoryDocumentRow?.published?.payload;

    if (!isOptionSetPayload(sourcePayload) || !Array.isArray(sourcePayload.items)) {
      return [] as Array<CategoryOption>;
    }

    return sourcePayload.items
      .filter(
        (item) =>
          item.enabled !== false && typeof item.value === "string" && item.value.trim().length > 0
      )
      .map((item) => ({
        value: String(item.value).trim().toLowerCase(),
        label:
          typeof item.label === "string" && item.label.trim().length > 0
            ? item.label
            : String(item.value)
      }));
  }, [categoryDocumentRow]);

  const categoryOptions = useMemo(() => {
    if (managedCategoryOptions.length > 0) return managedCategoryOptions;
    if (namespace === "content") {
      return [
        { value: "lesson", label: "Lesson" },
        { value: "message", label: "Message" },
        { value: "ui", label: "UI" }
      ];
    } else if (namespace === "options") {
      return [
        { value: "language", label: "Language" },
        { value: "profile", label: "Profile" }
      ];
    } else if (namespace === "legal") {
      return [
        { value: "privacy", label: "Privacy" },
        { value: "terms", label: "Terms" }
      ];
    }
    return [];
  }, [managedCategoryOptions, namespace]);

  const parsedPayload = useMemo(() => {
    try {
      return JSON.parse(payloadInput);
    } catch {
      return {};
    }
  }, [payloadInput]);

  const activeSlug = useMemo(() => {
    if (categoryInput !== "lesson") return slugInput;
    const moduleName = String(parsedPayload?.module || "");
    const lessonTitle = String(parsedPayload?.title || "");
    
    const modMatch = moduleName.match(/module\s*(\d+)/i);
    const mNum = modMatch ? `m${modMatch[1]}` : "m0";
    const lNum = lessonNumberInput ? `l${lessonNumberInput}` : "l0";
    const firstLetter = lessonTitle ? lessonTitle.charAt(0).toLowerCase() : "x";
    
    return `${mNum}_${lNum}_${firstLetter}`;
  }, [categoryInput, slugInput, parsedPayload, lessonNumberInput]);

  const assembledCreateKey = buildInternalName(namespace, categoryInput, activeSlug);
  const resolvedCreateType = resolveDocumentTypeForCreate(namespace, categoryInput, defaultType);
  const createBuilderNotice = useMemo(() => {
    if (categoryOptions.length === 0) {
      return {
        tone: "warning" as const,
        text: t(
          "configAdmin.create.categoryEmpty",
          "No categories are available yet for this section. Add the category choices first, then come back to create this item."
        )
      };
    }

    if (!categoryInput) {
      return {
        tone: "info" as const,
        text: t(
          "configAdmin.create.categoryMissing",
          "Choose a category to finish building the internal name."
        )
      };
    }

    return null;
  }, [categoryInput, categoryOptions.length, t]);

  const isCreateKeyValid =
    categoryOptions.some((option) => option.value === categoryInput) &&
    categoryInput.trim().length > 0 &&
    activeSlug.trim().length > 0 &&
    /^[a-z0-9_.-]+$/.test(activeSlug) &&
    assembledCreateKey.trim().length > 0;

  const filterCounts = useMemo(
    () => ({
      all: docs.length,
      draft: docs.filter((item) => item.draft !== null).length,
      live: docs.filter((item) => item.document.isActive && item.published !== null).length,
      trash: docs.filter((item) => !item.document.isActive).length
    }),
    [docs]
  );

  const workspaceSummary = useMemo(() => {
    if (presentation?.summaryMode === "content") {
      return [
        {
          label: t("content.workspace.summary.total", "Total Items"),
          value: String(docs.length)
        },
        {
          label: t("content.workspace.summary.draft", "Drafts"),
          value: String(filterCounts.draft)
        },
        {
          label: t("content.workspace.summary.live", "Live"),
          value: String(filterCounts.live)
        }
      ];
    }

    return [
      {
        label: t("configAdmin.guide.totalDocuments", "Items Loaded"),
        value: String(docs.length)
      },
      {
        label: t("configAdmin.auth.role", "Access Level"),
        value: role
      }
    ];
  }, [docs.length, filterCounts.draft, filterCounts.live, presentation?.summaryMode, role, t]);

  const filteredDocs = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return docs.filter((item) => {
      const matchesQuery =
        query.length === 0 ||
        item.document.title.toLowerCase().includes(query) ||
        item.document.key.toLowerCase().includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (activeFilter === "draft") {
        if (item.draft === null) return false;
      } else if (activeFilter === "live") {
        if (!item.document.isActive || item.published === null) return false;
      } else if (activeFilter === "trash") {
        if (item.document.isActive) return false;
      }

      if (namespace === "content" && activeCategoryFilter !== "all") {
        const catMeta = getContentCategory(item.document.key, item.document.type);
        if (catMeta.id !== activeCategoryFilter) {
          return false;
        }
      }

      return true;
    });
  }, [activeFilter, activeCategoryFilter, docs, searchValue, namespace]);

  async function purgeTrash() {
    setIsPurgingTrash(true);
    try {
      await request("/api/config/admin/documents/purge-trash", {
        method: "POST",
        body: JSON.stringify({ namespace })
      });
      setPurgeTrashOpen(false);
      setActiveFilter("all");
      setWorkflowFeedback({
        tone: "success",
        text: t(
          "configAdmin.purgeTrash.success",
          "All trashed items were permanently deleted."
        )
      });
      await refresh();
    } catch (error) {
      setWorkflowFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsPurgingTrash(false);
    }
  }

  async function request(path: string, init?: RequestInit, accessToken = token) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(init?.headers ?? {})
      }
    });
    const text = await response.text();
    const responseContentType = response.headers.get("content-type") ?? "";
    const expectsJson = responseContentType.includes("application/json");
    let body: { message?: string } = {};

    if (text) {
      if (expectsJson) {
        body = JSON.parse(text) as { message?: string };
      } else {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 120);
        throw new Error(
          t(
            "configAdmin.error.nonJsonResponse",
            "The settings service returned an unexpected page instead of data."
          ) +
            ` URL: ${response.url}.` +
            ` Status: ${response.status}.` +
            ` Content-Type: ${responseContentType || "unknown"}.` +
            ` Preview: ${preview}`
        );
      }
    }

    if (!response.ok) {
      const errorMessage =
        body && typeof body.message === "string"
          ? body.message
          : `${t("configAdmin.error.requestFailed", "Request failed")} (${response.status})`;
      throw new Error(errorMessage);
    }
    return body;
  }

  // Load every document for a list endpoint by paging through results. The admin
  // list API defaults pageSize to 20 and caps it at 100, so a single call would
  // silently truncate larger libraries (the content table counts and rows are
  // derived entirely from what's loaded). Page until we've pulled the reported
  // total, with a hard safety backstop.
  async function fetchAllDocuments(listPath: string, accessToken = token): Promise<Array<DocumentRow>> {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50; // safety backstop: up to 5,000 documents
    const all: Array<DocumentRow> = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (all.length < total && page <= MAX_PAGES) {
      const separator = listPath.includes("?") ? "&" : "?";
      const response = (await request(
        `${listPath}${separator}page=${page}&pageSize=${PAGE_SIZE}`,
        undefined,
        accessToken
      )) as ListResponse;
      const items = response.items ?? [];
      all.push(...items);
      total = typeof response.total === "number" ? response.total : all.length;
      if (items.length < PAGE_SIZE) break; // reached the last page
      page += 1;
    }
    return all;
  }

  function getCategoryDocumentTitle() {
    if (namespace === "content") {
      return t("configAdmin.categories.contentTitle", "Content Categories");
    }
    if (namespace === "options") {
      return t("configAdmin.categories.optionsTitle", "Options Categories");
    }
    return t("configAdmin.categories.legalTitle", "Legal Categories");
  }

  function validateCategoryItems(items: Array<CategoryManagerItem>) {
    if (!items.length) {
      return t(
        "configAdmin.categories.validation.emptyList",
        "Add at least one category before saving."
      );
    }

    const enabledCount = items.filter((item) => item.enabled).length;
    if (enabledCount === 0) {
      return t(
        "configAdmin.categories.validation.enabledRequired",
        "Keep at least one category visible so people can build internal names."
      );
    }

    const seenValues = new Set<string>();
    for (const item of items) {
      const value = item.value.trim();
      const label = item.label.trim();
      if (!label) {
        return t(
          "configAdmin.categories.validation.labelRequired",
          "Each category needs a display name."
        );
      }
      if (!value) {
        return t(
          "configAdmin.categories.validation.valueRequired",
          "Each category needs an internal value."
        );
      }
      if (!/^[a-z0-9_.-]+$/.test(value)) {
        return t(
          "configAdmin.categories.validation.valueFormat",
          "Use only lowercase letters, numbers, dots, dashes, or underscores for internal values."
        );
      }
      if (seenValues.has(value)) {
        return t(
          "configAdmin.categories.validation.duplicate",
          "Each category needs a unique internal value."
        );
      }
      seenValues.add(value);
    }

    return null;
  }

  async function ensureCategorySeeds(accessToken = token) {
    await request(
      "/api/config/admin/category-seeds/ensure",
      {
        method: "POST",
        body: JSON.stringify({})
      },
      accessToken
    );
  }

  async function refresh(options?: { fromAccessControls?: boolean; accessToken?: string }) {
    const accessToken = options?.accessToken ?? token;
    if (!accessToken) {
      if (options?.fromAccessControls) {
        setAuthFeedback({
          tone: "warning",
          text: t("configAdmin.auth.missingKey", "Paste and save your access key first.")
        });
      }
      return;
    }

    if (options?.fromAccessControls) {
      setIsRefreshingAccess(true);
      setAuthFeedback({
        tone: "info",
        text: t("configAdmin.auth.refreshing", "Checking your access and loading settings...")
      });
    }

    try {
      const session = (await request(
        "/api/config/admin/session",
        undefined,
        accessToken
      )) as SessionResponse;
      setRole(session.actor?.role ?? "unknown");
      const [nextDocs, initialOptionDocs] = await Promise.all([
        fetchAllDocuments(`/api/config/admin/${namespace}/documents`, accessToken),
        fetchAllDocuments("/api/config/admin/options/documents", accessToken)
      ]);
      let nextOptionDocs = initialOptionDocs;

      if (
        session.actor?.role === "admin" &&
        !hasAttemptedCategorySeedRef.current &&
        !nextOptionDocs.some((item) => item.document.key === profile.categorySourceKey)
      ) {
        hasAttemptedCategorySeedRef.current = true;
        await ensureCategorySeeds(accessToken);
        nextOptionDocs = await fetchAllDocuments(
          "/api/config/admin/options/documents",
          accessToken
        );
      }

      setOptionDocs(nextOptionDocs);
      setDocs(nextDocs);
      if (nextDocs.length) {
        const hasSelectedItem = nextDocs.some((item) => item.document.key === selectedKey);
        if (!selectedKey || !hasSelectedItem) {
          setSelectedKey(nextDocs[0]?.document.key ?? "");
        }
      } else {
        setSelectedKey("");
      }
      if (options?.fromAccessControls) {
        setAuthFeedback({
          tone: "success",
          text: t("configAdmin.auth.ready", "Access confirmed. Settings are ready.")
        });
      }
    } catch (error) {
      if (options?.fromAccessControls) {
        setAuthFeedback({
          tone: "danger",
          text: error instanceof Error ? error.message : String(error)
        });
      }
    } finally {
      if (options?.fromAccessControls) {
        setIsRefreshingAccess(false);
      }
    }
  }

  async function loadDocumentDetail(targetKey: string) {
    const [detailResponse, historyResponse] = await Promise.all([
      request(`/api/config/admin/${namespace}/documents/${encodeURIComponent(targetKey)}`),
      request(`/api/config/admin/${namespace}/documents/${encodeURIComponent(targetKey)}/history`)
    ]);

    return {
      detail: detailResponse as DocumentDetailResponse,
      history: (historyResponse as HistoryResponse).versions ?? []
    };
  }

  function formatPayload(payload: Record<string, unknown> | undefined) {
    return JSON.stringify(payload ?? {}, null, 2);
  }

  function applyTemplate(templateId: string) {
    const template = profile.templates.find((item) => item.id === templateId);
    if (template) {
      setPayloadInput(template.payload);
      if (namespace === "content") {
        if (templateId === "content-lesson") {
          setCategoryInput("lesson");
        } else if (templateId === "content-copy") {
          setCategoryInput("message");
        }
      }
    }
  }

  function resetCreateInputs() {
    setKeyInput("");
    setCategoryInput("");
    setSlugInput("");
    setLessonNumberInput("1");
    setTitleInput("");
    setPayloadInput(profile.defaultPayload);
  }

  function openCreateDrawer() {
    resetCreateInputs();
    setWorkflowFeedback(null);
    setEditorMode("create");
  }

  async function openEditDrawer(targetKey: string, detail?: DocumentDetailResponse | null) {
    const nextData = detail ? { detail, history } : await loadDocumentDetail(targetKey);
    const nextDetail = nextData.detail;
    const workingPayload = nextDetail.draft?.payload ?? nextDetail.published?.payload ?? {};

    setSelectedKey(targetKey);
    setKeyInput(nextDetail.document.key);
    setTitleInput(nextDetail.document.title);
    setPayloadInput(formatPayload(workingPayload));
    setHistory(nextData.history ?? []);
    setWorkflowFeedback(null);
    setEditorMode("edit");
  }

  function closeEditor() {
    setEditorMode(null);
  }

  useEffect(() => {
    if (namespace !== "content") {
      return;
    }

    function handleOpenConfigDocument(event: Event) {
      const detail = (event as CustomEvent<{ namespace?: string; key?: string }>).detail;
      if (detail?.namespace !== namespace || !detail.key) {
        return;
      }

      void openEditDrawer(detail.key).catch((error) => {
        setWorkflowFeedback({
          tone: "danger",
          text: error instanceof Error ? error.message : String(error)
        });
      });
    }

    window.addEventListener(OPEN_CONFIG_DOCUMENT_EVENT, handleOpenConfigDocument);
    return () => {
      window.removeEventListener(OPEN_CONFIG_DOCUMENT_EVENT, handleOpenConfigDocument);
    };
  }, [namespace, history]);

  async function openPreview(targetKey: string) {
    setSelectedKey(targetKey);
    setPreviewKey(targetKey);
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const { detail, history: versionHistory } = await loadDocumentDetail(targetKey);
      setPreviewDetail(detail);
      setPreviewHistory(versionHistory);
    } catch (error) {
      setPreviewDetail(null);
      setPreviewHistory([]);
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreviewKey(null);
    setPreviewDetail(null);
    setPreviewHistory([]);
    setPreviewError("");
    setPreviewLoading(false);
  }

  async function openCategoryDrawer() {
    setCategoryFeedback(null);
    let nextOptionDocs = optionDocs;

    if (!categoryDocumentRow && role === "admin") {
      try {
        await ensureCategorySeeds();
        const optionList = (await request(
          "/api/config/admin/options/documents?pageSize=100"
        )) as ListResponse;
        nextOptionDocs = optionList.items ?? [];
        setOptionDocs(nextOptionDocs);
      } catch (error) {
        setCategoryFeedback({
          tone: "danger",
          text: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const nextCategoryDocument =
      nextOptionDocs.find((item) => item.document.key === profile.categorySourceKey) ?? null;
    const nextPayload =
      nextCategoryDocument?.draft?.payload ?? nextCategoryDocument?.published?.payload;
    setCategoryItems(toCategoryManagerItems(isOptionSetPayload(nextPayload) ? nextPayload : null));
    setCategoryDrawerOpen(true);
  }

  function closeCategoryDrawer() {
    setCategoryDrawerOpen(false);
    setCategoryFeedback(null);
  }

  function updateCategoryItem(
    targetId: string,
    updater: (item: CategoryManagerItem) => CategoryManagerItem
  ) {
    setCategoryItems((current) =>
      current.map((item) => (item.id === targetId ? updater(item) : item))
    );
  }

  function addCategoryItem() {
    setCategoryItems((current) => [
      ...current,
      {
        id: globalThis.crypto.randomUUID(),
        value: "",
        label: "",
        enabled: true,
        sortOrder: current.length + 1
      }
    ]);
  }

  function reorderCategoryItem(targetId: string, direction: "up" | "down") {
    setCategoryItems((current) => {
      const index = current.findIndex((item) => item.id === targetId);
      if (index === -1) {
        return current;
      }

      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const nextItems = [...current];
      const [movedItem] = nextItems.splice(index, 1);
      if (!movedItem) {
        return current;
      }
      nextItems.splice(nextIndex, 0, movedItem);

      return nextItems.map((item, itemIndex) => ({
        ...item,
        sortOrder: itemIndex + 1
      }));
    });
  }

  function beginCategoryAction(
    action: Extract<WorkflowAction, "categorySaveDraft" | "categoryPublish">,
    text: string
  ) {
    setActiveWorkflowAction(action);
    setCategoryFeedback({ tone: "info", text });
  }

  function completeCategoryAction(tone: WorkflowFeedback["tone"], text: string) {
    setActiveWorkflowAction(null);
    setCategoryFeedback({ tone, text });
  }

  async function saveCategoryDraft() {
    const validationMessage = validateCategoryItems(categoryItems);
    if (validationMessage) {
      completeCategoryAction("warning", validationMessage);
      return;
    }

    const nextPayload = buildCategoryPayload(getCategoryDocumentTitle(), categoryItems);

    try {
      beginCategoryAction(
        "categorySaveDraft",
        t("configAdmin.categories.saving", "Saving category changes...")
      );

      if (!categoryDocumentRow) {
        await request("/api/config/admin/options/documents", {
          method: "POST",
          body: JSON.stringify({
            key: profile.categorySourceKey,
            type: "option_set",
            title: getCategoryDocumentTitle(),
            initialPayload: nextPayload
          })
        });
      } else {
        await request(
          `/api/config/admin/options/documents/${encodeURIComponent(profile.categorySourceKey)}/draft`,
          {
            method: "PUT",
            body: JSON.stringify({
              payload: nextPayload,
              changeSummary: t(
                "configAdmin.categories.changeSummary",
                "Updated settings categories"
              )
            })
          }
        );
      }

      await refresh();
      completeCategoryAction(
        "success",
        t("configAdmin.categories.saved", "Category draft saved successfully.")
      );
    } catch (error) {
      completeCategoryAction("danger", error instanceof Error ? error.message : String(error));
    }
  }

  async function publishCategoryChanges() {
    const validationMessage = validateCategoryItems(categoryItems);
    if (validationMessage) {
      completeCategoryAction("warning", validationMessage);
      return;
    }

    const nextPayload = buildCategoryPayload(getCategoryDocumentTitle(), categoryItems);

    try {
      beginCategoryAction(
        "categoryPublish",
        t("configAdmin.categories.publishing", "Publishing category changes...")
      );

      let draftId: string | null = null;

      if (!categoryDocumentRow) {
        const created = (await request("/api/config/admin/options/documents", {
          method: "POST",
          body: JSON.stringify({
            key: profile.categorySourceKey,
            type: "option_set",
            title: getCategoryDocumentTitle(),
            initialPayload: nextPayload
          })
        })) as { draft?: { id?: string } };
        draftId = created.draft?.id ?? null;
      } else {
        const updated = (await request(
          `/api/config/admin/options/documents/${encodeURIComponent(profile.categorySourceKey)}/draft`,
          {
            method: "PUT",
            body: JSON.stringify({
              payload: nextPayload,
              changeSummary: t(
                "configAdmin.categories.publishSummary",
                "Prepared settings categories for publishing"
              )
            })
          }
        )) as { draft?: { id?: string } };
        draftId = updated.draft?.id ?? categoryDocumentRow.draft?.id ?? null;
      }

      if (!draftId) {
        throw new Error(
          t(
            "configAdmin.categories.publishMissingDraft",
            "Save category changes before publishing."
          )
        );
      }

      await request(
        `/api/config/admin/options/documents/${encodeURIComponent(profile.categorySourceKey)}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedDraftVersionId: draftId,
            publishNote: t(
              "configAdmin.categories.publishNote",
              "Published settings categories from the settings workspace"
            )
          })
        }
      );

      await refresh();
      completeCategoryAction(
        "success",
        t("configAdmin.categories.published", "Category changes are now live.")
      );
    } catch (error) {
      completeCategoryAction("danger", error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, [token, namespace]);

  function saveToken() {
    const trimmedToken = tokenInput.trim();
    if (!trimmedToken) {
      setAuthFeedback({
        tone: "warning",
        text: t("configAdmin.auth.emptyKey", "Paste your access key before saving.")
      });
      return;
    }

    window.localStorage.setItem(ADMIN_CONFIG_TOKEN_KEY, trimmedToken);
    window.dispatchEvent(new CustomEvent("admin-config-token-updated"));
    setToken(trimmedToken);
    setAuthFeedback({
      tone: "success",
      text: t(
        "configAdmin.message.tokenSaved",
        "Access key saved in this browser. Click Reload to confirm access."
      )
    });
  }

  function parsePayload() {
    return JSON.parse(payloadInput) as Record<string, unknown>;
  }

  function beginWorkflowAction(action: WorkflowAction, loadingText: string) {
    setActiveWorkflowAction(action);
    setWorkflowFeedback({ tone: "info", text: loadingText });
  }

  function completeWorkflowAction(tone: WorkflowFeedback["tone"], text: string) {
    setActiveWorkflowAction(null);
    setWorkflowFeedback({ tone, text });
  }

  async function createDocument() {
    if (!isCreateKeyValid) {
      completeWorkflowAction(
        "warning",
        t(
          "configAdmin.create.namingIncomplete",
          "Finish the internal name first by choosing a category and adding a short name."
        )
      );
      return;
    }
    try {
      beginWorkflowAction("create", t("configAdmin.create.saving", "Saving your new item..."));
      const trimmedKey = assembledCreateKey.trim();
      await request(`/api/config/admin/${namespace}/documents`, {
        method: "POST",
        body: JSON.stringify({
          key: trimmedKey,
          type: resolvedCreateType,
          title: titleInput.trim() || trimmedKey,
          initialPayload: parsePayload()
        })
      });
      await refresh();
      setSelectedKey(trimmedKey);
      closeEditor();
      completeWorkflowAction(
        "success",
        t("configAdmin.message.created", "New item saved successfully.")
      );
    } catch (error) {
      completeWorkflowAction("danger", error instanceof Error ? error.message : String(error));
    }
  }

  async function updateDraft() {
    if (!selectedKey) {
      completeWorkflowAction(
        "warning",
        t("configAdmin.manage.selectFirst", "Choose an item before saving a draft.")
      );
      return;
    }
    try {
      beginWorkflowAction("saveDraft", t("configAdmin.manage.savingDraft", "Saving your draft..."));
      await request(
        `/api/config/admin/${namespace}/documents/${encodeURIComponent(selectedKey)}/draft`,
        {
          method: "PUT",
          body: JSON.stringify({
            payload: parsePayload(),
            changeSummary: t("configAdmin.changeSummary", "Updated via admin workspace")
          })
        }
      );
      await refresh();
      await openEditDrawer(selectedKey);
      completeWorkflowAction(
        "success",
        t("configAdmin.message.draftUpdated", "Draft saved successfully.")
      );
    } catch (error) {
      completeWorkflowAction("danger", error instanceof Error ? error.message : String(error));
    }
  }

  async function publish() {
    const selected = docs.find((item) => item.document.key === selectedKey);
    if (!selected?.draft?.id) {
      completeWorkflowAction(
        "warning",
        t("configAdmin.manage.publishBlocked", "Save a draft before publishing live.")
      );
      return;
    }
    try {
      beginWorkflowAction(
        "publish",
        t("configAdmin.manage.publishing", "Publishing your changes live...")
      );
      await request(
        `/api/config/admin/${namespace}/documents/${encodeURIComponent(selectedKey)}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedDraftVersionId: selected.draft.id,
            publishNote: t("configAdmin.publishNote", "Published from admin workspace")
          })
        }
      );
      await refresh();
      await openEditDrawer(selectedKey);
      completeWorkflowAction(
        "success",
        t("configAdmin.message.published", "Changes published live.")
      );
    } catch (error) {
      completeWorkflowAction("danger", error instanceof Error ? error.message : String(error));
    }
  }

  async function loadHistory(targetKey = selectedKey, silent = false) {
    if (!targetKey) {
      if (!silent) {
        completeWorkflowAction(
          "warning",
          t("configAdmin.manage.historyBlocked", "Choose an item before viewing history.")
        );
      }
      return [] as Array<HistoryResponse["versions"][number]>;
    }

    try {
      if (!silent) {
        beginWorkflowAction(
          "history",
          t("configAdmin.manage.loadingHistory", "Loading version history...")
        );
      }
      const response = (await request(
        `/api/config/admin/${namespace}/documents/${encodeURIComponent(targetKey)}/history`
      )) as HistoryResponse;
      const versions = response.versions ?? [];
      setHistory(versions);
      setSelectedKey(targetKey);
      if (!silent) {
        completeWorkflowAction(
          "success",
          t("configAdmin.message.historyLoaded", "Version history loaded.")
        );
      }
      return versions;
    } catch (error) {
      if (!silent) {
        completeWorkflowAction("danger", error instanceof Error ? error.message : String(error));
      }
      return [] as Array<HistoryResponse["versions"][number]>;
    }
  }

  async function rollback() {
    if (!selectedKey) {
      completeWorkflowAction(
        "warning",
        t("configAdmin.manage.rollbackBlocked", "Choose an item before restoring a version.")
      );
      return;
    }

    const selected = docs.find((item) => item.document.key === selectedKey) ?? null;
    const currentPublishedId = selected?.published?.id;
    const versionHistory = history.length ? history : await loadHistory(selectedKey, true);
    const target = versionHistory.find(
      (item) =>
        (item.state === "published" || item.state === "archived") && item.id !== currentPublishedId
    );

    if (!target) {
      completeWorkflowAction(
        "warning",
        t("configAdmin.message.noRollbackTarget", "No previous version is available to restore.")
      );
      return;
    }

    try {
      beginWorkflowAction(
        "rollback",
        t("configAdmin.manage.restoring", "Restoring the previous version...")
      );
      await request(
        `/api/config/admin/${namespace}/documents/${encodeURIComponent(selectedKey)}/rollback`,
        {
          method: "POST",
          body: JSON.stringify({
            targetVersionId: target.id,
            rollbackReason: t("configAdmin.rollbackReason", "Rollback from admin workspace")
          })
        }
      );
      await refresh();
      await openEditDrawer(selectedKey);
      completeWorkflowAction(
        "success",
        t("configAdmin.message.rolledBack", "Previous version restored.")
      );
    } catch (error) {
      completeWorkflowAction("danger", error instanceof Error ? error.message : String(error));
    }
  }

  async function archive(targetKey = selectedKey) {
    if (!targetKey) {
      completeWorkflowAction(
        "warning",
        t("configAdmin.manage.archiveBlocked", "Choose an item before moving it to trash.")
      );
      return;
    }

    const targetRow = docs.find((item) => item.document.key === targetKey) ?? null;

    if (targetRow && !targetRow.document.isActive) {
      try {
        beginWorkflowAction("archive", t("configAdmin.manage.showing", "Restoring this item..."));
        await request(
          `/api/config/admin/${namespace}/documents/${encodeURIComponent(targetKey)}/reactivate`,
          {
            method: "POST",
            body: JSON.stringify({
              reactivateReason: t(
                "configAdmin.reactivateReason",
                "Shown again from admin workspace"
              )
            })
          }
        );
        await refresh();
        if (previewKey === targetKey) {
          await openPreview(targetKey);
        }
        completeWorkflowAction(
          "success",
          t("configAdmin.message.reactivated", "Item restored successfully.")
        );
      } catch (error) {
        completeWorkflowAction("danger", error instanceof Error ? error.message : String(error));
      }
      return;
    }

    try {
      beginWorkflowAction(
        "archive",
        t("configAdmin.manage.hiding", "Moving this item to trash...")
      );
      await request(
        `/api/config/admin/${namespace}/documents/${encodeURIComponent(targetKey)}/archive`,
        {
          method: "POST",
          body: JSON.stringify({
            archiveReason: t("configAdmin.archiveReason", "Archived from admin workspace")
          })
        }
      );
      setTrashTarget(null);
      closeEditor();
      await refresh();
      if (previewKey === targetKey) {
        await openPreview(targetKey);
      }
      completeWorkflowAction("success", t("configAdmin.message.archived", "Item moved to trash."));
    } catch (error) {
      completeWorkflowAction("danger", error instanceof Error ? error.message : String(error));
    }
  }

  function requestTrashOrRestore(targetKey: string) {
    const targetRow = docs.find((item) => item.document.key === targetKey) ?? null;
    if (!targetRow) {
      return;
    }

    setSelectedKey(targetKey);
    if (targetRow.document.isActive) {
      setTrashTarget(targetRow);
      return;
    }

    void archive(targetKey);
  }

  function getVisibilityLabel(isActive: boolean) {
    return isActive
      ? t("configAdmin.table.visibleYes", "Visible")
      : t("configAdmin.table.visibleNo", "In Trash");
  }

  function getVisibilityVariant(isActive: boolean) {
    return isActive ? "success" : "warning";
  }

  function getPreviewStatusLabel(detail: DocumentDetailResponse | null) {
    if (!detail) {
      return "-";
    }
    if (!detail.document.isActive) {
      return t("configAdmin.preview.statusTrashed", "In Trash");
    }
    if (detail.draft) {
      return t("configAdmin.preview.statusDraft", "Draft Ready");
    }
    if (detail.published) {
      return t("configAdmin.preview.statusLive", "Live");
    }
    return t("configAdmin.preview.statusUnknown", "Saved");
  }

  function getDocumentTypeFieldLabel(detail: { document: { namespace?: ConfigNamespace } } | null) {
    if (detail?.document.namespace === "content" || namespace === "content") {
      return t("configAdmin.preview.kindLabel", "Content Kind");
    }

    return t("configAdmin.preview.typeLabel", "Item Type");
  }

  function getDocumentTypeLabel(
    detail:
      | {
          document: {
            type: ConfigDocumentType;
            namespace?: ConfigNamespace;
          };
        }
      | null
  ) {
    const targetNamespace = detail?.document.namespace ?? namespace;

    if (detail?.document.type === "lesson_content") {
      return t("configAdmin.type.lesson", "Lesson Content");
    }

    if (detail?.document.type === "ui_copy") {
      return targetNamespace === "content"
        ? t("configAdmin.type.message", "Message Content")
        : t("configAdmin.type.genericCopy", "Managed Copy");
    }

    if (detail?.document.type === "option_set") {
      return t("configAdmin.type.optionSet", "Option Set");
    }

    if (detail?.document.type === "legal_block") {
      return t("configAdmin.type.legalBlock", "Legal Block");
    }

    return t("configAdmin.type.fallback", "Saved Item");
  }

  const filterItems = [
    { id: "all", label: t("configAdmin.filter.all", "All"), count: filterCounts.all },
    { id: "draft", label: t("configAdmin.filter.draft", "Draft"), count: filterCounts.draft },
    { id: "live", label: t("configAdmin.filter.live", "Live"), count: filterCounts.live },
    { id: "trash", label: t("configAdmin.filter.trash", "Trash"), count: filterCounts.trash }
  ];

  const categoryFilterOptions = useMemo(() => [
    { value: "all", label: t("configAdmin.categoryFilter.all", "All Types") },
    { value: "lessons", label: t("configAdmin.categoryFilter.lessons", "Lessons & Modules") },
    { value: "chatbot", label: t("configAdmin.categoryFilter.chatbot", "Chatbot Prompts") },
    { value: "languages", label: t("configAdmin.categoryFilter.languages", "Language Settings") },
    { value: "system", label: t("configAdmin.categoryFilter.system", "Admin UI Copy") },
    { value: "other", label: t("configAdmin.categoryFilter.other", "Other") }
  ], [t]);

  const trashCount = filterCounts.trash;

  const categoryFilter = namespace === "content" ? (
    <div className="settings-workspace-toolbar__category-filter-row">
      <Select
        id="content-category-filter"
        label={t("configAdmin.categoryFilter.label", "Content Type")}
        value={activeCategoryFilter}
        options={categoryFilterOptions}
        onChange={setActiveCategoryFilter}
      />
      {trashCount > 0 ? (
        <button
          type="button"
          className="config-purge-trash-btn"
          onClick={() => setPurgeTrashOpen(true)}
          title={t("configAdmin.purgeTrash.buttonTitle", "Permanently delete all trashed items")}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none">
            <path d="M4.5 6H15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M7.5 6V4.6C7.5 4.27 7.77 4 8.1 4H11.9C12.23 4 12.5 4.27 12.5 4.6V6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M6.2 6L6.8 14.4C6.84 14.97 7.31 15.4 7.88 15.4H12.12C12.69 15.4 13.16 14.97 13.2 14.4L13.8 6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8.5 8.2V12.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M11.5 8.2V12.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {t("configAdmin.purgeTrash.button", "Empty Trash")}
          <span className="config-purge-trash-btn__badge">{trashCount}</span>
        </button>
      ) : null}
    </div>
  ) : undefined;

  return (
    <section className="settings-workspace">
      <SettingsWorkspaceHeader
        title={
          presentation?.workspaceTitle ?? t(profile.guideTitleKey, profile.guideTitleFallback)
        }
        description={
          presentation?.workspaceDescription ??
          t(profile.guideDescriptionKey, profile.guideDescriptionFallback)
        }
        summary={workspaceSummary}
      />

      {showAccessControls ? (
        <section className="settings-access-bar">
          <div className="settings-access-bar__field">
            <Input
              id={`token-${namespace}`}
              label={t("configAdmin.auth.tokenLabel", "Access Key")}
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={t("configAdmin.auth.tokenPlaceholder", "Paste your access key")}
            />
          </div>
          <div className="settings-access-bar__actions">
            <Button onClick={saveToken} disabled={isRefreshingAccess}>
              {t("configAdmin.auth.saveToken", "Save Key")}
            </Button>
            <Button
              variant="secondary"
              loading={isRefreshingAccess}
              onClick={() => void refresh({ fromAccessControls: true })}
            >
              {t("configAdmin.actions.refresh", "Reload")}
            </Button>
            <Badge variant="info">{`${t("configAdmin.auth.role", "Access Level")}: ${role}`}</Badge>
          </div>
          <p className="settings-access-bar__hint">
            {t(
              "configAdmin.auth.help",
              "Save your access key, then click Reload to confirm your access."
            )}
          </p>
          {authFeedback ? (
            <div className="preview-row">
              <Badge variant={authFeedback.tone}>{authFeedback.text}</Badge>
            </div>
          ) : null}
        </section>
      ) : null}

      <div data-tour="content-toolbar">
      <SettingsWorkspaceToolbar
        actionLabel={presentation?.actionLabel ?? t("configAdmin.create.submit", "Add New")}
        actionHint={
          presentation?.actionHint ??
          t(profile.createDescriptionKey, profile.createDescriptionFallback)
        }
        onAction={openCreateDrawer}
        secondaryActionLabel={
          presentation?.secondaryActionLabel ??
          t("configAdmin.categories.manage", "Manage Categories")
        }
        onSecondaryAction={() => void openCategoryDrawer()}
        searchLabel={t("configAdmin.search.label", "Search Items")}
        searchPlaceholder={t("configAdmin.search.placeholder", "Search by title or internal name")}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filters={filterItems}
        activeFilter={activeFilter}
        onFilterChange={(id) => setActiveFilter(id as TableFilter)}
        filterAriaLabel={t("configAdmin.filter.aria", "Item filters")}
        categoryFilter={categoryFilter}
      />
      </div>

      {workflowFeedback ? (
        <div className="settings-workspace__feedback">
          <Badge variant={workflowFeedback.tone}>{workflowFeedback.text}</Badge>
        </div>
      ) : null}

      {docs.length === 0 ? (
        <EmptyState
          title={presentation?.emptyTitle ?? t("configAdmin.manage.emptyTitle", "No Items Yet")}
          description={
            presentation?.emptyDescription ??
            t(
              "configAdmin.manage.emptyDescription",
              "Create your first item to start managing this section."
            )
          }
          action={
            <Button onClick={openCreateDrawer}>
              {presentation?.actionLabel ?? t("configAdmin.create.submit", "Add New")}
            </Button>
          }
        />
      ) : (
        <section className="settings-workspace__table-shell" data-tour="content-table">
          <div className="settings-workspace__table-header">
            <div>
              <h3 className="settings-workspace__table-title">
                {presentation?.tableTitle ?? t("configAdmin.manage.title", "Review And Publish Changes")}
              </h3>
              <p className="settings-workspace__table-description">
                {presentation?.tableDescription ??
                  t(
                    "configAdmin.manage.description",
                    "Open any item to preview it, update the draft, publish changes, or move it to trash."
                  )}
              </p>
            </div>
          </div>
          <Table
            wrapperClassName="config-table-wrap"
            tableClassName={`config-table ${namespace === "content" ? "config-table--has-category" : ""}`}
            rowClassName={(row) =>
              row.key === selectedKey
                ? "config-table__row config-table__row--selected"
                : "config-table__row"
            }
            emptyMessage={t(
              "configAdmin.table.emptyFiltered",
              "No items match your current search or filter."
            )}
            columns={[
              {
                key: "title",
                header: t("configAdmin.table.key", "Item"),
                render: (value: unknown, row: Record<string, unknown>) => (
                  <div className="config-table__item">
                    <div className="config-table__title">
                      <span className="config-table__title-text">{String(value)}</span>
                      <span className="config-table__title-key">{String(row.key)}</span>
                    </div>
                  </div>
                )
              },
              ...(namespace === "content"
                ? [
                    {
                      key: "category",
                      header: t("configAdmin.table.category", "Category"),
                      render: (_value: unknown, row: Record<string, unknown>) => {
                        const catMeta = getContentCategory(String(row.key), String(row.type));
                        return (
                          <div className="config-table__category">
                            <Badge variant={catMeta.badgeVariant}>
                              {catMeta.label}
                            </Badge>
                          </div>
                        );
                      }
                    }
                  ]
                : []),
              {
                key: "status",
                header: t("configAdmin.table.status", "Status"),
                render: (value: unknown, row: Record<string, unknown>) => (
                  <div className="config-table__status">
                    <Badge variant={getVisibilityVariant(row.active === true)}>
                      {String(value)}
                    </Badge>
                  </div>
                )
              },
              {
                key: "draft",
                header: t("configAdmin.table.draft", "Draft"),
                render: (value: unknown) => <span className="config-table__version">{String(value)}</span>
              },
              {
                key: "published",
                header: t("configAdmin.table.published", "Live"),
                render: (value: unknown) => <span className="config-table__version">{String(value)}</span>
              },
              {
                key: "actions",
                header: t("configAdmin.table.actions", "Actions"),
                render: (_value: unknown, row: Record<string, unknown>) => (
                  <div className="config-table__action-rail">
                    <IconActionButton
                      icon={<PreviewIcon />}
                      label={t("configAdmin.table.preview", "Preview")}
                      tone="neutral"
                      onClick={() => void openPreview(String(row.key))}
                    />
                    <IconActionButton
                      icon={<EditIcon />}
                      label={t("configAdmin.table.edit", "Edit")}
                      tone="primary"
                      onClick={() => void openEditDrawer(String(row.key))}
                    />
                    <IconActionButton
                      icon={row.active ? <TrashIcon /> : <RestoreIcon />}
                      label={
                        row.active
                          ? t("configAdmin.table.trash", "Move To Trash")
                          : t("configAdmin.table.restore", "Restore")
                      }
                      tone={row.active ? "danger" : "success"}
                      loading={
                        activeWorkflowAction === "archive" && selectedKey === String(row.key)
                      }
                      onClick={() => requestTrashOrRestore(String(row.key))}
                    />
                  </div>
                )
              }
            ] as Array<TableColumn<Record<string, unknown>>>}
            rows={filteredDocs.map((item) => ({
              key: item.document.key,
              title: item.document.title,
              type: item.document.type,
              category: getContentCategory(item.document.key, item.document.type).label,
              status: getVisibilityLabel(item.document.isActive),
              draft: item.draft ? `v${item.draft.versionNumber}` : "-",
              published: item.published ? `v${item.published.versionNumber}` : "-",
              active: item.document.isActive,
              actions: item.document.key
            }))}
          />
        </section>
      )}

      <CategoryManagementDrawer
        open={categoryDrawerOpen}
        namespaceLabel={t(profile.guideTitleKey, profile.guideTitleFallback)}
        title={t("configAdmin.categories.drawerTitle", `Manage ${getCategoryDocumentTitle()}`)}
        description={t(
          "configAdmin.categories.drawerDescription",
          "Update the category list used to build internal names in this tab."
        )}
        helperText={t(
          "configAdmin.categories.drawerHelper",
          "Keep this list clean and consistent. People will choose from these categories instead of typing them manually."
        )}
        items={categoryItems}
        feedback={categoryFeedback}
        onAddCategory={addCategoryItem}
        onLabelChange={(id, value) => {
          updateCategoryItem(id, (item) => ({ ...item, label: value }));
        }}
        onValueChange={(id, value) => {
          updateCategoryItem(id, (item) => ({ ...item, value: normalizeCategoryValue(value) }));
        }}
        onToggleEnabled={(id) => {
          updateCategoryItem(id, (item) => ({ ...item, enabled: !item.enabled }));
        }}
        onReorder={reorderCategoryItem}
        onClose={closeCategoryDrawer}
        onSaveDraft={() => void saveCategoryDraft()}
        onPublish={() => void publishCategoryChanges()}
        savingDraft={activeWorkflowAction === "categorySaveDraft"}
        publishing={activeWorkflowAction === "categoryPublish"}
      />

      <ConfigEditorDrawer
        open={editorMode === "create"}
        mode="create"
        namespace={namespace}
        existingModules={existingModules}
        namespaceLabel={t(profile.guideTitleKey, profile.guideTitleFallback)}
        title={t(profile.createTitleKey, profile.createTitleFallback)}
        description={t(
          "configAdmin.drawer.create.description",
          "Add a new item without leaving the table. You can review and publish it after saving."
        )}
        keyLabel={t("configAdmin.create.keyLabel", "Internal Name")}
        keyValue={assembledCreateKey}
        keyPlaceholder={profile.keyPlaceholder}
        onKeyChange={() => undefined}
        keyField={
          <GuidedInternalNameBuilder
            label={t("configAdmin.create.keyLabel", "Internal Name")}
            namespace={resolveKeyRoot(namespace, categoryInput)}
            categoryLabel={t("configAdmin.create.categoryLabel", "Category")}
            categoryValue={categoryInput}
            categoryOptions={categoryOptions}
            categoryPlaceholder={t("configAdmin.create.categoryPlaceholder", "Choose a category")}
            slugLabel={t("configAdmin.create.slugLabel", "Slug")}
            slugValue={slugInput}
            slugPlaceholder={profile.slugPlaceholder}
            onCategoryChange={setCategoryInput}
            onSlugChange={(value) => setSlugInput(normalizeSlug(value))}
            helperNote={t(
              "configAdmin.create.keyHelper",
              "This is the system name used to organize this item. We build most of it for you to keep it consistent."
            )}
            examples={profile.namingExamples}
            previewLabel={t("configAdmin.create.previewLabel", "Full internal name")}
            previewValue={assembledCreateKey}
            notice={createBuilderNotice}
            slugHint={t(
              "configAdmin.create.slugHint",
              "Use lowercase letters, numbers, dots, dashes, or underscores."
            )}
            isLessonMode={categoryInput === "lesson"}
            lessonNumberValue={lessonNumberInput}
            onLessonNumberChange={setLessonNumberInput}
            automatedSlugPreview={activeSlug}
          />
        }
        titleLabel={t("configAdmin.create.titleLabel", "Display Title")}
        titleValue={titleInput}
        titlePlaceholder={t("configAdmin.create.titlePlaceholder", "Title people will recognize")}
        onTitleChange={setTitleInput}
        payloadLabel={t("configAdmin.create.payloadLabel", "Content Details (JSON)")}
        payloadValue={payloadInput}
        payloadPlaceholder={profile.payloadPlaceholder}
        payloadHint={t(
          "configAdmin.drawer.payloadHint",
          "Use a starter option below if you want a safe structure to begin with."
        )}
        onPayloadChange={setPayloadInput}
        feedback={editorMode === "create" ? workflowFeedback : null}
        templates={profile.templates.map((template) => ({
          id: template.id,
          label: t(template.labelKey, template.labelFallback)
        }))}
        onTemplateSelect={applyTemplate}
        saving={activeWorkflowAction === "create"}
        primaryActionLabel={t("configAdmin.create.submit", "Save New Item")}
        primaryActionDisabled={!isCreateKeyValid}
        onPrimaryAction={() => void createDocument()}
        onClose={closeEditor}
      />

      <ConfigEditorDrawer
        open={editorMode === "edit"}
        mode="edit"
        namespace={namespace}
        existingModules={existingModules}
        namespaceLabel={t(profile.guideTitleKey, profile.guideTitleFallback)}
        title={t("configAdmin.drawer.edit.title", "Edit Draft")}
        description={t(
          "configAdmin.drawer.edit.description",
          "Update the selected item, save a draft, publish it live, or restore a previous version."
        )}
        keyLabel={t("configAdmin.manage.keyLabel", "Selected Item")}
        keyValue={keyInput}
        keyPlaceholder={profile.keyPlaceholder}
        onKeyChange={setKeyInput}
        keyReadOnly
        payloadLabel={t("configAdmin.manage.payloadLabel", "Draft Details (JSON)")}
        payloadValue={payloadInput}
        payloadPlaceholder={profile.payloadPlaceholder}
        payloadHint={t(
          "configAdmin.drawer.edit.hint",
          "Save your draft whenever you want to keep work in progress before publishing."
        )}
        onPayloadChange={setPayloadInput}
        feedback={editorMode === "edit" ? workflowFeedback : null}
        templates={profile.templates.map((template) => ({
          id: template.id,
          label: t(template.labelKey, template.labelFallback)
        }))}
        onTemplateSelect={applyTemplate}
        saving={activeWorkflowAction === "saveDraft"}
        primaryActionLabel={t("configAdmin.manage.updateDraft", "Save Draft")}
        onPrimaryAction={() => void updateDraft()}
        secondaryActions={
          <div style={{ display: "flex", gap: "var(--space-4)", marginLeft: "var(--space-3)", alignItems: "center" }}>
            <button
              type="button"
              disabled={activeWorkflowAction === "publish"}
              onClick={() => void publish()}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", opacity: activeWorkflowAction === "publish" ? 0.5 : 1, padding: "var(--space-1)" }}
              title={t("configAdmin.manage.publish", "Publish Live")}
            >
              <span style={{ fontSize: "var(--font-size-lg)" }}>🚀</span>
              <span style={{ fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)", color: "var(--color-gray-600)", fontWeight: 500 }}>Publish</span>
            </button>
            <button
              type="button"
              disabled={activeWorkflowAction === "history"}
              onClick={() => void loadHistory()}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", opacity: activeWorkflowAction === "history" ? 0.5 : 1, padding: "var(--space-1)" }}
              title={t("configAdmin.manage.loadHistory", "View History")}
            >
              <span style={{ fontSize: "var(--font-size-lg)" }}>🕒</span>
              <span style={{ fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)", color: "var(--color-gray-600)", fontWeight: 500 }}>History</span>
            </button>
            <button
              type="button"
              disabled={activeWorkflowAction === "rollback"}
              onClick={() => void rollback()}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", opacity: activeWorkflowAction === "rollback" ? 0.5 : 1, padding: "var(--space-1)" }}
              title={t("configAdmin.manage.rollback", "Restore Previous")}
            >
              <span style={{ fontSize: "var(--font-size-lg)" }}>⏪</span>
              <span style={{ fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)", color: "var(--color-gray-600)", fontWeight: 500 }}>Restore</span>
            </button>
            <button
              type="button"
              disabled={activeWorkflowAction === "archive"}
              onClick={() => requestTrashOrRestore(selectedKey)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", opacity: activeWorkflowAction === "archive" ? 0.5 : 1, padding: "var(--space-1)" }}
              title={selectedDocumentRow?.document.isActive === false ? t("configAdmin.manage.restore", "Restore") : t("configAdmin.manage.archive", "Move To Trash")}
            >
              <span style={{ fontSize: "var(--font-size-lg)" }}>{selectedDocumentRow?.document.isActive === false ? "♻️" : "🗑️"}</span>
              <span style={{ fontSize: "var(--font-size-xs)", marginTop: "var(--space-1)", color: selectedDocumentRow?.document.isActive === false ? "var(--color-brand-600)" : "var(--color-danger)", fontWeight: 500 }}>
                {selectedDocumentRow?.document.isActive === false ? "Restore" : "Trash"}
              </span>
            </button>
          </div>
        }
        onClose={closeEditor}
      />

      <ConfigPreviewDrawer
        open={Boolean(previewKey)}
        loading={previewLoading}
        error={previewError}
        detail={previewDetail}
        history={previewHistory}
        title={
          previewDetail?.document.title ?? t("configAdmin.preview.title", "Preview Item Details")
        }
        description={t(
          "configAdmin.preview.description",
          "Review the current item details before editing, restoring, or moving it to trash."
        )}
        closeLabel={t("configAdmin.preview.close", "Close")}
        historyLabel={t("configAdmin.preview.history", "View History")}
        editLabel={t("configAdmin.preview.edit", "Edit")}
        trashLabel={t("configAdmin.preview.trash", "Move To Trash")}
        restoreLabel={t("configAdmin.preview.restore", "Restore")}
        onClose={closePreview}
        onHistory={() => {
          if (previewKey) {
            void loadHistory(previewKey);
          }
        }}
        onEdit={() => {
          if (previewKey) {
            closePreview();
            void openEditDrawer(previewKey, previewDetail);
          }
        }}
        onTrashOrRestore={() => {
          if (previewKey) {
            requestTrashOrRestore(previewKey);
          }
        }}
        trashLoading={activeWorkflowAction === "archive" && selectedKey === previewKey}
        formatPayload={formatPayload}
        getStatusLabel={getPreviewStatusLabel}
        getTypeFieldLabel={getDocumentTypeFieldLabel}
        getTypeLabel={getDocumentTypeLabel}
      />

      <ConfirmationModal
        open={Boolean(trashTarget)}
        title={t("configAdmin.trash.title", "Move Item To Trash?")}
        description={t(
          "configAdmin.trash.description",
          "This will remove the item from active use. You can restore it later from the same table."
        )}
        confirmLabel={t("configAdmin.trash.confirm", "Move To Trash")}
        cancelLabel={t("configAdmin.trash.cancel", "Cancel")}
        tone="danger"
        loading={activeWorkflowAction === "archive" && Boolean(trashTarget)}
        confirmHint={t(
          "configAdmin.trash.hint",
          "Version history stays available, so nothing is permanently lost."
        )}
        onCancel={() => {
          if (activeWorkflowAction !== "archive") {
            setTrashTarget(null);
          }
        }}
        onConfirm={() => {
          if (trashTarget) {
            void archive(trashTarget.document.key);
          }
        }}
      />

      <ConfirmationModal
        open={purgeTrashOpen}
        title={t("configAdmin.purgeTrash.title", "Permanently Delete All Trash?")}
        description={t(
          "configAdmin.purgeTrash.description",
          `You are about to permanently delete all ${trashCount} trashed item(s) in this workspace. This cannot be undone - there is no way to recover them after this action.`
        )}
        confirmLabel={t("configAdmin.purgeTrash.confirm", "Yes, Delete Forever")}
        cancelLabel={t("configAdmin.purgeTrash.cancel", "Cancel")}
        tone="danger"
        loading={isPurgingTrash}
        confirmHint={t(
          "configAdmin.purgeTrash.hint",
          "⚠ This action is permanent and irreversible. All version history for these items will also be destroyed."
        )}
        onCancel={() => {
          if (!isPurgingTrash) {
            setPurgeTrashOpen(false);
          }
        }}
        onConfirm={() => void purgeTrash()}
      />
    </section>
  );
}
