# Completion Certificates — Design Spec

- **Status:** Approved in conversation — pending user review of this written spec, then implementation plan.
- **Date:** 2026-08-18
- **Owner:** AI Coding Agent

## 1. Background and goals

Learners who finish every module currently receive a milestone airtime payment and
nothing else. There is no artefact they can keep, show an employer, present with a
loan application, or post to WhatsApp Status. This spec adds a completion
certificate: an image delivered into the learner's WhatsApp chat, backed by a
public verification page.

The detection half already exists. `countCompletedModules()` in
`backend/src/rewards/milestones.ts` returns `{ completedModules, totalModules }`
and is already wired into the `module_completed` event that pays milestone
rewards. It is deliberately careful — a module counts only when *every* published
lesson in it is complete, and a module with zero lessons never counts, so a
half-authored module cannot trigger "all modules" early. Certificates hang off the
same signal.

Lesson completion already implies quiz engagement: a lesson is only added to
`completedLessons` after the learner works through its quiz. This is not a
"scrolled to the end" certificate.

### Goals

1. Issue one certificate per learner, automatically, the moment they complete every module.
2. Deliver it as an image in WhatsApp — instantly viewable, forwardable, postable to Status.
3. Make it verifiable by a third party without exposing anything beyond name, programme and date.
4. Keep every visible string and every layout value in config, per the project's zero-hardcoding directive.
5. Give admins a way to correct, revoke, resend and manually issue.

### Non-goals (v1)

- PDF output. Image only; revisit if TechHer reports employers asking for print.
- Bulk/backfill issuing for historical learners (admins can issue manually).
- Multiple concurrent templates or per-cohort designs. One active template.
- Certificate expiry or renewal.

## 2. Decisions and rationale

| Decision | Choice | Why |
|---|---|---|
| Delivery | Image in chat + verify link | Viewable with no data cost or extra tap, forwardable, and postable to Status — free reach for TechHer. The link answers "is this real?" without the learner needing a browser to see their own certificate. |
| Name accuracy | Confirm at issue time | The stored name is self-entered during onboarding and is often a nickname or typo. A certificate reading "mummy blessing" is useless for a job application, and every fix would otherwise become a TechHer support request. |
| Verify page contents | Name, programme, date, issuer | Enough for an employer to trust it. Never the phone number, location, or quiz scores — a woman's performance record must not sit on an open URL. |
| Public ID | 32-char random base32 | Unguessable, so certificates cannot be enumerated. |
| Rendering | Designer artwork + `sharp` compositing | ~50ms and tens of MB of dependency, versus ~300MB of Chromium and multi-second cold starts for an HTML/CSS renderer. Visual ceiling is the artwork, which is the part worth controlling anyway. |
| Menu entry | "My Certificate", shown only once earned | A permanently visible entry reads as a promise to someone on lesson 2, and tapping it would produce a locked door. Appearing on completion makes it a reward. |
| Logo as a positioned variable | Not baked into the artwork | Partner logos (TechHer, SheTrades, ITC) change independently of the design. Baked in, a partner rebrand means re-exporting the whole background; as a variable it is a file swap and a republish. |
| Background asset storage | Postgres bytes, size-capped | Avoids adding a GCS bucket, IAM policy and CORS config for a handful of images. Graduate to a bucket if a template gallery is ever wanted. |
| Phasing | Issuing first, canvas editor second | The editor authors the same config document the renderer reads, so building it second costs nothing extra — and certificates work while the design is still being refined. |

## 3. Architecture overview

```
  learner passes final quiz of final module
              │
              ▼
   module_completed  ──►  countCompletedModules()        (exists today)
              │              completedModules === totalModules > 0
              ▼
   certificate eligible? ──► confirm-name exchange ──► issue
                                                        │
                        ┌───────────────────────────────┤
                        ▼                               ▼
             certificates row (snapshot)      WhatsApp image send
                        │                     image: { link: <png route> }
                        ▼
        GET /c/:publicId       (verify page, public)
        GET /c/:publicId.png   (render, public — also the URL Meta fetches)
                        ▲
                        │ reads
          certificate.template config document
          (artwork + logo refs, normalised field positions)
```

Meta's Cloud API accepts `image: { link }` and fetches the file itself, so there
is no media-upload pipeline: the same route serves browsers and Meta.

## 4. Data model

