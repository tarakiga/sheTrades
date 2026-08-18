# Completion Certificates — Phase 2 Implementation Plan

> **For agentic workers:** the spec is `docs/superpowers/specs/2026-08-18-certificates-design.md` §9.
> Phase 1 shipped and is live; this plan adds the authoring surface on top of it.

**Goal:** give an admin a `/certificates/template` canvas where they upload artwork,
drag labelled fields onto it, preview the **server's** render, and publish — with no
code change, no re-seed and no curl.

**Architecture:** the editor is purely an authoring surface for the existing
`certificate.template` config document (namespace `integration`, type
`integration_config`). It writes drafts and publishes through
`ConfigPlatformService`, so it inherits draft/publish, version history, audit and
rollback with no new storage concepts. Artwork goes to the existing
`certificate_assets` table through a new upload route.

**Tech Stack:** Express 5 + zod + sharp + Prisma (backend); Next 16 + React 19
(dashboard). No new dependencies.

---

## Decisions taken before writing code

**Upload is a raw body, not multipart.** The spec says "multipart upload". Express 5
ships `express.raw()` and the dashboard sends a `File` straight as the request body;
multipart would mean adding `multer` to parse a single part. The substance the spec
asks for — MIME allowlist, size cap, minimum dimensions, dimensions recorded — is
unchanged. Deviation noted here rather than silently.

**The declared Content-Type is not trusted.** It is checked against the allowlist,
and then `sharp().metadata()` must independently agree on the format. A PNG header on
a file that decodes as something else is rejected.

**Asset keys stay immutable.** `assets.ts` documents why: an issued certificate
freezes its template, and the snapshot stores asset *keys*, not bytes. So the upload
route **refuses to overwrite an existing key** (409). The UI suggests the next free
`-vN` suffix instead. This is the single property Phase 2 could most easily destroy.

**The preview is the server's render, downscaled for transport.** The editor never
draws text with HTML/CSS. On drop (not during drag) it POSTs the working payload to a
preview endpoint that runs the real `renderCertificatePng` and returns a PNG resized
to fit a display box. Resizing the finished raster does not change layout, so what is
approved is what learners receive.

**Sample learners come from the backend.** Including the deliberately long name used
to test overflow, so the frontend holds no hardcoded content.

---

## File structure

**Backend — new**

| File | Responsibility |
|---|---|
| `src/certificates/asset-upload.ts` | Pure validation: key format, MIME allowlist, size cap, per-kind minimum dimensions. No I/O. |
| `src/certificates/asset-upload.test.ts` | Unit tests for the above. |
| `src/certificates/template-starter.ts` | Pure builder for a minimal valid template over a freshly uploaded background. |
| `src/certificates/preview-samples.ts` | The sample learner rows, one deliberately long. |
| `src/certificates/routes-assets.ts` | `GET`/`POST` `/api/admin/certificate-assets`, `GET /:key/raw`. |
| `src/certificates/routes-template.ts` | Template document endpoints: status, enabled, draft, publish, history, rollback, create, preview, samples. |
| `src/certificates/routes-assets.test.ts`, `routes-template.test.ts` | Route tests behind the auth guard. |

**Backend — modified**

- `src/certificates/routes-admin.ts` — the template block moves out to
  `routes-template.ts`; this file keeps only issued-certificate administration.
- `src/index.ts` — mount the asset router.

**Dashboard — new**

| File | Responsibility |
|---|---|
| `lib/certificates/geometry.ts` | Pure: normalised ↔ pixel, clamp, nudge steps, aspect-derived height. |
| `lib/admin/certificate-template.ts` | API client for the template and asset endpoints. |
| `components/certificates/TemplateCanvas.tsx` | The drag surface. |
| `components/certificates/FieldInspector.tsx` | Per-variant property controls. |
| `components/certificates/AssetPicker.tsx` | List + upload artwork. |
| `components/certificates/TemplatePreviewPanel.tsx` | Server-rendered PNG + sample selector. |
| `components/certificates/TemplateEditor.tsx` | Orchestrator: state, save, publish, history. |
| `app/(admin)/certificates/template/page.tsx` | The route. |
| `app/previews/components/CertificateTemplateEditorPreview.tsx` | Workshop entry. |

**Dashboard — modified**

- `app/(admin)/certificates/page.tsx` — link to the editor.
- `app/globals.css` — tokenised styles for the new surfaces.

---

## Tasks

