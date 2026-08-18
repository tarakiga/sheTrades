/**
 * Client for the certificate template authoring API.
 *
 * The types below MIRROR the zod contract in the backend
 * (`backend/src/certificates/contracts.ts`) rather than sharing it. That is a
 * deliberate trade, not an oversight: the two packages have no build-time link
 * today, and wiring one up to share a schema would be a bigger change than the
 * editor itself. The safety net is that the server re-validates every payload
 * on save AND again on preview, so a type that drifts out of date produces a
 * 400 naming the offending field — never a silently corrupt template. If these
 * ever need to stop drifting, `shared/` is the place to put them.
 */
import { ADMIN_API_BASE_URL, fetchAdminAuthJson, getStoredAdminAuthToken } from "../admin-auth";

export type Align = "left" | "center" | "right";
export type DateFormat = "iso" | "long-ordinal";

export type TextFieldBase = {
  id: string;
  x: number;
  y: number;
  maxWidth: number;
  align: Align;
  font: string;
  /** A fraction of canvas HEIGHT, not width. */
  size: number;
  weight: number;
  color: string;
  autoShrink: boolean;
  /** A font metric, not a design choice — see the contract. Usually absent. */
  glyphRatio?: number;
};

export type SimpleTextField = TextFieldBase & {
  variable: "learnerName" | "programmeName" | "certificateId";
};
export type DateField = TextFieldBase & { variable: "issuedDate"; format: DateFormat };
export type BodyTextField = TextFieldBase & {
  variable: "bodyText";
  text: string;
  lineHeight: number;
  maxLines: number;
};
export type TextField = SimpleTextField | DateField | BodyTextField;

export type ImageField = {
  id: string;
  variable: "logo" | "qrCode";
  /** Required for a logo, absent for a QR — that one is generated from the
   * verification URL at render time. */
  assetKey?: string;
  x: number;
  y: number;
  width: number;
  align: Align;
  opacity: number;
};

export type TemplateField = TextField | ImageField;

export type CertificateTemplate = {
  kind: "certificate_template";
  enabled: boolean;
  programmeName: string;
  issuerName: string;
  assetKey: string;
  canvas: { width: number; height: number };
  fields: TemplateField[];
};

export function isImageField(field: TemplateField): field is ImageField {
  return field.variable === "logo" || field.variable === "qrCode";
}

export function isTextField(field: TemplateField): field is TextField {
  return !isImageField(field);
}

/** Human labels for the variables, so the canvas can name a box something an
 * admin recognises rather than showing them `bodyText`. */
export const VARIABLE_LABELS: Record<TemplateField["variable"], string> = {
  learnerName: "Learner name",
  programmeName: "Programme name",
  issuedDate: "Issue date",
  certificateId: "Certificate number",
  bodyText: "Body text",
  logo: "Logo",
  qrCode: "Verification QR"
};

// ------------------------------------------------------------------ assets

export type CertificateAsset = {
  key: string;
  kind: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
};

export function listCertificateAssets(): Promise<{ items: CertificateAsset[] }> {
  return fetchAdminAuthJson<{ items: CertificateAsset[] }>("/api/admin/certificate-assets");
}

/**
 * Uploads a file as a raw body.
 *
 * Not multipart: there is exactly one part, and sending the File itself means
 * the browser sets a Content-Type the server can check against the bytes.
 */
