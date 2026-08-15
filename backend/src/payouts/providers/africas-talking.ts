import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";
import { isRetryableStatus } from "./contracts.js";

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
    // AT's airtime contract (verified live against the sandbox 2026-08-15):
    // recipients entries carry ONE combined `amount` string ("NGN 100"), the
    // format the official SDKs compose. Separate currencyCode/amount fields
    // make the gateway reject the request with a misleading HTTP 415.
    const body = new URLSearchParams({
      username: creds.username,
      recipients: JSON.stringify([
        {
          phoneNumber: reward.learnerPhone,
          amount: `${config.defaults.currency} ${reward.amount}`
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
          retryable: isRetryableStatus(response.status)
        } satisfies DispatchResult;
      }
      const data = (await response.json()) as {
        errorMessage?: string;
        responses?: Array<{
          status?: string;
          requestId?: string;
          transactionId?: string;
          errorMessage?: string;
        }>;
      };
      const first = data.responses?.[0];
      if (!first) {
        // Request-level rejection: AT answers 201 with responses:[] and the
        // reason in the top-level errorMessage (e.g. "Airtime is not enabled
        // for this account"). That is an account/product problem retrying
        // cannot fix, so park the reward with the real reason.
        const requestError =
          data.errorMessage && data.errorMessage !== "None" ? data.errorMessage : null;
        if (requestError) {
          return { ok: false, reason: requestError, retryable: false };
        }
        return { ok: false, reason: "Empty responses[] from provider", retryable: true };
      }
      // Successful sends carry `requestId` (ATQid_...); older docs called it
      // transactionId, so accept either.
      const providerTxnId = first.requestId ?? first.transactionId;
      if (first.status === "Sent" && providerTxnId) {
        return { ok: true, providerTxnId, issuedAt: new Date() };
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
