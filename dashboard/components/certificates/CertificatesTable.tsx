"use client";

import type { ReactNode } from "react";
import { Badge, Button } from "../ui";
import { certificateVerifyUrl, type CertificateRow } from "../../lib/admin/certificates";

export type CertificatesTableProps = {
  certificates: CertificateRow[];
  loading?: boolean;
  busyId?: string | null;
  onRename: (row: CertificateRow) => void;
  onRevoke: (row: CertificateRow) => void;
  onUnrevoke: (row: CertificateRow) => void;
  onResend: (row: CertificateRow) => void;
  emptyState?: ReactNode;
};

const SKELETON_ROW_COUNT = 4;

function formatIssued(value: string): string {
  // Fixed to UTC so the date on this table cannot disagree by a day with the
  // date printed on the certificate itself, which is rendered the same way.
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function DefaultEmptyState() {
  return (
    <div className="certificates-table__empty">
      <p className="certificates-table__empty-title">No certificates issued yet</p>
      <p className="certificates-table__empty-body">
        A certificate is issued automatically when a learner completes every module. If the
        template is published with <code>enabled: false</code>, none will be issued yet.
      </p>
    </div>
  );
}

export function CertificatesTable({
  certificates,
  loading = false,
  busyId = null,
  onRename,
  onRevoke,
  onUnrevoke,
  onResend,
  emptyState
}: CertificatesTableProps) {
  if (loading) {
    return (
      <div className="certificates-table" aria-busy="true">
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
          <div key={index} className="certificates-table__skeleton-row" />
        ))}
      </div>
    );
  }

  if (certificates.length === 0) {
    return <div className="certificates-table">{emptyState ?? <DefaultEmptyState />}</div>;
  }

  return (
    <div className="certificates-table">
      <table className="certificates-table__table">
        <caption className="certificates-table__caption">
          Certificates issued to learners who completed every module
        </caption>
        <thead>
          <tr>
            <th scope="col">Printed name</th>
            <th scope="col">Programme</th>
            <th scope="col">Issued</th>
            <th scope="col">Status</th>
            <th scope="col">Verify</th>
            <th scope="col">
              <span className="certificates-table__sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {certificates.map((row) => {
            const revoked = Boolean(row.revokedAt);
            const busy = busyId === row.id;
            return (
              <tr key={row.id} className={revoked ? "certificates-table__row--revoked" : undefined}>
                <td className="certificates-table__name">{row.learnerName}</td>
                <td>{row.programmeName}</td>
                <td>{formatIssued(row.issuedAt)}</td>
                <td>
                  <Badge variant={revoked ? "danger" : "success"}>
                    {revoked ? "Revoked" : "Issued"}
                  </Badge>
                  {revoked && row.revokedReason ? (
                    <span className="certificates-table__reason">{row.revokedReason}</span>
                  ) : null}
                </td>
                <td>
                  <a
                    className="certificates-table__link"
                    href={certificateVerifyUrl(row.publicId)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open page
                  </a>
                </td>
                <td className="certificates-table__actions">
                  <Button variant="ghost" onClick={() => onRename(row)} disabled={busy}>
                    Edit name
                  </Button>
                  <Button variant="secondary" onClick={() => onResend(row)} loading={busy}>
                    Resend
                  </Button>
                  {revoked ? (
                    <Button variant="secondary" onClick={() => onUnrevoke(row)} disabled={busy}>
                      Restore
                    </Button>
                  ) : (
                    <Button variant="danger" onClick={() => onRevoke(row)} disabled={busy}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