export async function uploadCertificateAsset(input: {
  file: File;
  key: string;
  kind: "background" | "logo";
}): Promise<CertificateAsset> {
  const query = new URLSearchParams({ key: input.key, kind: input.kind });
  const response = await fetch(
    `${ADMIN_API_BASE_URL}/api/admin/certificate-assets?${query.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": input.file.type || "application/octet-stream",
        ...authHeader()
      },
      body: input.file
    }
  );
  return (await readJsonOrThrow(response)) as CertificateAsset;
}

/**
 * Fetches artwork as an object URL.
 *
 * An `<img src>` cannot carry an Authorization header, and these routes are
 * admin-only, so the bytes are fetched with the token and handed to the
 * document as a blob. The caller owns the URL and must revoke it.
 */
export async function fetchAssetObjectUrl(key: string): Promise<string> {
  const response = await fetch(
    `${ADMIN_API_BASE_URL}/api/admin/certificate-assets/${encodeURIComponent(key)}/raw`,
    { headers: authHeader(), cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`Could not load the artwork ${key}.`);
  }
  return URL.createObjectURL(await response.blob());
}

// ---------------------------------------------------------------- template

export type TemplateDraftResponse =
  | { exists: false }
  | {
      exists: true;
      documentId: string;
      draftVersionId: string | null;
      draft: CertificateTemplate | null;
      draftUpdatedAt: string | null;
      published: CertificateTemplate | null;
      publishedVersion: number | null;
      publishedAt: string | null;
    };

export function getTemplateDraft(): Promise<TemplateDraftResponse> {
  return fetchAdminAuthJson<TemplateDraftResponse>("/api/admin/certificates-template/draft");
}

export function saveTemplateDraft(
  payload: CertificateTemplate,
  changeSummary?: string
): Promise<{ draftVersionId: string; versionNumber: number }> {
  return fetchAdminAuthJson<{ draftVersionId: string; versionNumber: number }>(
    "/api/admin/certificates-template/draft",
    {
      method: "PUT",
      body: JSON.stringify({ payload, ...(changeSummary ? { changeSummary } : {}) })
    }
  );
}

export function publishTemplate(
  expectedDraftVersionId: string,
  publishNote?: string
): Promise<{ versionNumber: number }> {
  return fetchAdminAuthJson<{ versionNumber: number }>("/api/admin/certificates-template/publish", {
    method: "POST",
    body: JSON.stringify({ expectedDraftVersionId, ...(publishNote ? { publishNote } : {}) })
  });
}

export type TemplateVersion = {
  id: string;
  versionNumber: number;
  state: string;
  changeSummary: string | null;
  createdAt: string;
  createdBy: string;
  publishedAt: string | null;
  publishedBy: string | null;
};

export function getTemplateHistory(): Promise<{ versions: TemplateVersion[] }> {
  return fetchAdminAuthJson<{ versions: TemplateVersion[] }>(
    "/api/admin/certificates-template/history"
  );
}

export function rollbackTemplate(
  targetVersionId: string,
  rollbackReason?: string
): Promise<{ versionNumber: number }> {
  return fetchAdminAuthJson<{ versionNumber: number }>(
    "/api/admin/certificates-template/rollback",
    {
      method: "POST",
      body: JSON.stringify({ targetVersionId, ...(rollbackReason ? { rollbackReason } : {}) })
    }
  );
}

export function createTemplate(input: {
  assetKey: string;
  programmeName: string;
  issuerName: string;
}): Promise<{ documentId: string; draft: CertificateTemplate }> {
  return fetchAdminAuthJson<{ documentId: string; draft: CertificateTemplate }>(
    "/api/admin/certificates-template",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export type PreviewSample = { id: string; label: string; learnerName: string };

export function getPreviewSamples(): Promise<{ items: PreviewSample[] }> {
  return fetchAdminAuthJson<{ items: PreviewSample[] }>("/api/admin/certificates-template/samples");
}

/**
 * Renders the working payload through the SERVER's pipeline and returns an
 * object URL for the resulting PNG.
 *
 * This is what makes the editor trustworthy. The canvas positions boxes with
 * HTML; certificates are drawn by sharp against fonts installed in the runtime
 * image, with its own metrics and wrapping. Previewing in the browser would
 * mean approving one image and issuing a slightly different one.
 *
 * The caller owns the URL and must revoke it.
 */
export async function renderTemplatePreview(
  payload: CertificateTemplate,
  sampleId?: string
): Promise<string> {
  const response = await fetch(`${ADMIN_API_BASE_URL}/api/admin/certificates-template/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    cache: "no-store",
    body: JSON.stringify({ payload, ...(sampleId ? { sampleId } : {}) })
  });
  if (!response.ok) {
    // A failed preview carries JSON, because the renderer's own message names
    // the missing asset or the malformed field.
    const detail = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => null);
    throw new Error(detail ?? "The preview could not be rendered.");
  }
  return URL.createObjectURL(await response.blob());
}

// ----------------------------------------------------------------- helpers

function authHeader(): Record<string, string> {
  const token = getStoredAdminAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in (body as Record<string, unknown>)
        ? String((body as Record<string, unknown>).message)
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return body;
}
