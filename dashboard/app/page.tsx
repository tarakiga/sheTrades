import { getAdminUiCopy } from "../lib/config/admin-ui-copy";

export default async function HomePage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  return (
    <main className="tokens-page">
      <h1 className="tokens-title">{t("tokens.title", "SheTrades Design Tokens v1")}</h1>
      <p className="tokens-subtitle">
        {t(
          "tokens.subtitle",
          "Foundation token set for color, typography, spacing, elevation, and layout. This surface is used for design review before component library implementation."
        )}
      </p>

      <section
        className="token-section"
        aria-label={t("tokens.colors.aria", "Color palette tokens")}
      >
        <h2>{t("tokens.colors.heading", "Color Palette")}</h2>
        <div className="token-grid">
          <div className="token-chip">
            <div className="token-chip-color swatch-brand-500" />
            <div className="token-chip-label">{t("tokens.colors.brand500", "Brand 500")}</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-brand-700" />
            <div className="token-chip-label">{t("tokens.colors.brand700", "Brand 700")}</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-accent-400" />
            <div className="token-chip-label">{t("tokens.colors.accent400", "Accent 400")}</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-success" />
            <div className="token-chip-label">{t("tokens.colors.success", "Success")}</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-warning" />
            <div className="token-chip-label">{t("tokens.colors.warning", "Warning")}</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-danger" />
            <div className="token-chip-label">{t("tokens.colors.danger", "Danger")}</div>
          </div>
        </div>
      </section>

      <section
        className="token-section"
        aria-label={t("tokens.typography.aria", "Typography scale tokens")}
      >
        <h2>{t("tokens.typography.heading", "Typography Scale")}</h2>
        <div className="token-grid">
          <div className="token-chip">
            <div className="type-xs">{t("tokens.typography.xs", "XS - 12px")}</div>
          </div>
          <div className="token-chip">
            <div className="type-sm">{t("tokens.typography.sm", "SM - 14px")}</div>
          </div>
          <div className="token-chip">
            <div className="type-md">{t("tokens.typography.md", "MD - 16px")}</div>
          </div>
          <div className="token-chip">
            <div className="type-lg">{t("tokens.typography.lg", "LG - 18px")}</div>
          </div>
          <div className="token-chip">
            <div className="type-xl">{t("tokens.typography.xl", "XL - 20px")}</div>
          </div>
          <div className="token-chip">
            <div className="type-2xl">{t("tokens.typography.2xl", "2XL - 24px")}</div>
          </div>
        </div>
      </section>

      <section
        className="token-section"
        aria-label={t("tokens.spacing.aria", "Spacing and radius tokens")}
      >
        <h2>{t("tokens.spacing.heading", "Spacing + Radius")}</h2>
        <p className="tokens-subtitle">
          {t(
            "tokens.spacing.description",
            "Spacing scale: 4px baseline (`0.25rem`) with fluid composition from 4px to 64px. Radiuses: `sm` 6px, `md` 8px, `lg` 12px, `xl` 16px."
          )}
        </p>
      </section>
    </main>
  );
}
