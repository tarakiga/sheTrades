"use client";

import { useRef, useState } from "react";
import { Badge, Button, Input, Select } from "../ui";
import { suggestAssetKey } from "../../lib/certificates/asset-key";
import {
  uploadCertificateAsset,
  type CertificateAsset
} from "../../lib/admin/certificate-template";

export type AssetPickerProps = {
  assets: CertificateAsset[];
  /** The key currently used as the template background, so it can be marked. */
  backgroundKey: string | null;
  onUploaded: (asset: CertificateAsset) => void;
  onUseAsBackground: (asset: CertificateAsset) => void;
  onAddLogoField: (asset: CertificateAsset) => void;
};

const KIND_OPTIONS = [
  { value: "logo", label: "A logo or badge" },
  { value: "background", label: "The certificate background" }
];

/**
 * Upload artwork, and put it on the certificate.
 *
 * The one rule an admin meets here that needs explaining rather than enforcing
 * silently: artwork is never replaced. A key already in use is refused, because
 * an issued certificate freezes its template and that frozen copy names its
 * artwork by key — overwriting the bytes would redraw credentials months after
 * they were delivered. So the key box is pre-filled with a free versioned name
 * and the note underneath says why.
 */
export function AssetPicker({
  assets,
  backgroundKey,
  onUploaded,
  onUseAsBackground,
  onAddLogoField
}: AssetPickerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"background" | "logo">("logo");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function pick(next: File | null, nextKind = kind) {
    setFile(next);
    setError("");
    if (next) {
      setKey(suggestAssetKey({ filename: next.name, kind: nextKind, taken: assets.map((a) => a.key) }));
    }
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = await uploadCertificateAsset({ file, key: key.trim(), kind });
      onUploaded(uploaded);
      setFile(null);
      setKey("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="asset-picker">
      <div className="asset-picker__upload">
        <label className="asset-picker__file">
          <span className="asset-picker__file-label">Choose a PNG, JPEG or SVG</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />
        </label>

        <Select
          id="asset-kind"
          label="What is it?"
          value={kind}
          options={KIND_OPTIONS}
          onChange={(next) => {
            const chosen = next as "background" | "logo";
            setKind(chosen);
            if (file) pick(file, chosen);
          }}
        />

        <Input
          id="asset-key"
          label="Name it"
          value={key}
          placeholder="logo-techher-v1"
          hint="Lowercase and hyphens. Artwork is never replaced, so a new version of a picture needs a new name, and this box already suggests a free one."
          onChange={(event) => setKey(event.target.value)}
        />

        {error ? <p className="asset-picker__error">{error}</p> : null}

        <Button onClick={() => void upload()} disabled={!file || !key.trim()} loading={busy}>
          Upload
        </Button>
      </div>

      <ul className="asset-picker__list">
        {assets.length === 0 ? (
          <li className="asset-picker__empty">Nothing uploaded yet.</li>
        ) : (
          assets.map((asset) => (
            <li key={asset.key} className="asset-picker__item">
              <div className="asset-picker__item-meta">
                <span className="asset-picker__item-key">{asset.key}</span>
                <span className="asset-picker__item-size">
                  {asset.width}×{asset.height} · {Math.round(asset.byteSize / 1024)} KB
                </span>
              </div>
              <div className="asset-picker__item-actions">
                {asset.key === backgroundKey ? (
                  <Badge variant="success">Background</Badge>
                ) : asset.kind === "background" ? (
                  <Button variant="ghost" onClick={() => onUseAsBackground(asset)}>
                    Use as background
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => onAddLogoField(asset)}>
                    Place on certificate
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
