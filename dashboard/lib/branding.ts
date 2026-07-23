import { getPublicConfigNamespace } from "./config/api";

/**
 * White-label branding, read from the published `branding.identity` content
 * document. Lets a partner organisation rename and re-theme the product with no
 * deploy. Every field falls back to the SheTrades defaults so the app still
 * renders on a fresh deploy with nothing published.
 */
export type Branding = {
  organisationName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
};

export const BRANDING_FALLBACK: Branding = {
  organisationName: "SheTrades",
  primaryColor: "#334e58",
  secondaryColor: "#ffbe22",
  accentColor: "#f0a90e",
  fontFamily: "Asap"
};

/**
 * Fonts bundled with the app (see lib/fonts.ts). The key is the value stored in
 * branding.identity's fontFamily; the value is the CSS variable next/font
 * defines on <html>. Kept as plain strings so client components (the Branding
 * dropdown) can import the list without pulling in the font loader.
 */
const CURATED_FONT_VARS: Record<string, string> = {
  Asap: "var(--font-asap)",
  Inter: "var(--font-inter)",
  "Nunito Sans": "var(--font-nunito-sans)",
  "Source Sans 3": "var(--font-source-sans-3)",
  "Work Sans": "var(--font-work-sans)"
};

/** Options for the Branding tab's font dropdown. Asap first - it is the default. */
export const FONT_CHOICES: Array<{ value: string; label: string }> = Object.keys(
  CURATED_FONT_VARS
).map((name) => ({ value: name, label: name }));

const str = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

/** Server-side: fetch the published branding, degrading to the safe defaults. */
export async function getBranding(): Promise<Branding> {
  try {
    const result = await getPublicConfigNamespace("content");
    const doc = result.data.documents.find((item) => item.key === "branding.identity");
    if (!doc || typeof doc.data !== "object" || doc.data === null) return BRANDING_FALLBACK;
    const data = doc.data as Record<string, unknown>;
    return {
      organisationName: str(data.organisationName, BRANDING_FALLBACK.organisationName),
      primaryColor: str(data.primaryColor, BRANDING_FALLBACK.primaryColor),
      secondaryColor: str(data.secondaryColor, BRANDING_FALLBACK.secondaryColor),
      accentColor: str(data.accentColor, BRANDING_FALLBACK.accentColor),
      fontFamily: str(data.fontFamily, BRANDING_FALLBACK.fontFamily)
    };
  } catch {
    return BRANDING_FALLBACK;
  }
}

// Strip anything that could break out of a CSS value into a rule/selector. The
// values come from admin input, but a stray ";}" must never be able to inject
// arbitrary CSS.
const cleanColor = (value: string): string =>
  value.replace(/[^a-zA-Z0-9#(),.%\s-]/g, "").slice(0, 64);
const cleanFont = (value: string): string =>
  value.replace(/[^a-zA-Z0-9\s-]/g, "").slice(0, 64);

// Append an alpha byte to a #rrggbb colour to derive a translucent glow. Falls
// back to the opaque colour if it is not a 6-digit hex (the Branding colour
// pickers always emit hex, so the hex path is the normal one).
const withAlpha = (color: string, alphaHex: string): string =>
  /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;

/**
 * The branding as design-token overrides, returned as a React style object of
 * CSS custom properties. Applied on <body> in the root layout, where custom
 * properties inherit to every descendant so the whole component library
 * re-themes with no per-component change. Using the style prop (not injected
 * innerHTML) keeps this free of any HTML-injection surface; values are also
 * sanitised so a stray character cannot escape the CSS value.
 */
export function brandingStyleVars(branding: Branding): Record<string, string> {
  const primary = cleanColor(branding.primaryColor);
  const secondary = cleanColor(branding.secondaryColor);
  const accent = cleanColor(branding.accentColor);
  const font = cleanFont(branding.fontFamily);
  // A curated font resolves to its bundled next/font variable (loads for every
  // visitor); an unknown/legacy value falls back to the old behaviour of naming
  // the raw family, which only renders if the visitor has it installed.
  const fontValue = CURATED_FONT_VARS[font] ?? `"${font}"`;
  return {
    "--color-brand-500": primary,
    "--color-brand-600": primary,
    "--color-brand-700": primary,
    "--color-accent-400": secondary,
    "--color-accent-500": accent,
    "--color-accent-600": accent,
    "--font-family-sans": `${fontValue}, "Segoe UI", "Helvetica Neue", Arial, sans-serif`,
    // The sidebar and guided-tour accents are DERIVED from the accent tokens in
    // globals.css :root (--sidebar-accent, --sidebar-mark-gradient, --tour-ring).
    // A :root-declared derived var resolves against the value at :root, so it
    // wouldn't pick up the token override on its own - re-declare it from the
    // branding accent so the active-nav highlight, logo mark, and avatar re-theme.
    "--sidebar-accent": secondary,
    "--sidebar-mark-gradient": `linear-gradient(135deg, ${secondary}, ${accent})`,
    "--tour-ring": secondary,
    // Glow shadows were a hardcoded gold rgba; derive them from the branding
    // accent (with alpha) so the logo-mark glow and tour pulse follow the brand.
    "--sidebar-mark-glow": `0 6px 16px ${withAlpha(secondary, "4d")}`,
    "--tour-glow": withAlpha(secondary, "59"),
    // Focus ring follows the brand primary (~24% alpha). Derived HERE, not via
    // CSS color-mix inside the --focus-ring token: an unsupported color-mix in a
    // var() is invalid at computed-value time, which would REMOVE the ring at
    // every :focus-visible call site rather than fall back. The stylesheet keeps
    // the navy default for unbranded installs.
    "--focus-ring": `0 0 0 3px ${withAlpha(primary, "3d")}`
  };
}
