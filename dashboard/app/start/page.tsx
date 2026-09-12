import type { Metadata } from "next";
import Image from "next/image";
import QRCode from "qrcode";
import { getPublicConfigNamespace } from "../../lib/config/api";
import { getBranding } from "../../lib/branding";
import { parseInlineLinks } from "../../lib/inline-links";
import logo from "../../assets/brand/shetrades-digital-logo.png";
import badge from "../../assets/brand/shetrades-digital-badge.png";

/**
 * The public front door: what someone lands on when they follow a shared link
 * to the programme, and the page whose Open Graph tags give that link a rich
 * preview in WhatsApp.
 *
 * Two things this page must be, and one it must not:
 *
 *   - A real 200 with the tags in the HTML. WhatsApp's crawler follows
 *     redirects and does not run JavaScript, so a page that bounced straight to
 *     wa.me would preview as WhatsApp's own card, not ours.
 *   - Reachable at the bare domain. The middleware REWRITES `/` on the public
 *     host to this route, so the link people paste stays as the bare domain
 *     and the preview attaches to that URL.
 *   - Never a page that knows the number. It comes from config, so changing the
 *     bot's number is an edit under Content, not a deploy - and this page, the
 *     poster script, and the bot cannot disagree about it.
 */

/**
 * Where absolute URLs in the metadata point. The crawler needs an absolute
 * og:image; a relative one is silently dropped. Deployment config, like
 * ADMIN_HOSTS - the same domain the bot and the certificates already use.
 */
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.shetrades.digital";

/** Content keys. Fallbacks are the poster's copy, so the two cannot drift. */
const KEY_NUMBER = "branding.whatsapp_number";
/**
 * The message WhatsApp pre-fills when she taps the button or scans the QR, so
 * she only has to press send. The bot treats ANY first message that is not a
 * language choice as an opening, so this can be changed freely - it is what
 * she sees in her own chat as the first thing she "said", so it is worth
 * choosing with care.
 */
const KEY_PREFILL = "branding.whatsapp_prefill";
const KEY_HEADLINE = "public.start.headline";
const KEY_LEDE = "public.start.lede";
const KEY_CTA = "public.start.cta";
const KEY_OG_DESCRIPTION = "public.start.og_description";
/**
 * For Meta's display-name reviewers as much as for learners. The chain they
 * check is verified legal name -> brand -> programme; techherng.com states
 * the first two links, and this footer states the same facts from the
 * programme's side and points back, so the relationship is evident from
 * whichever end a reviewer starts.
 */
const KEY_LEGAL_ENTITY = "public.start.legal_entity";
const KEY_OPERATOR_URL = "public.start.operator_url";
/**
 * Who built the product. One string with markdown-style links, so the firms,
 * their URLs and the wording are all editable in the console together: add a
 * firm, drop one, rephrase. Only http(s) links are honoured (see inline-links).
 */
const KEY_CREDITS = "public.start.credits";

const FALLBACK = {
  headline: "Learn digital and business skills on WhatsApp.",
  lede: "Short lessons for women who trade. Free, at your own pace, on the phone you already have. Finish all five modules and earn a certificate.",
  cta: "Open WhatsApp",
  ogDescription:
    "Free WhatsApp lessons for women traders in Nigeria: digital safety, selling online, financial tools and more. Send hi to start.",
  legalEntity: "Tech Project Women Initiative Ltd/Gte, RC 1469563",
  operatorUrl: "https://techherng.com",
  credits: "Developed by [Decy4](https://decy4.com/) and [Virtumultimedia](https://virtumultimedia.com/).",
  prefill: "hi"
};

type PublicCopy = {
  number: string | null;
  headline: string;
  lede: string;
  cta: string;
  ogDescription: string;
  legalEntity: string;
  operatorUrl: string;
  credits: string;
  prefill: string;
};

async function readPublicCopy(): Promise<PublicCopy> {
  const copy: PublicCopy = { number: null, ...FALLBACK };
  try {
    const result = await getPublicConfigNamespace("content");
    const byKey = new Map(result.data.documents.map((doc) => [doc.key, doc.data ?? {}]));
    const en = (key: string): string | null => {
      const value = (byKey.get(key) as { en?: unknown } | undefined)?.en;
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    };
    copy.number = en(KEY_NUMBER)?.replace(/[^\d]/g, "") || null;
    copy.headline = en(KEY_HEADLINE) ?? copy.headline;
    copy.lede = en(KEY_LEDE) ?? copy.lede;
    copy.cta = en(KEY_CTA) ?? copy.cta;
    copy.ogDescription = en(KEY_OG_DESCRIPTION) ?? copy.ogDescription;
    copy.legalEntity = en(KEY_LEGAL_ENTITY) ?? copy.legalEntity;
    copy.operatorUrl = en(KEY_OPERATOR_URL) ?? copy.operatorUrl;
    copy.credits = en(KEY_CREDITS) ?? copy.credits;
    copy.prefill = en(KEY_PREFILL) ?? copy.prefill;
  } catch {
    // Config unavailable: the page still renders with its fallbacks. The one
    // thing it cannot invent is the number, which is why that stays null.
  }
  return copy;
}

