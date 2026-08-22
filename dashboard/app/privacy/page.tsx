import type { Metadata } from "next";
import { getPublicConfigNamespace } from "../../lib/config/api";
import { getBranding } from "../../lib/branding";

export async function generateMetadata(): Promise<Metadata> {
  const { organisationName } = await getBranding();
  return {
    title: `Privacy Policy - ${organisationName}`,
    description: `How ${organisationName} collects, uses, shares, and protects personal information across its WhatsApp learning service and admin platform.`
  };
}

// Safe fallbacks, used ONLY when the legal config is unpopulated. The contact
// email, effective date, and policy body are admin-editable under Settings →
// Legal; the organisation name comes from Settings → Branding (the single source
// of truth). The seed:legal-privacy script publishes the baselines.
const CONTACT_EMAIL_FALLBACK = "privacy@shetrades.digital";
const EFFECTIVE_DATE_FALLBACK = "13 July 2026";

// Legal config keys (namespace "legal", type legal_block). The contact email and
// effective date come from Legal; the organisation name comes from Branding. The
// body may use {{orgName}} / {{contactEmail}} placeholders, interpolated at
// render below so editing those variables actually changes the page.
const KEY_POLICY_BODY = "legal.privacy.policy";
const KEY_CONTACT_EMAIL = "legal.privacy.contact_email";

type Section = { heading: string; body: string[] };

/**
 * The built-in policy, rendered when no `legal.privacy.policy` block is
 * published. Org name and contact email are interpolated so a partial config
 * (e.g. only the org name published) still reads consistently.
 */
function buildDefaultSections(orgName: string, contactEmail: string): Section[] {
  return [
    {
      heading: "1. Introduction",
      body: [
        `${orgName} ("SheTrades", "we", "us") operates a digital literacy and business-skills learning service delivered over WhatsApp, together with an administrative platform used by our team to manage that service. This Privacy Policy explains what personal information we collect, how we use and share it, and the choices you have.`,
        "By messaging our WhatsApp number or using our service, you agree to the practices described in this policy."
      ]
    },
    {
      heading: "2. Information we collect",
      body: [
        "Information you provide: your WhatsApp phone number, the name you share with us, your preferred language, and your location or state where you choose to provide it.",
        "Information generated as you learn: the lessons and modules you start and complete, your quiz answers and scores, your progress over time, and messages you exchange with our automated assistant.",
        "Reward information: where you qualify for airtime or other rewards, we process the phone number and reward details needed to deliver them.",
        "Administrative accounts: for staff who use our admin platform, we process the account email, role, and activity needed to operate and secure the platform."
      ]
    },
    {
      heading: "3. How we use your information",
      body: [
        "To deliver lessons, quizzes, and messages to you over WhatsApp and track your learning progress.",
        "To calculate and issue rewards such as airtime top-ups where you are eligible.",
        "To understand how our content performs in aggregate and to improve lessons and the learner experience.",
        "To operate, secure, and troubleshoot the service, and to comply with our legal obligations."
      ]
    },
    {
      heading: "4. Messaging over WhatsApp",
      body: [
        "Our learning service is delivered through the WhatsApp Business Platform, which is provided by Meta. Your messages are transmitted through WhatsApp and are subject to WhatsApp's and Meta's own terms and privacy practices, which we do not control.",
        "We only send you service messages related to your participation in the programme. You can stop receiving them at any time (see 'Your rights and choices')."
      ]
    },
    {
      heading: "5. How we share information",
      body: [
        "Service providers: we use trusted providers to run the service - including messaging infrastructure (Meta / WhatsApp), cloud hosting, and airtime or mobile top-up partners - who process information only on our instructions.",
        "Legal and safety: we may disclose information where required by law, to enforce our terms, or to protect the rights, safety, and security of learners, our team, or the public.",
        "We do not sell your personal information."
      ]
    },
    {
      heading: "6. Data retention",
      body: [
        "We keep personal information for as long as needed to provide the service, calculate and deliver rewards, meet legal and reporting obligations, and resolve disputes. When it is no longer needed, we delete or anonymise it."
      ]
    },
    {
      heading: "7. How we protect your information",
      body: [
        "We use technical and organisational measures - including access controls, authentication for administrative accounts, and encryption in transit - to protect personal information. No method of transmission or storage is completely secure, but we work to protect your data and review our safeguards regularly."
      ]
    },
    {
      heading: "8. Your rights and choices",
      body: [
        "You may request access to, correction of, or deletion of your personal information, subject to applicable law.",
        "You can opt out of our WhatsApp messages at any time by replying to stop participating or by contacting us using the details below. Opting out will end your participation in the learning programme.",
        "To exercise any of these rights, contact us using the details in the 'Contact us' section."
      ]
    },
    {
      heading: "9. Children's privacy",
      body: [
        "Our service is intended for adults and is not directed to children. We do not knowingly collect personal information from children. If you believe a child has provided us information, please contact us so we can remove it."
      ]
    },
    {
      heading: "10. Changes to this policy",
      body: [
        "We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date above and, where appropriate, notify you through the service."
      ]
    },
    {
      heading: "11. Contact us",
      body: [
        `If you have questions about this policy or your personal information, contact ${orgName} at ${contactEmail}.`
      ]
    }
  ];
}

