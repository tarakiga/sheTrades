import { africasTalkingAdapter } from "./africas-talking.js";
import { termiiAdapter } from "./termii.js";
import { reloadlyAdapter } from "./reloadly.js";
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
      return { provider: reloadlyAdapter, config };
  }
}
