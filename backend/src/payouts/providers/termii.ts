import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";
import { isRetryableStatus } from "./contracts.js";

const SANDBOX_BASE = "https://sandbox.termii.com/api";
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
    const base = config.sandbox ? SANDBOX_BASE : PROD_BASE;
    const started = Date.now();
    try {
      const response = await fetch(`${base}/get-balance?api_key=${encodeURIComponent(creds.apiKey)}`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      const latencyMs = Date.now() - started;
      if (!response.ok) {
        return { status: "failed", message: `Termii returned HTTP ${response.status}` };
      }
      const data = (await response.json()) as { balance?: number };
      if (typeof data.balance === "number") {
        return { status: "healthy", latencyMs, message: `Balance: ${data.balance}` };
      }
      return { status: "failed", message: "Termii response missing balance" };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  },

  async dispatch(reward, config) {
    const creds = requireTermiiConfig(config);
    const base = config.sandbox ? SANDBOX_BASE : PROD_BASE;
    try {
      const response = await fetch(`${base}/airtime/send`, {
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
