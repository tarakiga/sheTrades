export type IntegrationProviderId = "whatsapp" | "notification";

export type IntegrationStatus = "draft_ready" | "live" | "hidden" | "missing";

export type IntegrationConnectionResult = {
  provider: "meta_whatsapp_cloud" | "smtp";
  status: "connected" | "failed" | "invalid";
  summary: string;
  details?: string;
  testedAt: string;
};

export type IntegrationVersion = {
  id: string;
  versionNumber: number;
  state: "draft" | "published" | "archived";
  payload?: Record<string, unknown>;
  publishedAt?: string;
  publishedBy?: string;
  createdAt?: string;
  createdBy?: string;
};

export type IntegrationDocumentDetail = {
  document: {
    id: string;
    key: string;
    type: "integration_config";
    title: string;
    updatedAt: string;
    updatedBy?: string;
    isActive: boolean;
    namespace?: "integration";
  };
  draft: IntegrationVersion | null;
  published: IntegrationVersion | null;
};

export type IntegrationHistoryResponse = {
  versions: Array<IntegrationVersion>;
};

export type WhatsAppIntegrationForm = {
  title: string;
  provider: "meta_whatsapp_cloud";
  enabled: boolean;
  verifyToken: string;
  accessToken: string;
  appSecret: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookPath: string;
  apiVersion: string;
  notes: string;
};

export type NotificationIntegrationForm = {
  title: string;
  provider: "smtp";
  enabled: boolean;
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  notes: string;
};

export type IntegrationFormState = WhatsAppIntegrationForm | NotificationIntegrationForm;

export function createEmptyWhatsAppForm(): WhatsAppIntegrationForm {
  return {
    title: "Primary WhatsApp Integration",
    provider: "meta_whatsapp_cloud",
    enabled: true,
    verifyToken: "",
    accessToken: "",
    appSecret: "",
    phoneNumberId: "",
    businessAccountId: "",
    webhookPath: "/webhook/whatsapp",
    apiVersion: "v23.0",
    notes: ""
  };
}

export function createEmptyNotificationForm(): NotificationIntegrationForm {
  return {
    title: "Primary SMTP Notification Integration",
    provider: "smtp",
    enabled: true,
    host: "",
    port: "587",
    secure: false,
    username: "",
    password: "",
    fromName: "SheTrades",
    fromEmail: "",
    replyToEmail: "",
    notes: ""
  };
}

export function isWhatsAppForm(value: IntegrationFormState): value is WhatsAppIntegrationForm {
  return value.provider === "meta_whatsapp_cloud";
}

export function maskSecret(value: string) {
  if (!value.trim()) {
    return "Not set";
  }
  if (value.length <= 8) {
    return "********";
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
