import { africasTalkingAdapter } from "./africas-talking.js";
import { termiiAdapter } from "./termii.js";
import { reloadlyAdapter } from "./reloadly.js";
import type {
  ConnectionResult,
  PayoutProvider,
  PayoutsIntegrationPayload
} from "./contracts.js";
import { getRuntimePayoutsConfig } from "../../config-platform/runtime-config.js";

function selectAdapter(provider: PayoutsIntegrationPayload["provider"]): PayoutProvider {
  switch (provider) {
    case "africas_talking":
      return africasTalkingAdapter;
    case "termii":
      return termiiAdapter;
    case "reloadly":
      return reloadlyAdapter;
  }
}

export async function getActiveProvider(): Promise<{
  provider: PayoutProvider;
  config: PayoutsIntegrationPayload;
} | null> {
  const config = getRuntimePayoutsConfig();
  if (!config) return null;
  return { provider: selectAdapter(config.provider), config };
}

/**
 * Validate a (possibly unsaved) payouts configuration by asking the matching
 * provider adapter to verify its credentials against the upstream API. Powers
 * the admin "Test Connection" button so operators can confirm credentials
 * before publishing them for the dispatch worker.
 */
export async function verifyPayoutsConfig(
  config: PayoutsIntegrationPayload
): Promise<ConnectionResult> {
  return selectAdapter(config.provider).verifyCredentials(config);
}
