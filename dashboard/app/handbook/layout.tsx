import type { ReactNode } from "react";
import { AdminAuthGate } from "../../components/auth/AdminAuthGate";
import { AdminSessionProvider } from "../../components/auth/AdminSessionProvider";

type HandbookLayoutProps = {
  children: ReactNode;
};

/**
 * Deliberately outside the `(admin)` route group, so the handbook fills the
 * window instead of sitting in the sidebar shell. It is a long reference
 * document opened in its own tab; the console chrome around it would only make
 * the reading column narrower.
 *
 * The gate is still wanted: it is what sends a signed-out visitor to /login
 * rather than showing them a failed fetch. The document itself is protected by
 * /api/handbook, which checks the session before returning a byte.
 */
export default function HandbookLayout({ children }: HandbookLayoutProps) {
  return (
    <AdminSessionProvider>
      <AdminAuthGate>{children}</AdminAuthGate>
    </AdminSessionProvider>
  );
}
