import { africasTalkingAdapter } from "./africas-talking.js";
import type { PayoutProvider, PayoutsIntegrationPayload } from "./contracts.js";
import { getRuntimePayoutsConfig } from "../../config-platform/runtime-config.js";

export async function getActiveProvider(): Promise<{
  provider: PayoutProvider;
  config: PayoutsIntegrationPayload;
} | null> {
  const config = getRuntimePayoutsConfig();
  if (!config) return null;
  switch (config.provider) {
    case "africas_talking":
      return { provider: africasTalkingAdapter, config };
    case "termii":
    case "reloadly":
      // Adapters added in later tasks (7, 8). Returning null is safe:
      // the worker logs a "no_active_provider" skip event when this is null.
      return null;
  }
}
