"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "../ui";

export type TwoFactorCodeCardProps = {
  onSubmit: (code: string) => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  /** When the challenge expires — the form disables itself past this. */
  expiresAt?: string | undefined;
};

/**
 * Second step of sign-in: the code from the authenticator app, or a recovery
 * code if the device is gone.
 *
 * Deliberately accepts both in ONE field rather than making people choose a
 * mode first — the two formats are unambiguous (6 digits vs a longer
 * alphanumeric code), so asking would be pointless friction at exactly the
 * moment someone is already locked out and stressed.
 */
export function TwoFactorCodeCard({
  onSubmit,
  onCancel,
  submitting = false,
  expiresAt
}: TwoFactorCodeCardProps) {
  const [code, setCode] = useState("");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const trimmed = code.trim();
  // A TOTP code is 6 digits; a recovery code is longer. Either is acceptable.
  const looksComplete = /^\d{6}$/.test(trimmed.replace(/\s/g, "")) || trimmed.length >= 10;

  function handleSubmit() {
    if (!looksComplete || submitting || expired) return;
    void onSubmit(trimmed);
  }

  return (
    <div className="two-factor-card">
      <div className="two-factor-card__intro">
        <h2 className="two-factor-card__title">Enter your verification code</h2>
        <p className="two-factor-card__hint">
          Open your authenticator app and enter the current 6-digit code. If you no longer have
          your device, enter one of your recovery codes instead.
        </p>
      </div>

      <Input
        id="two-factor-code"
        // This step exists only to receive a code, so take the caret immediately.
        autoFocus
        label="Verification code"
        value={code}
        inputMode="text"
        autoComplete="one-time-code"
        placeholder="123456"
        disabled={submitting || expired}
        onChange={(event) => setCode(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
          }
        }}
        {...(expired
          ? { error: "This sign-in attempt expired. Go back and enter your password again." }
          : {})}
      />

      <div className="two-factor-card__actions">
        <Button
          onClick={handleSubmit}
          loading={submitting}
          disabled={!looksComplete || expired}
        >
          Verify and sign in
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Back
        </Button>
      </div>
    </div>
  );
}
