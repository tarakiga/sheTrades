"use client";

import { useState } from "react";
import { Card } from "../../../components/ui";
import {
  PayoutsProviderSelector,
  type PayoutsProviderSelectorChange,
  type ProviderKey
} from "../../../components/integration/payouts/PayoutsProviderSelector";
import {
  PayoutsCredentialFields,
  createEmptyPayoutsPayload,
  type PayoutsIntegrationPayload
} from "../../../components/integration/payouts/PayoutsCredentialFields";

type ProviderHarnessProps = {
  initialProvider: ProviderKey;
  initialSandbox?: boolean;
  initialOverrides?: Partial<PayoutsIntegrationPayload>;
};

function ProviderHarness({
  initialProvider,
  initialSandbox = false
}: ProviderHarnessProps) {
  const [payload, setPayload] = useState<PayoutsIntegrationPayload>(() => {
    const base = createEmptyPayoutsPayload(initialProvider);
    return { ...base, sandbox: initialSandbox };
  });

  function handleSelectorChange(next: PayoutsProviderSelectorChange) {
    if (next.provider !== payload.provider) {
      const blank = createEmptyPayoutsPayload(next.provider);
      setPayload({ ...blank, sandbox: next.sandbox });
      return;
    }
    setPayload({ ...payload, sandbox: next.sandbox });
  }

  return (
    <div className="preview-card-content">
      <PayoutsProviderSelector
        value={payload.provider}
        sandbox={payload.sandbox}
        onChange={handleSelectorChange}
      />
      <PayoutsCredentialFields
        provider={payload.provider}
        value={payload}
        onChange={setPayload}
        errors={{}}
      />
    </div>
  );
}

function DisabledHarness() {
  const [payload] = useState<PayoutsIntegrationPayload>(() => ({
    ...createEmptyPayoutsPayload("africas_talking"),
    africasTalking: { username: "shetrades_prod", apiKey: "atk_live_••••" },
    sandbox: true,
    provider: "africas_talking",
    defaults: { currency: "NGN", channel: "airtime" }
  }));

  return (
    <div className="preview-card-content">
      <PayoutsProviderSelector
        value={payload.provider}
        sandbox={payload.sandbox}
        onChange={() => undefined}
        disabled
      />
      <PayoutsCredentialFields
        provider={payload.provider}
        value={payload}
        onChange={() => undefined}
        errors={{}}
      />
    </div>
  );
}

function ErrorStateHarness() {
  const [payload, setPayload] = useState<PayoutsIntegrationPayload>(() => ({
    ...createEmptyPayoutsPayload("reloadly"),
    reloadly: { clientId: "", clientSecret: "" }
  }));

  function handleSelectorChange(next: PayoutsProviderSelectorChange) {
    if (next.provider !== payload.provider) {
      const blank = createEmptyPayoutsPayload(next.provider);
      setPayload({ ...blank, sandbox: next.sandbox });
      return;
    }
    setPayload({ ...payload, sandbox: next.sandbox });
  }

  return (
    <div className="preview-card-content">
      <PayoutsProviderSelector
        value={payload.provider}
        sandbox={payload.sandbox}
        onChange={handleSelectorChange}
      />
      <PayoutsCredentialFields
        provider={payload.provider}
        value={payload}
        onChange={setPayload}
        errors={{
          clientId: "Client ID is required.",
          clientSecret: "Client Secret is required."
        }}
      />
    </div>
  );
}

export function PayoutsIntegrationPreview() {
  return (
    <div className="preview-card-content">
      <Card
        title="Africa's Talking - selector + credential fields"
        description="Clicking another provider card resets the sandbox toggle. Sandbox only renders inside the active card."
      >
        <ProviderHarness initialProvider="africas_talking" initialSandbox />
      </Card>

      <Card
        title="Termii - selector + credential fields"
        description="API key + optional sender ID. Sender ID is preserved as undefined when blank."
      >
        <ProviderHarness initialProvider="termii" />
      </Card>

      <Card
        title="Reloadly - selector + credential fields"
        description="Client ID and client secret. Reveal toggles only switch the secret input mode locally."
      >
        <ProviderHarness initialProvider="reloadly" />
      </Card>

      <Card
        title="Disabled state"
        description="Selector cards become unclickable and the sandbox toggle is locked. Use this for read-only roles."
      >
        <DisabledHarness />
      </Card>

      <Card
        title="Field-level error states"
        description="Validation errors render in red beneath each field. Hints disappear while an error is active."
      >
        <ErrorStateHarness />
      </Card>
    </div>
  );
}
