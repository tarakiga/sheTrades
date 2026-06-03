import type {
  ConnectionResult,
  DispatchResult,
  PayoutProvider,
  PayoutsIntegrationPayload,
  RewardDispatchInput
} from "./contracts.js";
import { isRetryableStatus } from "./contracts.js";

const AUTH_URL = "https://auth.reloadly.com/oauth/token";
const SANDBOX_AUDIENCE = "https://topups-sandbox.reloadly.com";
const PROD_AUDIENCE = "https://topups.reloadly.com";
const DEFAULT_NG_MTN_OPERATOR_ID = 341;

const RETRYABLE_PROVIDER_ERROR_CODES = new Set(["TIMEOUT", "PROVIDER_UNAVAILABLE"]);

function requireReloadlyConfig(config: PayoutsIntegrationPayload) {
  if (config.provider !== "reloadly") throw new Error("reloadlyAdapter received a non-Reloadly config");
  return config.reloadly;
}

async function fetchAccessToken(creds: { clientId: string; clientSecret: string }, audience: string) {
  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "client_credentials",
      audience
    })
  });
  if (!response.ok) {
    throw new Error(`Reloadly auth returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Reloadly auth response missing access_token");
  return data.access_token;
}

export const reloadlyAdapter: PayoutProvider = {
  key: "reloadly",

  async verifyCredentials(config) {
    const creds = requireReloadlyConfig(config);
    const audience = config.sandbox ? SANDBOX_AUDIENCE : PROD_AUDIENCE;
    const started = Date.now();
    try {
      const token = await fetchAccessToken(creds, audience);
      const response = await fetch(`${audience}/accounts/balance`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
      });
      const latencyMs = Date.now() - started;
      if (response.ok) {
        return { status: "healthy", latencyMs, message: "Account reachable" };
      }
      return { status: "failed", message: `Reloadly returned HTTP ${response.status}` };
    } catch (error) {
      return { status: "failed", message: error instanceof Error ? error.message : String(error) };
    }
  },

  async dispatch(reward, config) {
    const creds = requireReloadlyConfig(config);
    const audience = config.sandbox ? SANDBOX_AUDIENCE : PROD_AUDIENCE;
    try {
      const token = await fetchAccessToken(creds, audience);
      const response = await fetch(`${audience}/topups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          operatorId: DEFAULT_NG_MTN_OPERATOR_ID,
          amount: reward.amount,
          useLocalAmount: true,
          customIdentifier: `reward_${reward.id}_attempt_${reward.retryCount}`,
          recipientPhone: { countryCode: "NG", number: reward.learnerPhone }
        })
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: `Reloadly returned HTTP ${response.status}`,
          retryable: isRetryableStatus(response.status)
        } satisfies DispatchResult;
      }
      const data = (await response.json()) as {
        status?: string;
        transactionId?: string | number;
        errorCode?: string;
        message?: string;
      };
      if (data.status === "SUCCESSFUL" && data.transactionId !== undefined) {
        return { ok: true, providerTxnId: String(data.transactionId), issuedAt: new Date() };
      }
      const reason = `${data.errorCode ?? data.status ?? "UnknownStatus"} ${data.message ?? ""}`.trim();
      const retryable = data.errorCode ? RETRYABLE_PROVIDER_ERROR_CODES.has(data.errorCode) : false;
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