### `certificates`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `public_id` | text UNIQUE | 32-char base32, CSPRNG. Appears in the URL. |
| `user_id` | uuid UNIQUE → users | One certificate per learner. |
| `learner_name` | text | **Snapshot** of the confirmed name. |
| `programme_name` | text | **Snapshot** of the programme title. |
| `modules_completed` | int | **Snapshot**. |
| `total_modules` | int | **Snapshot**. |
| `issued_at` | timestamptz | Printed on the certificate. |
| `revoked_at` | timestamptz NULL | |
| `revoked_reason` | text NULL | |
| `revoked_by` | text NULL | admin id |
| `template_key` | text | Which template document produced it. |
| `template_version` | int | Which published version. |
| `created_at` / `updated_at` | timestamptz | |

Indexes: unique on `public_id`, unique on `user_id`, index on `issued_at`.

### `certificate_assets`

Holds uploaded imagery — background artwork **and** logos, which are the same kind
of thing to the renderer. Kept separate from `certificates` so template versions
can share or retain assets independently of issued rows.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `key` | text UNIQUE | referenced from the template document |
| `kind` | text | `background` or `logo` — drives validation defaults |
| `mime_type` | text | `image/png`, `image/jpeg`, or `image/svg+xml` for logos |
| `bytes` | bytea | size-capped at 5 MB, enforced server-side |
| `width` / `height` | int | recorded at upload; needed to denormalise coordinates and preserve logo aspect ratio |
| `checksum` | text | sha256, for change detection |
| `uploaded_by` / `uploaded_at` | text / timestamptz | audit |

### The snapshot rule

**Everything printed on a certificate is copied into the row at issue time, never
computed at render time.** If TechHer adds two modules next year and the renderer
computed completion live, every certificate ever issued would silently change from
"completed 5 of 5" to "5 of 7" — turning thousands of valid credentials into
apparent failures. The certificate records what was true on the day it was earned.

The same reasoning applies to `template_version`: an issued certificate keeps
rendering with the template it was issued under, so republishing a redesign does
not retroactively alter certificates already in learners' hands. Admins who *want*
old certificates restyled can bulk re-render explicitly.

Learner renames are an admin edit to `learner_name`, keeping the same `public_id`
— by then the learner has already shared that link, and a typo fix must not break
it. The edit is audit-logged.

## 5. API contracts

### Public (no auth)

```
GET /c/:publicId
  200 text/html   verification page
  404             unknown id (identical response for revoked-but-unknown vs
                  never-existed, so ids cannot be probed)

GET /c/:publicId.png
  200 image/png   Cache-Control: public, max-age=86400
  404             unknown id
```

The verify page renders: learner name, programme name, issue date, issuing
organisation, and a clear "This certificate has been revoked" state when
`revoked_at` is set. It never emits phone number, location, scores, or user id.

### Admin (JWT + role guard, existing pattern)

```
GET    /api/admin/certificates                 list + filters (status, date, search)
GET    /api/admin/certificates/:id             detail
PATCH  /api/admin/certificates/:id             { learnerName }        → re-render
POST   /api/admin/certificates/:id/revoke      { reason }
POST   /api/admin/certificates/:id/unrevoke
POST   /api/admin/certificates/:id/resend      re-send to WhatsApp
POST   /api/admin/certificates                 { userId, learnerName } manual issue
POST   /api/admin/certificate-assets           multipart upload → { key }   [PHASE 2]
```

All mutations write to the existing admin audit log.

The asset upload endpoint is contracted here but lands in Phase 2 with the editor
that needs it. In Phase 1 the background and logo assets are loaded by a seed
script from files in the repo, matching how lessons, prompts and branding are
already seeded — so Phase 1 has no dependency on the upload UI existing.

### Learner detail (existing endpoint, extended)

The `/users` drawer payload gains a `certificate` block — `publicId`, `issuedAt`,
`revokedAt`, `learnerName` — so the drawer can show status and a verify link.
Absent when the learner has no certificate.

## 6. Bot flow

New conversation states: `awaiting_certificate_confirm`, `awaiting_certificate_name`.

```
module_completed
  └─ completedModules === totalModules > 0, and no certificate row
       └─ "🎉 You've completed every module!
           Your certificate will say: <stored name>
           Is that correct?"          [Yes, that's right] [Change name]
            ├─ Yes           → issue
            └─ Change name   → "What name should appear on your certificate?"
                                 → sanitise → issue
```

Issuing = insert row, then send image by link plus the verify URL.