function formatEffectiveDate(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

function paragraphsFrom(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default async function PrivacyPolicyPage() {
  // One audience now: a participant who followed the link in a WhatsApp
  // message. The console's sign-in form no longer points here, so there is no
  // reader to offer a way back to it - which also means this page stopped
  // needing the request host, and goes back to being statically rendered.

  // Organisation name is a global branding value (Settings → Branding) - the
  // single source of truth. Contact email, effective date, and body live in
  // Legal. Start from the safe fallbacks, then layer published config on top.
  const branding = await getBranding();
  const orgName = branding.organisationName;
  let contactEmail = CONTACT_EMAIL_FALLBACK;
  let effectiveDate = EFFECTIVE_DATE_FALLBACK;
  let bodyOverride: string | null = null;

  try {
    const result = await getPublicConfigNamespace("legal");
    const byKey = new Map<string, Record<string, unknown>>(
      result.data.documents.map((doc) => [doc.key, (doc.data ?? {}) as Record<string, unknown>])
    );
    // Legal blocks carry their text in `body.en`; tolerate a legacy `{ en }`
    // payload too so an older document still resolves.
    const readLocalizedBody = (key: string): string | null => {
      const data = byKey.get(key);
      if (!data) return null;
      const body = data.body;
      const fromBody =
        body && typeof body === "object" ? (body as Record<string, unknown>).en : undefined;
      const en =
        typeof fromBody === "string"
          ? fromBody
          : typeof data.en === "string"
            ? (data.en as string)
            : undefined;
      return en && en.trim().length > 0 ? en.trim() : null;
    };

    contactEmail = readLocalizedBody(KEY_CONTACT_EMAIL) ?? contactEmail;
    bodyOverride = readLocalizedBody(KEY_POLICY_BODY);

    const effectiveFrom = byKey.get(KEY_POLICY_BODY)?.effectiveFrom;
    effectiveDate = formatEffectiveDate(
      typeof effectiveFrom === "string" ? effectiveFrom : undefined,
      effectiveDate
    );
  } catch {
    // Config service unavailable - keep the built-in fallbacks.
  }

  // The published body (and default sections) may reference {{orgName}} and
  // {{contactEmail}}; interpolate them so the Branding org name and the Legal
  // Contact Email field actually drive what renders.
  const applyVars = (text: string): string =>
    text
      .replace(/\{\{\s*orgName\s*\}\}/g, orgName)
      .replace(/\{\{\s*contactEmail\s*\}\}/g, contactEmail);

  const sections = buildDefaultSections(orgName, contactEmail);

  return (
    <main className="legal-page">
      <article className="legal-page__inner">
        <header className="legal-page__header">
          <p className="legal-page__eyebrow">{orgName}</p>
          <h1 className="legal-page__title">Privacy Policy</h1>
          <p className="legal-page__meta">Effective date: {effectiveDate}</p>
        </header>

        {bodyOverride ? (
          <section className="legal-page__section">
            {paragraphsFrom(applyVars(bodyOverride)).map((paragraph, index) => (
              <p key={index} className="legal-page__paragraph">
                {paragraph}
              </p>
            ))}
          </section>
        ) : (
          sections.map((section) => (
            <section key={section.heading} className="legal-page__section">
              <h2 className="legal-page__heading">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="legal-page__paragraph">
                  {paragraph}
                </p>
              ))}
            </section>
          ))
        )}

        <footer className="legal-page__footer">
          <p className="legal-page__paragraph">
            Questions about your information? Email{" "}
            <a href={`mailto:${contactEmail}`} className="legal-page__link">
              {contactEmail}
            </a>
            .
          </p>
        </footer>
      </article>
    </main>
  );
}
