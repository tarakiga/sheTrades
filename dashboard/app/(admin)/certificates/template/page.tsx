"use client";

import Link from "next/link";
import { TemplateEditor } from "../../../../components/certificates/TemplateEditor";

export default function CertificateTemplatePage() {
  return (
    <main className="admin-dashboard-page certificate-template-page">
      <Link className="certificate-template-page__back" href="/certificates">
        &larr; Back to certificates
      </Link>
      <TemplateEditor />
    </main>
  );
}
