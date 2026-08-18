"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, ConfirmationModal, Input, SectionHeader } from "../ui";
import { AssetPicker } from "./AssetPicker";
import { FieldInspector } from "./FieldInspector";
import { TemplateCanvas } from "./TemplateCanvas";
import { TemplatePreviewPanel } from "./TemplatePreviewPanel";
import { slugify } from "../../lib/certificates/asset-key";
import { nudgeAnchor, type NudgeDirection } from "../../lib/certificates/geometry";
import {
  createTemplate,
  fetchAssetObjectUrl,
  getPreviewSamples,
  getTemplateDraft,
  getTemplateHistory,
  listCertificateAssets,
  publishTemplate,
  renderTemplatePreview,
  rollbackTemplate,
  saveTemplateDraft,
  type CertificateAsset,
  type CertificateTemplate,
  type ImageField,
  type PreviewSample,
  type TemplateField,
  type TemplateVersion
} from "../../lib/admin/certificate-template";

/**
 * The certificate template editor.
 *
 * It authors ONE config document — `certificate.template` in the `integration`
 * namespace — so everything it does inherits the config platform's
 * draft/publish workflow, version history, audit trail and rollback. There is
 * no separate template store, and nothing here writes anywhere the rest of the
 * platform cannot see.
 *
 * The screen is deliberately two panels. On the left, boxes you drag: they say
 * where a field is anchored and how much room it may use, and nothing more. On
 * the right, the server's own render of the working payload. Only the right
 * panel is the certificate. Previewing in the browser would mean approving one
 * image and issuing a slightly different one, which is the failure this
 * arrangement exists to prevent.
 */
