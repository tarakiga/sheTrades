"use client";

import { createContext, useContext, type ReactNode } from "react";
import { BRANDING_FALLBACK, type Branding } from "../../lib/branding";

const BrandingContext = createContext<Branding>(BRANDING_FALLBACK);

/**
 * Makes the published branding (organisation name, colours, font) available to
 * client components via `useBranding()`. The root layout fetches branding on the
 * server and passes it here, so client chrome (shell, login) can render the
 * partner's name without each component doing its own fetch.
 */
export function BrandingProvider({ value, children }: { value: Branding; children: ReactNode }) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
