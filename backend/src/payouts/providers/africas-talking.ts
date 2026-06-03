import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";

const SANDBOX_BASE = "https://api.sandbox.africastalking.com/version1";
const PROD_BASE = "https://api.africastalking.com/version1";
const USER_BASE_SANDBOX = "https://api.sandbox.africastalking.com/version1/user";
const USER_BASE_PROD = "https://api.africastalking.com/version1/user";

function pickBases(sandbox: boolean) {
  return sandbox
    ? { airtime: `${SANDBOX_BASE}/airtime/send`, user: USER_BASE_SANDBOX }
    : { airtime: `${PROD_BASE}/airtime/send`, user: USER_BASE_PROD };
}

function requireAfricasTalkingConfig(config: PayoutsIntegrationPayload) {
  if (config.provider !== "africas_talking") {
    throw new Error("africasTalkingAdapter received a non-AT config");
  }
  return config.africasTalking;
}

export const africasTalkingAdapter: PayoutProvider = {
  key: "africas_talking",

  async verifyCredentials(config) {
    const creds = requireAfricasTalkingConfig(config);
    const bases = pickBases(config.sandbox);
    const url = `${bases.user}?username=${encodeURIComponent(creds.username)}`;
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { apiKey: creds.apiKey, Accept: "application/json" }
      });
      const latencyMs = Date.now() - started;
      if (response.ok) {
        return { status: "healthy", latencyMs, message: "Account reachable" };
      }
      return { status: "failed", message: `Account check returned HTTP ${response.status}` };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  },

  async dispatch(reward, config) {
    const creds = requireAfricasTalkingConfig(config);
    const bases = pickBases(config.sandbox);
    const body = new URLSearchParams({
      username: creds.username,
      recipients: JSON.stringify([
        {
          phoneNumber: reward.learnerPhone,
          currencyCode: config.defaults.currency,
          amount: reward.amount
        }
      ])
    });
    try {
      const response = await fetch(bases.airtime, {
        method: "POST",
        headers: {
          apiKey: creds.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: body.toString()
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: `Africa's Talking returned HTTP ${response.status}`,
          retryable: response.status >= 500 || response.status === 429
        } satisfies DispatchResult;
      }
      const data = (await response.json()) as {
        responses?: Array<{ status?: string; transactionId?: string; errorMessage?: string }>;
      };
      const first = data.responses?.[0];
      if (!first) {
        return { ok: false, reason: "Empty responses[] from provider", retryable: true };
      }
      if (first.status === "Sent" && first.transactionId) {
        return { ok: true, providerTxnId: first.transactionId, issuedAt: new Date() };
      }
      return {
        ok: false,
        reason: `${first.status ?? "UnknownStatus"} ${first.errorMessage ?? ""}`.trim(),
        retryable: false
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        retryable: true
      };
    }
  }
};