function waLink(number: string, prefill: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(prefill)}`;
}

/** +234 803 512 5590, grouped the way a Nigerian number is read aloud. */
function prettyNumber(digits: string): string {
  if (digits.startsWith("234") && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const [{ organisationName }, copy] = await Promise.all([getBranding(), readPublicCopy()]);
  const title = `${organisationName} Digital`;
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title,
    description: copy.ogDescription,
    openGraph: {
      title,
      description: copy.ogDescription,
      url: "/",
      siteName: title,
      type: "website",
      locale: "en_NG"
      // og:image comes from ./opengraph-image.png by file convention; Next adds
      // the absolute URL, dimensions and type itself.
    },
    twitter: { card: "summary_large_image", title, description: copy.ogDescription },
    robots: { index: true, follow: true }
  };
}

/** Rendered size of the QR on the page, in CSS pixels. */
const QR_SIZE = 220;

export default async function StartPage() {
  const copy = await readPublicCopy();

  // A PNG data URL, not inline SVG: nothing is injected as markup. High error
  // correction, like the poster - this may be scanned by another phone across
  // a market stall from a cracked screen.
  const qrDataUrl = copy.number
    ? await QRCode.toDataURL(waLink(copy.number, copy.prefill), {
        type: "image/png",
        errorCorrectionLevel: "H",
        margin: 1,
        width: QR_SIZE * 2,
        color: { dark: "#0b675c", light: "#ffffff" }
      })
    : null;

  return (
    <main className="start-page">
      <div className="start-page__bar start-page__bar--top" aria-hidden="true" />

      <header className="start-page__head">
        <Image src={logo} alt="SheTrades Digital, by TechHer" className="start-page__logo" priority />
      </header>

      <section className="start-page__lede">
        <h1 className="start-page__headline">{copy.headline}</h1>
        <p className="start-page__text">{copy.lede}</p>
      </section>

      {copy.number ? (
        <section className="start-page__cta">
          <a className="start-page__button" href={waLink(copy.number, copy.prefill)} rel="noopener">
            {copy.cta}
          </a>
          <p className="start-page__hint">
            Or save <strong className="start-page__number">{prettyNumber(copy.number)}</strong> and
            send <strong>{copy.prefill}</strong> on WhatsApp.
          </p>
          {qrDataUrl ? (
            <figure className="start-page__qr">
              <Image
                src={qrDataUrl}
                alt={`QR code that opens WhatsApp to ${prettyNumber(copy.number)}`}
                width={QR_SIZE}
                height={QR_SIZE}
                className="start-page__qr-image"
                unoptimized
              />
              <figcaption className="start-page__qr-caption">Scan from another phone</figcaption>
            </figure>
          ) : null}
        </section>
      ) : (
        <section className="start-page__cta">
          <p className="start-page__hint">We are getting ready. Check back soon.</p>
        </section>
      )}

      <footer className="start-page__foot">
        <Image src={badge} alt="" className="start-page__badge" aria-hidden="true" />
        <p className="start-page__partners">
          <strong>A TechHer programme</strong>
          <br />
          In partnership with She Connects Digital Accelerator Africa
          <br />
          With support from CARE
        </p>
        <p className="start-page__operator">
          SheTrades Digital is operated by{" "}
          <a href={copy.operatorUrl} rel="noopener">
            TechHer
          </a>
          , a programme of {copy.legalEntity}.
        </p>
        <a className="start-page__policy" href="/privacy">
          Privacy policy
        </a>
        <p className="start-page__credits">
          {parseInlineLinks(copy.credits).map((segment, index) =>
            segment.kind === "link" ? (
              <a key={index} href={segment.href} rel="noopener">
                {segment.text}
              </a>
            ) : (
              <span key={index}>{segment.text}</span>
            )
          )}
        </p>
      </footer>

      <div className="start-page__bar start-page__bar--bottom" aria-hidden="true" />
    </main>
  );
}
