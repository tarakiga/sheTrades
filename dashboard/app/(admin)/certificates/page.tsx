"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CertificatesTable } from "../../../components/certificates/CertificatesTable";
import { IssuingSwitchCard } from "../../../components/certificates/IssuingSwitchCard";
import { Button, ConfirmationModal, Input, SectionHeader } from "../../../components/ui";
import {
  listCertificates,
  renameCertificate,
  resendCertificate,
  revokeCertificate,
  unrevokeCertificate,
  type CertificateRow
} from "../../../lib/admin/certificates";

type StatusFilter = "all" | "issued" | "revoked";

export default function CertificatesPage() {
  const [rows, setRows] = useState<CertificateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [renaming, setRenaming] = useState<CertificateRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [revoking, setRevoking] = useState<CertificateRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await listCertificates({
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(status === "all" ? {} : { status })
      });
      setRows(response.items);
      setTotal(response.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function withBusy(id: string, work: () => Promise<string>) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      setNotice(await work());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="admin-dashboard-page certificates-page">
      <SectionHeader
        title="Certificates"
        description={`${total} issued. A certificate is created automatically when a learner completes every module.`}
        actions={
          <Link className="certificates-page__design-link" href="/certificates/template">
            Edit the design
          </Link>
        }
      />

      <IssuingSwitchCard onChange={() => void load()} />

      <div className="certificates-page__toolbar">
        <Input
          id="certificates-search"
          label="Search by printed name"
          value={search}
          placeholder="e.g. Adaeze"
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="certificates-page__filters" role="group" aria-label="Filter by status">
          {(["all", "issued", "revoked"] as const).map((option) => (
            <Button
              key={option}
              variant={status === option ? "primary" : "ghost"}
              onClick={() => setStatus(option)}
            >
              {option === "all" ? "All" : option === "issued" ? "Issued" : "Revoked"}
            </Button>
          ))}
        </div>
      </div>

      {error ? <p className="certificates-page__error">{error}</p> : null}
      {notice ? <p className="certificates-page__notice">{notice}</p> : null}

      <CertificatesTable
        certificates={rows}
        loading={loading}
        busyId={busyId}
        onRename={(row) => {
          setRenaming(row);
          setRenameValue(row.learnerName);
        }}
        onRevoke={(row) => {
          setRevoking(row);
          setRevokeReason("");
        }}
        onUnrevoke={(row) =>
          withBusy(row.id, async () => {
            await unrevokeCertificate(row.id);
            return `${row.learnerName}'s certificate is valid again.`;
          })
        }
        onResend={(row) =>
          withBusy(row.id, async () => {
            await resendCertificate(row.id);
            return `Sent again to ${row.learnerName}.`;
          })
        }
      />

      <ConfirmationModal
        open={Boolean(renaming)}
        title="Change the printed name"
        description="This is the name shown on the certificate and on its public page. The verify link does not change, so a link the learner has already shared keeps working."
        confirmLabel="Save name"
        loading={busyId === renaming?.id}
        onCancel={() => setRenaming(null)}
        onConfirm={() => {
          const row = renaming;
          if (!row) return;
          setRenaming(null);
          void withBusy(row.id, async () => {
            await renameCertificate(row.id, renameValue);
            return "Name updated.";
          });
        }}
        confirmHint={
          <Input
            id="certificate-rename"
            label="Name as it should be printed"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
        }
      />

      <ConfirmationModal
        open={Boolean(revoking)}
        title="Revoke this certificate?"
        description="Anyone opening its public page will be told plainly that it is no longer valid. The learner keeps the image she was sent, so revoke only when the certificate should not have been issued. This can be undone."
        confirmLabel="Revoke"
        tone="danger"
        loading={busyId === revoking?.id}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          const row = revoking;
          if (!row) return;
          setRevoking(null);
          void withBusy(row.id, async () => {
            await revokeCertificate(row.id, revokeReason);
            return `${row.learnerName}'s certificate is revoked.`;
          });
        }}
        confirmHint={
          <Input
            id="certificate-revoke-reason"
            label="Why is it being revoked? (kept internal)"
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
          />
        }
      />
    </main>
  );
}
