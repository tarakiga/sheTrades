/**
 * Client for the admin certificate endpoints.
 *
 * Note what the list does NOT carry: no phone number. The backend enforces
 * that with its Prisma select, and nothing here should be tempted to ask for
 * more - an operator needs to know whose certificate this is and whether it is
 * valid, and that is all.
 */
import { ADMIN_API_BASE_URL, fetchAdminAuthJson } from "../admin-auth";

export type CertificateRow = {
  id: string;
  publicId: string;
  userId: string;
  learnerName: string;
  programmeName: string;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
};

export type CertificateListParams = {
  search?: string;
  status?: "issued" | "revoked";
  page?: number;
  pageSize?: number;
};

export type CertificateListResponse = {
  items: CertificateRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * The verify page is served by the BACKEND, not this dashboard, so the link
 * has to be built against the API base rather than a relative path.
 */
export function certificateVerifyUrl(publicId: string): string {
  return `${ADMIN_API_BASE_URL.replace(/\/+$/, "")}/c/${encodeURIComponent(publicId)}`;
}

export function listCertificates(
  params: CertificateListParams = {}
): Promise<CertificateListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchAdminAuthJson<CertificateListResponse>(`/api/admin/certificates${suffix}`);
}

export function renameCertificate(
  id: string,
  learnerName: string
): Promise<{ certificate: CertificateRow }> {
  return fetchAdminAuthJson<{ certificate: CertificateRow }>(
    `/api/admin/certificates/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ learnerName }) }
  );
}

export function revokeCertificate(
  id: string,
  reason: string
): Promise<{ certificate: CertificateRow }> {
  return fetchAdminAuthJson<{ certificate: CertificateRow }>(
    `/api/admin/certificates/${encodeURIComponent(id)}/revoke`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

export function unrevokeCertificate(id: string): Promise<{ certificate: CertificateRow }> {
  return fetchAdminAuthJson<{ certificate: CertificateRow }>(
    `/api/admin/certificates/${encodeURIComponent(id)}/unrevoke`,
    { method: "POST", body: "{}" }
  );
}

export function resendCertificate(id: string): Promise<{ message: string }> {
  return fetchAdminAuthJson<{ message: string }>(
    `/api/admin/certificates/${encodeURIComponent(id)}/resend`,
    { method: "POST", body: "{}" }
  );
}
