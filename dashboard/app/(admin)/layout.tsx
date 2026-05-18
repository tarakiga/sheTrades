import type { ReactNode } from "react";
import { AdminAuthGate } from "../../components/auth/AdminAuthGate";
import { AdminSessionProvider } from "../../components/auth/AdminSessionProvider";
import { AdminShell } from "../../components/layout/AdminShell";
import { getAdminUiCopy } from "../../lib/config/admin-ui-copy";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const copy = await getAdminUiCopy();
  return (
    <AdminSessionProvider>
      <AdminShell copy={copy.map}>
        <AdminAuthGate>{children}</AdminAuthGate>
      </AdminShell>
    </AdminSessionProvider>
  );
}
