import { Suspense } from "react";
import { AdminSessionProvider } from "../../components/auth/AdminSessionProvider";
import { LoginPageClient } from "../../components/auth/LoginPageClient";
import { LoginPageFallback } from "../../components/auth/LoginPageFallback";

export default function LoginPage() {
  return (
    <AdminSessionProvider>
      <Suspense fallback={<LoginPageFallback />}>
        <LoginPageClient />
      </Suspense>
    </AdminSessionProvider>
  );
}