**Main menu** gains a sixth row, `bot.certificate.menu_label`, rendered **only**
when the learner has a certificate or is eligible for one. Tapping it re-sends an
issued certificate, or resumes the confirm step if they never answered.

This recovery path is load-bearing. A learner who ignores the prompt has still
earned the certificate, and the far more common case is losing the image in a busy
chat months later.

### Name sanitisation

- Trim; reject empty after trimming.
- Cap at 60 characters, failing politely with config-driven copy rather than overflowing the artwork.
- Strip control characters and zero-width characters.
- XML-escape at the render boundary (see §8).
- **No auto-title-casing.** Nigerian names carry legitimate irregular casing, and "correcting" `chukwuEMEKA` would be confidently wrong.

### Message cost

The send happens in direct response to the learner's own quiz answer, so it falls
inside the 24-hour service window: free until 1 Oct 2026, roughly ₦1.54 per
learner after.

## 7. Configuration documents

Per the zero-hardcoding directive, everything visible is config with
draft/publish, version history and rollback.

### `certificate.template` (new document type)

```jsonc
{
  "enabled": false,                    // ships dark; switched on when artwork is signed off
  "programmeName": "SheTrades Digital Skills Programme",
  "issuerName": "TechHer",
  "assetKey": "cert-bg-v3",            // background → certificate_assets.key
  "canvas": { "width": 2000, "height": 1414 },
  "fields": [
    {
      "id": "learner-name",
      "variable": "learnerName",       // learnerName | programmeName | issuedDate
                                       // | certificateId | qrCode | logo
      "x": 0.5, "y": 0.52,             // NORMALISED 0..1, never pixels
      "maxWidth": 0.7,
      "align": "center",
      "font": "Playfair Display",
      "size": 0.06,                    // size normalised to canvas height
      "weight": 600, "color": "#1a1a1a",
      "autoShrink": true
    },
    {
      "id": "techher-logo",
      "variable": "logo",
      "assetKey": "logo-techher",      // each logo field names its own asset
      "x": 0.12, "y": 0.14,
      "width": 0.18,                   // height derived from the asset's aspect ratio
      "align": "left",
      "opacity": 1
    }
  ]
}
```

**Coordinates are normalised, never pixels.** A template authored against an
800px-wide preview must render identically at print resolution; storing pixels
produces an off-by-a-bit bug that presents as "the name looks slightly wrong" and
is miserable to diagnose.

Logo fields are repeatable — several partner marks can be placed independently,
each pointing at its own asset, so one partner's rebrand touches one field.

### `bot.certificate.*` (option set, localised)

Congratulation copy, confirm-name prompt, button labels, change-name prompt,
name-too-long error, resend copy, menu label. Localised like all bot copy, and
subject to the existing WhatsApp length constraints (24-char button titles).

## 8. Rendering pipeline

1. Load `certificates` row → gives the snapshot values and `template_version`.
2. Load that published template version and its `certificate_assets` rows (background + any logos).
3. Denormalise field coordinates against the background's real dimensions.
4. Build the composite layer list: logo images (scaled to `width`, aspect preserved) plus one SVG text layer; the QR is generated as SVG from the verify URL.
5. `sharp(background).composite([...logos, svgLayer]).png()`.
6. Serve with a long `Cache-Control`.

Nothing is written to a bucket: the row plus the template *is* the certificate,
and the PNG is only a view of it.

**Auto-shrink:** a field with `autoShrink` reduces font size until the text fits
`maxWidth`, down to a floor. Long names ("Oluwafunmilayo Adebayo-Ogundimu") must
degrade gracefully rather than collide with the border.

**Fonts** are embedded in the repo and referenced by absolute path so rendering is
deterministic across Cloud Run revisions. A font resolved from the OS would render
differently after a base-image bump.

**XML escaping is mandatory.** The learner-supplied name is injected into an SVG
text layer, and SVG is XML — a name containing `</text>` breaks the render, and
worse is possible. This is the one place hostile input reaches a parser.

**SVG logos are rasterised before compositing**, not inlined into the text layer,
so a hand-authored SVG cannot inject elements into the layer carrying learner
data.

## 9. Phase 2 — canvas template editor

A `/certificates` dashboard page: upload a background, drag labelled boxes onto
it, save. The editor is purely an authoring surface for the `certificate.template`
document defined in §7, so it inherits draft/publish, version history, audit and
rollback with no new storage concepts.

