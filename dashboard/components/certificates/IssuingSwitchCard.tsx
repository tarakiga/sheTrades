"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ConfirmationModal } from "../ui";
import { getTemplateStatus, setTemplateEnabled, type TemplateStatus } from "../../lib/admin/certificates";

/**
 * The switch that starts and stops issuing.
 *
 * It lives at the top of the Certificates page rather than in Settings because
 * whoever is deciding this is already looking at what has been issued. Turning
 * it ON is confirmed, because the next learner to finish gets a permanent,
 * publicly shareable credential and there is no un-sending a WhatsApp message.
 */
export function IssuingSwitchCard({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<TemplateStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmOn, setConfirmOn] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getTemplateStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      await setTemplateEnabled(enabled);
      await load();
      onChange?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setConfirmOn(false);
    }
  }

  if (!status) {
    return (
      <Card title="Issuing" description="Checking whether certificates are being issued...">
        <div className="issuing-switch__placeholder" />
      </Card>
    );
  }

  if (!status.published) {
    return (
      <Card
        title="Issuing"
        description="No certificate template has been published yet, so nothing can be issued."
      >
        <p className="issuing-switch__hint">
          Run the certificate template seed, then publish the document, before switching issuing on.
        </p>
      </Card>
    );
  }

  if (!status.valid) {
    return (
      <Card
        title="Issuing"
        description="The published template does not match the expected shape."
      >
        <p className="issuing-switch__hint">
          It cannot be switched on safely until that is corrected, because the renderer would not
          know where to place the learner&apos;s name.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Issuing"
      description="When this is on, a learner who completes every module is sent her certificate automatically."
    >
      <div className="issuing-switch">
        <div className="issuing-switch__state">
          <Badge variant={status.enabled ? "success" : "warning"}>
            {status.enabled ? "On" : "Off"}
          </Badge>
          <span className="issuing-switch__meta">
            {status.programmeName} &middot; issued by {status.issuerName} &middot; template v
            {status.version}
          </span>
        </div>

        {error ? <p className="issuing-switch__error">{error}</p> : null}

        <div className="issuing-switch__actions">
          {status.enabled ? (
            <Button variant="secondary" onClick={() => void apply(false)} loading={busy}>
              Stop issuing
            </Button>
          ) : (
            <Button onClick={() => setConfirmOn(true)} loading={busy}>
              Start issuing
            </Button>
          )}
        </div>

        <p className="issuing-switch__hint">
          {status.enabled
            ? "Turning this off stops new certificates. Ones already issued stay valid and their links keep working."
            : "Nothing is being issued. Learners who have already finished will receive theirs the next time they reach the end of a module."}
        </p>
      </div>

      <ConfirmationModal
        open={confirmOn}
        title="Start issuing certificates?"
        description="The next learner to complete every module will be sent a certificate with her name on it, and a public link anyone can open. A WhatsApp message cannot be recalled, so check the design is signed off first."
        confirmLabel="Start issuing"
        loading={busy}
        onCancel={() => setConfirmOn(false)}
        onConfirm={() => void apply(true)}
      />
    </Card>
  );
}
