import type { ReactNode } from "react";
import { AdminAuthGate } from "../../components/auth/AdminAuthGate";
import { AdminSessionProvider } from "../../components/auth/AdminSessionProvider";

type PreviewsLayoutProps = {
  children: ReactNode;
};

/**
 * The component workshop renders every admin workspace - users, payouts,
 * translation review, admin team - outside the `(admin)` route group, so it
 * never inherited that group's auth gate and was readable by anyone who knew
 * the URL. The sample data in it is fabricated, but a pixel-accurate copy of
 * the console is a ready-made template for a convincing fake sign-in page.
 *
 * This gate hides it from the SCREEN, and that is all it can do. Unlike the
 * real admin pages, which authenticate before fetching anything and so
 * server-render an empty shell, this page's content is static and inline: it
 * lands in the RSC payload regardless of what the gate displays, so curl still
 * reads it. What actually keeps it out of a deployed build is `middleware.ts`,
 * which 404s /previews unless ENABLE_COMPONENT_PREVIEWS says otherwise.
 *
 * Keep both. This one covers a running dev server on a shared network, where
 * the route is enabled by design.
 */
export default function PreviewsLayout({ children }: PreviewsLayoutProps) {
  return (
    <AdminSessionProvider>
      <AdminAuthGate>{children}</AdminAuthGate>
    </AdminSessionProvider>
  );
}
