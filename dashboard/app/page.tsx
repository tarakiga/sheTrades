import { AdminSessionProvider } from "../components/auth/AdminSessionProvider";
import { RootEntryRedirect } from "../components/auth/RootEntryRedirect";

export default function HomePage() {
  return (
    <AdminSessionProvider>
      <RootEntryRedirect />
    </AdminSessionProvider>
  );
}