export function TemplateEditor() {
  const [working, setWorking] = useState<CertificateTemplate | null>(null);
  const [exists, setExists] = useState<boolean | null>(null);
  const [draftVersionId, setDraftVersionId] = useState<string | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const [assets, setAssets] = useState<CertificateAsset[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [samples, setSamples] = useState<PreviewSample[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [history, setHistory] = useState<TemplateVersion[]>([]);
  const [rollbackTarget, setRollbackTarget] = useState<TemplateVersion | null>(null);

  const [changeSummary, setChangeSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Create-a-template form, shown only when no document exists yet.
  const [newProgramme, setNewProgramme] = useState("");
  const [newIssuer, setNewIssuer] = useState("");

  const assetSizes = useMemo(() => {
    const map: Record<string, { width: number; height: number }> = {};
    for (const asset of assets) map[asset.key] = { width: asset.width, height: asset.height };
    return map;
  }, [assets]);

  const selectedField = useMemo(
    () => working?.fields.find((field) => field.id === selectedFieldId) ?? null,
    [working, selectedFieldId]
  );

  // ------------------------------------------------------------------ load

  const loadAssets = useCallback(async () => {
    const response = await listCertificateAssets();
    setAssets(response.items);
    return response.items;
  }, []);

  const loadHistory = useCallback(async () => {
    const response = await getTemplateHistory();
    setHistory(response.versions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [draft, sampleList] = await Promise.all([getTemplateDraft(), getPreviewSamples()]);
        await loadAssets();
        if (cancelled) return;
        setSamples(sampleList.items);
        setSampleId(sampleList.items[0]?.id ?? "");
        if (!draft.exists) {
          setExists(false);
          return;
        }
        setExists(true);
        setDraftVersionId(draft.draftVersionId);
        setPublishedVersion(draft.publishedVersion);
        // The DRAFT is what an editor continues from; the published payload is
        // only the fallback for a document that has never been drafted since it
        // was published.
        setWorking(draft.draft ?? draft.published);
        await loadHistory();
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAssets, loadHistory]);

  // Background artwork, fetched with the admin token and handed to the document
  // as a blob because an <img src> cannot carry an Authorization header.
  const backgroundKey = working?.assetKey ?? null;
  useEffect(() => {
    if (!backgroundKey) return;
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      try {
        const url = await fetchAssetObjectUrl(backgroundKey);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setBackgroundUrl(url);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [backgroundKey]);

  // --------------------------------------------------------------- preview

  /** Guards against a slow render for an old payload landing after a fast one
   * for the current payload and overwriting it. */
  const previewRequestRef = useRef(0);

  const refreshPreview = useCallback(
    async (payload: CertificateTemplate | null, forSampleId: string) => {
      if (!payload) return;
      const requestId = previewRequestRef.current + 1;
      previewRequestRef.current = requestId;
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const url = await renderTemplatePreview(payload, forSampleId || undefined);
        if (previewRequestRef.current !== requestId) {
          URL.revokeObjectURL(url);
          return;
        }
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return url;
        });
      } catch (caught) {
        if (previewRequestRef.current !== requestId) return;
        setPreviewError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (previewRequestRef.current === requestId) setPreviewLoading(false);
      }
    },
    []
  );

  // The first render, once there is something to draw. Later refreshes are
  // driven by finished edits rather than by state changes, so a drag does not
  // fire one per frame.
  const primedRef = useRef(false);
  useEffect(() => {
    if (primedRef.current || !working || !sampleId) return;
    primedRef.current = true;
    void refreshPreview(working, sampleId);
  }, [working, sampleId, refreshPreview]);

  useEffect(() => {
    return () => {
      // Nothing else revokes the last preview when the page unmounts.
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, []);

  // ----------------------------------------------------------------- edits

  const mutate = useCallback((next: CertificateTemplate) => {
    setWorking(next);
    setDirty(true);
    setNotice("");
  }, []);

  const updateField = useCallback(
    (fieldId: string, patch: Partial<TemplateField>) => {
      setWorking((current) => {
        if (!current) return current;
        return {
          ...current,
          fields: current.fields.map((field) =>
            field.id === fieldId ? ({ ...field, ...patch } as TemplateField) : field
          )
        };
      });
      setDirty(true);
      setNotice("");
    },
    []
  );

  /**
   * An arrow-key nudge, applied against the CURRENT position rather than the
   * one the canvas last rendered.
   *
   * A drag can hand over absolute coordinates; a nudge is relative, and if it
   * were computed from a prop, two key presses landing in the same React tick
   * would both start from the same place and the second would undo the first.
   * Doing the arithmetic inside the updater is what makes held-down arrow keys
   * accumulate instead of fighting each other.
   */
  const nudgeField = useCallback(
    (fieldId: string, direction: NudgeDirection, coarse: boolean) => {
      setWorking((current) => {
        if (!current) return current;
        return {
          ...current,
          fields: current.fields.map((field) =>
            field.id === fieldId
              ? ({ ...field, ...nudgeAnchor({ x: field.x, y: field.y }, direction, coarse) } as TemplateField)
              : field
          )
        };
      });
      setDirty(true);
      setNotice("");
    },
    []
  );

  /** Called when an edit FINISHES — pointer up, blur, a select changing. The
   * render is a real sharp pass on the server, far too expensive to run on
   * every frame of a drag or every keystroke in a text box. */
  const commit = useCallback(() => {
    setWorking((current) => {
      void refreshPreview(current, sampleId);
      return current;
    });
  }, [refreshPreview, sampleId]);

  function addLogoField(asset: CertificateAsset) {
    if (!working) return;
    const base = `logo-${slugify(asset.key)}`;
    let id = base;
    for (let n = 2; working.fields.some((field) => field.id === id); n += 1) {
      id = `${base}-${n}`;
    }
    const field: ImageField = {
      id,
      variable: "logo",
      assetKey: asset.key,
      // Dropped in the top-left rather than centred: a new logo landing on top
      // of the learner's name looks like a bug, and a corner is somewhere an
      // admin can find it and drag it from.
      x: 0.05,
      y: 0.05,
      width: 0.12,
      align: "left",
      opacity: 1
    };
    mutate({ ...working, fields: [...working.fields, field] });
    setSelectedFieldId(id);
    commit();
  }

  function useAsBackground(asset: CertificateAsset) {
    if (!working) return;
    // The canvas takes the new artwork's real dimensions. Field coordinates are
    // normalised, so they follow the change instead of drifting — which is the
    // whole reason they are stored as fractions.
    mutate({
      ...working,
      assetKey: asset.key,
      canvas: { width: asset.width, height: asset.height }
    });
    commit();
  }

  function removeSelectedField() {
    if (!working || !selectedFieldId) return;
    mutate({ ...working, fields: working.fields.filter((f) => f.id !== selectedFieldId) });
    setSelectedFieldId(null);
    commit();
  }

  // ------------------------------------------------------------- persisting

  async function withBusy(work: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await work());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function saveDraft() {
    if (!working) return;
    void withBusy(async () => {
      const saved = await saveTemplateDraft(working, changeSummary.trim() || undefined);
      setDraftVersionId(saved.draftVersionId);
      setDirty(false);
      await loadHistory();
      return "Draft saved. Nothing has changed for learners until it is published.";
    });
  }

  function publish() {
    if (!draftVersionId) return;
    void withBusy(async () => {
      const published = await publishTemplate(draftVersionId, changeSummary.trim() || undefined);
      setPublishedVersion(published.versionNumber);
      setChangeSummary("");
      const refreshed = await getTemplateDraft();
      if (refreshed.exists) setDraftVersionId(refreshed.draftVersionId);
      await loadHistory();
      return `Published as version ${published.versionNumber}. New certificates will use this design.`;
    });
  }

  function doRollback(version: TemplateVersion) {
    void withBusy(async () => {
      const result = await rollbackTemplate(version.id, `Rolled back to v${version.versionNumber}`);
      const refreshed = await getTemplateDraft();
      if (refreshed.exists) {
        setWorking(refreshed.draft ?? refreshed.published);
        setDraftVersionId(refreshed.draftVersionId);
        setPublishedVersion(refreshed.publishedVersion);
      }
      setDirty(false);
      await loadHistory();
      return `Rolled back. Version ${result.versionNumber} is live.`;
    });
  }

  function create(asset: CertificateAsset) {
    void withBusy(async () => {
      const created = await createTemplate({
        assetKey: asset.key,
        programmeName: newProgramme.trim(),
        issuerName: newIssuer.trim()
      });
      setExists(true);
      setWorking(created.draft);
      const refreshed = await getTemplateDraft();
      if (refreshed.exists) setDraftVersionId(refreshed.draftVersionId);
      await loadHistory();
      return "Template created. Drag the fields where you want them, then publish.";
    });
  }

  // ------------------------------------------------------------------- view

  if (exists === null) {
    return (
      <Card title="Certificate design" description="Loading…">
        <div className="template-editor__placeholder" />
      </Card>
    );
  }

  if (exists === false) {
    const backgrounds = assets.filter((asset) => asset.kind === "background");
    return (
      <Card
        title="Start a certificate design"
        description="Upload the artwork, then name the programme it certifies."
      >
        <div className="template-editor__create">
          <AssetPicker
            assets={assets}
            backgroundKey={null}
            onUploaded={() => void loadAssets()}
            onUseAsBackground={create}
            onAddLogoField={() => undefined}
          />
          <div className="template-editor__create-fields">
            <Input
              id="new-programme"
              label="Programme name"
              value={newProgramme}
              placeholder="SheTrades Digital Learning Programme"
              onChange={(event) => setNewProgramme(event.target.value)}
            />
            <Input
              id="new-issuer"
              label="Issued by"
              value={newIssuer}
              placeholder="TechHer"
              onChange={(event) => setNewIssuer(event.target.value)}
            />
            <p className="template-editor__hint">
              {backgrounds.length === 0
                ? "Upload a background above to continue."
                : 'Fill both in, then choose "Use as background" on the artwork you want.'}
            </p>
            {error ? <p className="template-editor__error">{error}</p> : null}
          </div>
        </div>
      </Card>
    );
  }

  if (!working) {
    return (
      <Card title="Certificate design" description="This template could not be read.">
        <p className="template-editor__error">
          {error || "The stored template does not match the shape the editor understands."}
        </p>
      </Card>
    );
  }

  return (
    <>
      <SectionHeader
        title="Certificate design"
        description="Drag each field where it belongs. The preview beside the canvas is the server's own render, so what you approve here is what a learner receives."
      />

      <div className="template-editor__status">
        <Badge variant={working.enabled ? "success" : "warning"}>
          {working.enabled ? "Issuing is on" : "Issuing is off"}
        </Badge>
        <span>
          {publishedVersion ? `Published version ${publishedVersion}` : "Never published"}
          {dirty ? " · unsaved changes" : ""}
        </span>
      </div>

      {error ? <p className="template-editor__error">{error}</p> : null}
      {notice ? <p className="template-editor__notice">{notice}</p> : null}

      <div className="template-editor__workspace">
        <Card title="Layout">
          <TemplateCanvas
            template={working}
            backgroundUrl={backgroundUrl}
            assetSizes={assetSizes}
            selectedFieldId={selectedFieldId}
            onSelect={setSelectedFieldId}
            onMove={(fieldId, anchor) => updateField(fieldId, anchor as Partial<TemplateField>)}
            onNudge={nudgeField}
            onMoveEnd={commit}
          />
        </Card>

        <Card title="Preview">
          <TemplatePreviewPanel
            previewUrl={previewUrl}
            loading={previewLoading}
            error={previewError}
            samples={samples}
            sampleId={sampleId}
            onSampleChange={(next) => {
              setSampleId(next);
              void refreshPreview(working, next);
            }}
            onRefresh={() => void refreshPreview(working, sampleId)}
          />
        </Card>
      </div>

      <Card title="Selected field">
        <FieldInspector
          field={selectedField}
          assets={assets}
          onChange={(patch) => {
            if (selectedFieldId) updateField(selectedFieldId, patch);
          }}
          onRemove={removeSelectedField}
          onCommit={commit}
        />
      </Card>

      <Card title="Wording" description="What the certificate says about the programme itself.">
        <div className="template-editor__grid">
          <Input
            id="template-programme"
            label="Programme name"
            value={working.programmeName}
            onChange={(event) => mutate({ ...working, programmeName: event.target.value })}
            onBlur={commit}
          />
          <Input
            id="template-issuer"
            label="Issued by"
            value={working.issuerName}
            hint="Shown on the verification page, and read live rather than frozen, so correcting it fixes every certificate at once."
            onChange={(event) => mutate({ ...working, issuerName: event.target.value })}
            onBlur={commit}
          />
        </div>
      </Card>

      <Card
        title="Artwork"
        description="Uploaded artwork is never replaced. A new version of a picture gets a new name, because certificates already issued still point at the old one."
      >
        <AssetPicker
          assets={assets}
          backgroundKey={working.assetKey}
          onUploaded={() => void loadAssets()}
          onUseAsBackground={useAsBackground}
          onAddLogoField={addLogoField}
        />
      </Card>

      <Card
        title="Save and publish"
        description="A draft changes nothing for learners. Publishing makes this the design the next certificate is issued with."
      >
        <div className="template-editor__publish">
          <Input
            id="change-summary"
            label="What changed? (kept in the version history)"
            value={changeSummary}
            placeholder="Moved the name up, swapped the CARE logo"
            onChange={(event) => setChangeSummary(event.target.value)}
          />
          <div className="template-editor__publish-actions">
            <Button variant="secondary" onClick={saveDraft} loading={busy} disabled={!dirty}>
              Save draft
            </Button>
            <Button onClick={publish} loading={busy} disabled={!draftVersionId || dirty}>
              Publish
            </Button>
          </div>
          <p className="template-editor__hint">
            {dirty
              ? "Save the draft before publishing, so what goes live is what you are looking at."
              : draftVersionId
                ? "The saved draft is ready to publish."
                : "Nothing to publish: the live version and the draft are the same."}
          </p>
        </div>
      </Card>

      <Card title="History" description="Every published version, and the way back to it.">
        {history.length === 0 ? (
          <p className="template-editor__hint">No versions yet.</p>
        ) : (
          <ul className="template-editor__history">
            {history.map((version) => (
              <li key={version.id} className="template-editor__history-row">
                <div>
                  <span className="template-editor__history-version">v{version.versionNumber}</span>
                  <span className="template-editor__history-state">{version.state}</span>
                  <span className="template-editor__history-summary">
                    {version.changeSummary ?? "No note"}
                  </span>
                </div>
                <div className="template-editor__history-actions">
                  <span className="template-editor__history-when">
                    {new Date(version.publishedAt ?? version.createdAt).toLocaleString("en-GB")}
                  </span>
                  {version.state === "archived" ? (
                    <Button variant="ghost" onClick={() => setRollbackTarget(version)}>
                      Roll back to this
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmationModal
        open={Boolean(rollbackTarget)}
        title={`Roll back to version ${rollbackTarget?.versionNumber ?? ""}?`}
        description="This publishes the older design as a new version. Certificates already issued do not change: each one keeps the design it was issued under."
        confirmLabel="Roll back"
        loading={busy}
        onCancel={() => setRollbackTarget(null)}
        onConfirm={() => {
          const target = rollbackTarget;
          setRollbackTarget(null);
          if (target) doRollback(target);
        }}
      />
    </>
  );
}