- Boxes bind to the variable list in §7 and carry font, size, weight, colour, alignment; logo boxes carry an asset picker and preserve aspect ratio while resizing.
- Drag updates normalised coordinates.
- **The preview must be the server's render, not the browser's.** A drag-and-drop editor naturally previews with HTML/CSS, but certificates are drawn by `sharp` — different font metrics and kerning. They would disagree by a few pixels, the browser version would be signed off, and issued certificates would be subtly wrong. On drop (not during drag), fetch the real rendered PNG and display that. What is approved is what learners receive.
- `maxWidth` renders as a visible boundary box so the constraint is apparent while designing.
- Keyboard nudging (arrow keys) alongside dragging, for accessibility and precision.
- Sample data selector, including a deliberately long name, to test overflow before publishing.

Upload validation: MIME allowlist (`image/png`, `image/jpeg`, plus `image/svg+xml`
for logos), 5 MB cap, minimum dimensions, dimensions recorded for denormalisation.

## 10. Failure handling

**The row is created before the send.** If the WhatsApp send fails, the
certificate still exists and the menu entry plus admin resend recover it. The
reverse order would let a network blip erase something a learner spent weeks
earning.

| Failure | Behaviour |
|---|---|
| Meta cannot fetch the image URL (cold start, 5xx) | Send fails, row persists; learner recovers via "My Certificate", admin via Resend. Image route kept cheap to minimise this. |
| Render throws (bad template, missing asset) | 500 on the png route with a logged reason; verify page still works, so the certificate is not "lost". Admin sees a broken-template warning. |
| Concurrent `module_completed` events | Unique on `user_id` makes double-issue impossible; insert conflict is treated as already-issued. |
| Learner never answers the confirm prompt | No row yet, but they remain eligible; "My Certificate" resumes the exchange. |
| Template republished after issue | Old certificates keep rendering under `template_version`; unaffected. |
| Curriculum grows after issue | Snapshot columns keep the original counts; no re-issue. |

## 11. Security and privacy

- `public_id` is CSPRNG base32, long enough that enumeration is impractical; unknown and revoked-unknown return identical 404s.
- Public routes expose only name, programme, date, issuer, revocation state.
- Public routes are rate-limited (reuse the existing throttle store pattern).
- Admin routes sit behind the existing JWT + role guard; all mutations audit-logged.
- Uploaded assets are MIME-allowlisted and size-capped; served with
  `Content-Type` from the allowlist and `X-Content-Type-Options: nosniff` so an
  uploaded file cannot be coerced into executing as something else.
- Learner-supplied name is XML-escaped before reaching the SVG layer.

## 12. Testing

**Pure units:** eligibility predicate, name sanitisation (including the 60-char
boundary, control characters, and the no-title-casing rule), `public_id`
generation shape and uniqueness, snapshot assembly, coordinate denormalisation,
logo aspect-ratio maths, auto-shrink descent.

**Rendering:** asserts on escaping (a name containing `</text>` and `&` renders
safely), output dimensions, logo placement maths, and that a missing asset fails
loudly rather than producing a blank image. Deliberately **not** golden-image
comparison — those break on every font update and train people to re-bless diffs
without looking.

**Routes:** unknown id → 404; revoked → revoked state; response body asserted to
contain no phone number, location, score or user id; admin routes reject
unauthenticated and wrong-role callers; asset upload rejects oversized files and
disallowed MIME types.

**Bot flow:** confirm path, change-name path, name-too-long path, re-send of an
already-issued certificate, and idempotency under a replayed `module_completed`.

**Staging e2e:** complete every module on the sandbox number and confirm the image
arrives, the verify page loads, and the /users drawer shows the link.

## 13. Implementation order

Each phase gets its own implementation plan. Phase 1 stands alone — certificates
are fully issuable, verifiable and administrable without Phase 2 ever landing.

Phase 1 (issuing):
1. Schema + migration + bootstrap mirror for `certificates` and `certificate_assets`, plus a seed script that loads the background and logo files.
2. Pure core: eligibility, sanitisation, id generation, snapshot builder, coordinate and aspect-ratio maths.
3. Render pipeline + public routes.
4. Bot flow: confirm exchange, issuing, conditional menu row.
5. Config documents + seeds (`certificate.template`, `bot.certificate.*`).
6. Admin routes + Certificates table + /users drawer link.
7. Tests, deploy, staging e2e, docs.

Phase 2 (authoring):
8. Asset upload endpoint + validation.
9. `/certificates` canvas editor with server-render preview.
10. Tests, deploy, docs, handover guide for TechHer.
