import { africasTalkingAdapter } from "./africas-talking.js";
import { termiiAdapter } from "./termii.js";
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
      return { provider: termiiAdapter, config };
    case "reloadly":
      // Reloadly adapter added in Task 8. Returning null is safe:
      // the worker logs a "no_active_provider" skip event when this is null.
      return null;
  }
}
