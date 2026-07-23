import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { getPublicConfigNamespace } from "../lib/config/api";
import { getBranding, brandingStyleVars } from "../lib/branding";
import { BrandingProvider } from "../components/branding/BrandingProvider";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  const fallback = {
    title: `${branding.organisationName} Admin Dashboard`,
    description: `Admin dashboard for ${branding.organisationName}`
  };
  const result = await getPublicConfigNamespace("content");
  const titleDoc = result.data.documents.find((item) => item.key === "admin.ui.meta.title");
  const descriptionDoc = result.data.documents.find(
    (item) => item.key === "admin.ui.meta.description"
  );
  const title =
    titleDoc && typeof titleDoc.data.en === "string" ? titleDoc.data.en : fallback.title;
  const description =
    descriptionDoc && typeof descriptionDoc.data.en === "string"
      ? descriptionDoc.data.en
      : fallback.description;
  return { title, description };
}

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const branding = await getBranding();
  // White-label theme: override the brand/accent/font tokens from the published
  // branding config as CSS custom properties. Set on <html> (:root), not <body>:
  // globals.css derives vars like --sidebar-accent at :root, and those resolve
  // against the :root values - so the override must sit at the same level to
  // re-theme them. Safe by construction - no injected markup.
  const themeVars = brandingStyleVars(branding) as CSSProperties;
  return (
    <html lang="en" suppressHydrationWarning style={themeVars}>
      <body suppressHydrationWarning>
        <BrandingProvider value={branding}>{children}</BrandingProvider>
      </body>
    </html>
  );
}
