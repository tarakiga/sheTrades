"use client";

import type { KeyboardEvent } from "react";

export type ProviderKey = "africas_talking" | "termii" | "reloadly";

export type PayoutsProviderSelectorChange = {
  provider: ProviderKey;
  sandbox: boolean;
};

export type PayoutsProviderSelectorProps = {
  value: ProviderKey;
  sandbox: boolean;
  onChange: (next: PayoutsProviderSelectorChange) => void;
  disabled?: boolean;
};

type ProviderDescriptor = {
  key: ProviderKey;
  name: string;
  tagline: string;
};

const PROVIDERS: ReadonlyArray<ProviderDescriptor> = [
  {
    key: "africas_talking",
    name: "Africa's Talking",
    tagline:
      "Industry-standard for Nigerian airtime via sandbox + production endpoints"
  },
  {
    key: "termii",
    name: "Termii",
    tagline: "Nigeria-first airtime and SMS provider with simple API key auth"
  },
  {
    key: "reloadly",
    name: "Reloadly",
    tagline: "Global multi-country airtime via OAuth client-credentials"
  }
];

export function PayoutsProviderSelector({
  value,
  sandbox,
  onChange,
  disabled = false
}: PayoutsProviderSelectorProps) {
  function selectProvider(next: ProviderKey) {
    if (disabled) return;
    if (next === value) return;
    // Switching providers resets sandbox to false.
    onChange({ provider: next, sandbox: false });
  }

  function toggleSandbox() {
    if (disabled) return;
    onChange({ provider: value, sandbox: !sandbox });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: ProviderKey) {
    if (disabled) return;
    const currentIndex = PROVIDERS.findIndex((provider) => provider.key === key);
    if (currentIndex < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % PROVIDERS.length;
      const nextProvider = PROVIDERS[nextIndex];
      if (nextProvider) {
        selectProvider(nextProvider.key);
      }
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const nextIndex = (currentIndex - 1 + PROVIDERS.length) % PROVIDERS.length;
      const nextProvider = PROVIDERS[nextIndex];
      if (nextProvider) {
        selectProvider(nextProvider.key);
      }
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      selectProvider(key);
    }
  }

  const wrapperClass = [
    "payouts-provider-selector",
    disabled ? "payouts-provider-selector--disabled" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="radiogroup"
      aria-label="Payouts provider"
      aria-disabled={disabled ? "true" : "false"}
      className={wrapperClass}
    >
      {PROVIDERS.map((provider) => {
        const isActive = provider.key === value;
        const cardClass = [
          "payouts-provider-selector__card",
          isActive ? "payouts-provider-selector__card--active" : "",
          disabled ? "payouts-provider-selector__card--disabled" : ""
        ]
          .filter(Boolean)
          .join(" ");

        const sandboxToggleId = `payouts-provider-${provider.key}-sandbox`;

        return (
          <div key={provider.key} className="payouts-provider-selector__card-wrap">
            <button
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${provider.name}. ${provider.tagline}`}
              tabIndex={isActive ? 0 : -1}
              disabled={disabled}
              className={cardClass}
              onClick={() => selectProvider(provider.key)}
              onKeyDown={(event) => handleKeyDown(event, provider.key)}
            >
              <div className="payouts-provider-selector__radio" aria-hidden="true">
                <span className="payouts-provider-selector__radio-dot" />
              </div>
              <div className="payouts-provider-selector__copy">
                <span className="payouts-provider-selector__name">{provider.name}</span>
                <span className="payouts-provider-selector__tagline">
                  {provider.tagline}
                </span>
              </div>
            </button>
            {isActive ? (
              <label
                className="payouts-provider-selector__sandbox"
                htmlFor={sandboxToggleId}
              >
                <input
                  id={sandboxToggleId}
                  type="checkbox"
                  className="payouts-provider-selector__sandbox-input"
                  checked={sandbox}
                  disabled={disabled}
                  onChange={toggleSandbox}
                />
                <span className="payouts-provider-selector__sandbox-label">
                  Use sandbox endpoint
                </span>
                <span className="payouts-provider-selector__sandbox-hint">
                  Recommended while you are testing credentials and webhooks.
                </span>
              </label>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
