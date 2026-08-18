"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Badge, Button, Card, ConfirmationModal, Input } from "../ui";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  type TwoFactorStatus
} from "../../lib/admin/two-factor";

/** Group a base32 secret into readable chunks for manual entry. */
function chunk(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}

type Phase = "idle" | "scanning" | "codes";

export function ProfileTwoFactorCard() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [secret, setSecret] = useState("");
  const [qrDataUri, setQrDataUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [disarmOpen, setDisarmOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await getTwoFactorStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleStart() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const setup = await startTwoFactorSetup();
      setSecret(setup.secret);
      // Rendered client-side so the secret never travels to a third-party
      // chart or QR service.
      setQrDataUri(await QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 220 }));
      setPhase("scanning");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      const result = await confirmTwoFactorSetup(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setCode("");
      setSecret("");
      setQrDataUri("");
      setPhase("codes");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError("");
    try {
      await disableTwoFactor(disableCode.trim());
      setDisarmOpen(false);
      setDisableCode("");
      setNotice("Two-factor authentication is off for your account.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    setBusy(true);
    setError("");
    try {
      const result = await regenerateRecoveryCodes();
      setRecoveryCodes(result.recoveryCodes);
      setPhase("codes");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const enabled = status?.enabled ?? false;

  return (
    <Card
      title="Two-factor authentication"
      description="Require a code from your phone in addition to your password. Strongly recommended for accounts that can approve payouts."
    >
      <div className="two-factor-settings">
        <div className="two-factor-settings__status">
          <Badge variant={enabled ? "success" : "warning"}>{enabled ? "On" : "Off"}</Badge>
          {enabled && status ? (
            <span className="two-factor-settings__meta">
              {status.recoveryCodesRemaining} recovery code
              {status.recoveryCodesRemaining === 1 ? "" : "s"} remaining
            </span>
          ) : (
            <span className="two-factor-settings__meta">
              Your account is protected by a password only.
            </span>
          )}
        </div>

        {error ? <p className="two-factor-settings__error">{error}</p> : null}
        {notice ? <p className="two-factor-settings__notice">{notice}</p> : null}

        {/* One-time display of recovery codes. */}
        {phase === "codes" && recoveryCodes.length > 0 ? (
          <div className="two-factor-settings__codes">
            <p className="two-factor-settings__codes-warning">
              Save these now. They are shown once and cannot be retrieved later. Each one works a
              single time, and they are the only way back in if you lose your phone.
            </p>
            <ul className="two-factor-settings__codes-list">
              {recoveryCodes.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
            <div className="two-factor-settings__actions">
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(recoveryCodes.join("\n"));
                  setNotice("Recovery codes copied to your clipboard.");
                }}
              >
                Copy codes
              </Button>
              <Button
                onClick={() => {
                  setRecoveryCodes([]);
                  setPhase("idle");
                }}
              >
                I have saved them
              </Button>
            </div>
          </div>
        ) : null}

        {/* Enrolment: scan, then confirm with a live code. */}
        {phase === "scanning" ? (
          <div className="two-factor-settings__setup">
            <ol className="two-factor-settings__steps">
              <li>
                Open an authenticator app. Google Authenticator, Authy or 1Password all work.
              </li>
              <li>Scan this code, or enter the key by hand if you cannot scan.</li>
              <li>Enter the 6-digit code it shows to confirm.</li>
            </ol>
            {qrDataUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="two-factor-settings__qr"
                src={qrDataUri}
                alt="QR code for setting up two-factor authentication"
                width={220}
                height={220}
              />
            ) : null}
            <p className="two-factor-settings__secret">
              <span className="two-factor-settings__secret-label">Manual key</span>
              <code>{chunk(secret)}</code>
            </p>
            <Input
              id="two-factor-confirm-code"
              label="6-digit code from your app"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              onChange={(event) => setCode(event.target.value)}
            />
            <div className="two-factor-settings__actions">
              <Button onClick={handleConfirm} loading={busy} disabled={code.trim().length < 6}>
                Confirm and turn on
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  // Nothing was activated, so abandoning is safe and complete.
                  setPhase("idle");
                  setSecret("");
                  setQrDataUri("");
                  setCode("");
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "idle" ? (
          <div className="two-factor-settings__actions">
            {enabled ? (
              <>
                <Button variant="secondary" onClick={handleRegenerate} loading={busy}>
                  Generate new recovery codes
                </Button>
                <Button variant="danger" onClick={() => setDisarmOpen(true)} disabled={busy}>
                  Turn off
                </Button>
              </>
            ) : (
              <Button onClick={handleStart} loading={busy}>
                Set up two-factor authentication
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <ConfirmationModal
        open={disarmOpen}
        title="Turn off two-factor authentication?"
        description="Your account will be protected by its password alone. Enter a current code to confirm it is really you."
        confirmLabel="Turn off"
        tone="danger"
        loading={busy}
        onCancel={() => {
          setDisarmOpen(false);
          setDisableCode("");
        }}
        onConfirm={handleDisable}
        confirmHint={
          <Input
            id="two-factor-disable-code"
            label="Current code or recovery code"
            value={disableCode}
            autoComplete="one-time-code"
            onChange={(event) => setDisableCode(event.target.value)}
          />
        }
      />
    </Card>
  );
}