### CERT-P2-1 — asset upload validation core

`asset-upload.ts` exports `ALLOWED_ASSET_MIME`, `MAX_ASSET_BYTES` (5 MiB),
`assetKeyPattern`, and `validateAssetUpload({ key, kind, declaredMime, byteLength,
detectedFormat, width, height })` returning `{ ok: true }` or `{ ok: false, reason }`.

Minimums: background 800×600, logo 32×32. A background smaller than the artwork it
replaces would upscale into a blurred credential; a 4-pixel logo is a mistake, not a
design.

Tests: each rejection reason fires; a good PNG passes; a JPEG declared as PNG is
rejected; a 5 MiB + 1 byte file is rejected; key `Cert_BG` is rejected and
`cert-bg-v2` accepted.

### CERT-P2-2 — asset routes

- `GET /api/admin/certificate-assets` → `[{ key, kind, mimeType, width, height, byteSize, uploadedBy, uploadedAt }]`, never bytes.
- `POST /api/admin/certificate-assets?key=&kind=` with `express.raw` → 201 `{ key, kind, width, height, mimeType }`; 409 if the key exists; 400 on any validation failure. `requireRoles(["editor","admin"])`, audit-logged.
- `GET /api/admin/certificate-assets/:key/raw` → bytes, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=300`.

Tests: unauthenticated → 401; oversized → 400; disallowed MIME → 400; duplicate key → 409; list omits `bytes`.

### CERT-P2-3 — template document routes

Move the two existing endpoints, then add:

- `GET  /api/admin/certificates-template/draft` → `{ documentId, draftVersionId, draft, published, publishedVersion, updatedAt }`
- `PUT  /api/admin/certificates-template/draft` → validate with `certificateTemplatePayloadSchema`, then `updateDraft`
- `POST /api/admin/certificates-template/publish` → `publishDocument` + `refreshRuntimeConfigCache()`
- `GET  /api/admin/certificates-template/history` → versions + audit
- `POST /api/admin/certificates-template/rollback` → `rollbackDocument` + refresh
- `POST /api/admin/certificates-template` → create the document from `buildStarterTemplate` when none exists

Every asset key referenced by a payload must exist before the draft saves — a
dangling key renders as a thrown error on a learner's certificate, and the publish
boundary is where that is cheap to catch.

Tests: viewer role rejected on writes; invalid payload → 400 naming the field;
publish refreshes the runtime cache; unknown asset key → 400.

### CERT-P2-4 — server-render preview

- `GET  /api/admin/certificates-template/samples` → `[{ id, label, learnerName }]`
- `POST /api/admin/certificates-template/preview` `{ payload, sampleId }` → `image/png`

Renders via `renderCertificatePng` with `loadAssetFromDb`, then
`sharp().resize({ width: PREVIEW_WIDTH, fit: "inside" })`. A render failure returns
400 with the renderer's own message — those messages already name the missing asset.

Tests: a payload whose background is missing returns 400 naming it; a valid payload
returns a PNG whose width is the preview width.

### CERT-P2-5 — dashboard geometry + client

`geometry.ts`: `toPixels`, `toNormalised`, `clamp01`, `nudge(value, key, shift)`,
`imageBoxHeight(widthFraction, canvas, asset)`. Pure, no React.

### CERT-P2-6 — canvas

Background `<img>` from an authenticated blob URL, absolutely positioned boxes per
field. Pointer drag updates normalised coordinates; arrow keys nudge (shift = coarse);
each text box draws its `maxWidth` boundary; image boxes keep the asset's aspect
ratio. Selection is keyboard reachable (`role="button"`, `tabIndex=0`).

### CERT-P2-7 — inspector + assets

The inspector shows only the properties the selected variant actually has, mirroring
the discriminated union — a `format` control on a certificate id would be config that
looks like it does something and does not.

### CERT-P2-8 — page

Loads the draft (or offers to create one), holds the working payload, saves on
demand, previews on drop, publishes with a note, lists versions and rolls back.

### CERT-P2-9 — styles and workshop entry

All new CSS in `globals.css` using existing tokens; no raw hex or px outside the token
layer. Workshop preview renders the canvas and inspector against a stub background so
the components are inspectable in isolation.

### CERT-P2-10 — verify and ship

`npm test -w @shetrades/backend`, dashboard `typecheck` + `build`, admin handover
guide in `docs/`, `task-list.md` and `handoff.md` updated, deploy, verify on staging.
