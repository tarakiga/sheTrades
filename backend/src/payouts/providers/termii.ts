import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";
import { isRetryableStatus } from "./contracts.js";

// Termii has NO sandbox environment. The previous adapter pointed sandbox
// mode at a fictional host (sandbox.termii.com — does not resolve), so every
// connection test with sandbox enabled failed on DNS before the API key was
// ever checked. Real semantics now:
//   - verifyCredentials always talks to the live API. GET /get-balance is
//     read-only, so it is safe in sandbox mode and actually validates the key.
//   - dispatch in sandbox mode is BLOCKED (non-retryable) — no real airtime
//     can leave the account while the integration is marked sandbox.
// (Termii also serves v3.api.termii.com; api.ng.termii.com remains live and
// both answer the same endpoints, verified 2026-08-15.)
const PROD_BASE = "https://api.ng.termii.com/api";

const RETRYABLE_PROVIDER_CODES = new Set(["service_unavailable", "rate_limited"]);

function requireTermiiConfig(config: PayoutsIntegrationPayload) {
  if (config.provider !== "termii") throw new Error("termiiAdapter received a non-Termii config");
  return config.termii;
}

export const termiiAdapter: PayoutProvider = {
  key: "termii",

  async verifyCredentials(config) {
    const creds = requireTermiiConfig(config);
    const started = Date.now();
    try {
      const response = await fetch(
        `${PROD_BASE}/get-balance?api_key=${encodeURIComponent(creds.apiKey)}`,
        {
          method: "GET",
          headers: { Accept: "application/json" }
        }
      );
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        return { status: "failed", message: `Termii returned HTTP ${response.status}` };
      }
      const data = (await response.json()) as { balance?: number };
      if (typeof data.balance === "number") {
        const sandboxNote = config.sandbox
          ? " (sandbox mode: credentials verified against the live API; airtime dispatches stay blocked)"
          : "";
        return { status: "healthy", latencyMs, message: `Balance: ${data.balance}${sandboxNote}` };
      }
      return { status: "failed", message: "Termii response missing balance" };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  },

  async dispatch(reward, config) {
    const creds = requireTermiiConfig(config);
    if (config.sandbox) {
      // Never send real airtime while the integration is marked sandbox; a
      // non-retryable failure keeps the reward visible as Failed instead of
      // spinning in the payout worker's retry loop.
      return {
        ok: false,
        reason:
          "Sandbox mode: Termii has no sandbox environment, so airtime dispatch is blocked. Disable sandbox on the payouts integration to send real airtime.",
        retryable: false
      } satisfies DispatchResult;
    }
    try {
      const response = await fetch(`${PROD_BASE}/airtime/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          phone_number: reward.learnerPhone,
          api_key: creds.apiKey,
          amount: reward.amount,
          country_code: "NG",
          purchase_code: `reward_${reward.id}_attempt_${reward.retryCount}`
        })
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: `Termii returned HTTP ${response.status}`,
          retryable: isRetryableStatus(response.status)
        } satisfies DispatchResult;
      }
      const data = (await response.json()) as { code?: string; transaction_id?: string; message?: string };
      if (data.code === "ok" && data.transaction_id) {
        return { ok: true, providerTxnId: data.transaction_id, issuedAt: new Date() };
      }
      const reason = `${data.code ?? "UnknownStatus"} ${data.message ?? ""}`.trim();
      const retryable = data.code ? RETRYABLE_PROVIDER_CODES.has(data.code) : false;
      return { ok: false, reason, retryable };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        retryable: true
      };
    }
  }
};
