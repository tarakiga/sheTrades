import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { getPublicConfigNamespace } from "../lib/config/api";

export async function generateMetadata(): Promise<Metadata> {
  const fallback = {
    title: "SheTrades Admin Dashboard",
    description: "Admin dashboard for SheTrades Digital"
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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
