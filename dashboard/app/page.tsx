export default function HomePage() {
  return (
    <main className="tokens-page">
      <h1 className="tokens-title">SheTrades Design Tokens v1</h1>
      <p className="tokens-subtitle">
        Foundation token set for color, typography, spacing, elevation, and layout. This surface is
        used for design review before component library implementation.
      </p>

      <section className="token-section" aria-label="Color palette tokens">
        <h2>Color Palette</h2>
        <div className="token-grid">
          <div className="token-chip">
            <div className="token-chip-color swatch-brand-500" />
            <div className="token-chip-label">Brand 500</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-brand-700" />
            <div className="token-chip-label">Brand 700</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-accent-400" />
            <div className="token-chip-label">Accent 400</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-success" />
            <div className="token-chip-label">Success</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-warning" />
            <div className="token-chip-label">Warning</div>
          </div>
          <div className="token-chip">
            <div className="token-chip-color swatch-danger" />
            <div className="token-chip-label">Danger</div>
          </div>
        </div>
      </section>

      <section className="token-section" aria-label="Typography scale tokens">
        <h2>Typography Scale</h2>
        <div className="token-grid">
          <div className="token-chip">
            <div className="type-xs">XS - 12px</div>
          </div>
          <div className="token-chip">
            <div className="type-sm">SM - 14px</div>
          </div>
          <div className="token-chip">
            <div className="type-md">MD - 16px</div>
          </div>
          <div className="token-chip">
            <div className="type-lg">LG - 18px</div>
          </div>
          <div className="token-chip">
            <div className="type-xl">XL - 20px</div>
          </div>
          <div className="token-chip">
            <div className="type-2xl">2XL - 24px</div>
          </div>
        </div>
      </section>

      <section className="token-section" aria-label="Spacing and radius tokens">
        <h2>Spacing + Radius</h2>
        <p className="tokens-subtitle">
          Spacing scale: 4px baseline (`0.25rem`) with fluid composition from 4px to 64px. Radiuses:
          `sm` 6px, `md` 8px, `lg` 12px, `xl` 16px.
        </p>
      </section>
    </main>
  );
}
