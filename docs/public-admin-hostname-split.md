# Public / admin hostname split

> **Cut over 2026-08-22.** Dashboard commit `37cb2c9`, backend revision
> `00124-w25`. The full host/path matrix, the apex redirect chain, both
> privacy footers, and the certificate proxy were verified against
> production. The steps below are kept as the record of what was done and
> what to repeat if the domain ever moves again.

The dashboard app serves two audiences from one deployment. This document
records why they were separated, what enforces the separation, and the order the
cutover has to happen in.

## The problem

The privacy policy lived at `/privacy` on the same hostname as the operator
console, and its footer linked to `/login`. The bot sends that policy URL to
**every participant** in the consent notice, so the console's address was being
published to the entire programme, with an invitation into its sign-in form
attached.

Three specific defects:

1. **The notice pointed at `she-trades.vercel.app/privacy`.** That both disclosed
   the console's hostname and trained participants to treat a `.vercel.app` link
   as a SheTrades link, which is exactly the habit that makes a phishing page
   work.
2. **The footer's only call to action was a staff sign-in**, shown to an audience
   that cannot use it. Resolved in both directions: the policy's footer is now a
   contact address, and the console's sign-in form no longer links to the policy
   at all. With no admin entry point left, `/privacy` stopped needing to read the
   request host and went back to being statically rendered.
3. **`/previews/components` was fully public.** The component workshop sits
   outside the `(admin)` route group, so it never inherited that group's auth
   gate; it rendered every admin workspace to anyone who knew the URL. The
   sample data in it is fabricated - the phone-shaped strings are SVG
   coordinates - so nothing leaked, but a pixel-accurate copy of the console is a
   ready-made template for a convincing fake login page. Nothing linked to it,
   which is why it went unnoticed.

None of this was an authorisation hole. The console's login was always
auth-gated and always would have been reachable at its own address. What changed
is that the address stopped being advertised to thousands of people.

## The topology

| Hostname                    | Surface | Serves                                      |
| --------------------------- | ------- | ------------------------------------------- |
| `admin.shetrades.digital`   | admin   | The whole console                           |
| `www.shetrades.digital`     | public  | `/privacy`, `/c/...`; everything else 404s   |
| `shetrades.digital`         | public  | Same (the apex 308s to `www`)                |
| `*.vercel.app`              | admin   | The whole console - see below                |
| `localhost`, `127.0.0.1`    | admin   | Local development                            |

`*.vercel.app` stays admin deliberately. Vercel serves every project on those
hostnames and they cannot be removed, so classifying them as public would only
mean the console is reachable at an address the middleware does not know about.
Treating them as admin also means a DNS mistake on the custom domain cannot lock
the team out of their own console. They are simply never advertised.

## What enforces it

**`dashboard/middleware.ts`** classifies each request by its `Host` header and,
on the public surface, allows only an explicit path allowlist. Everything else
gets a plain-text **404, never a redirect** - a redirect would name the admin
hostname in its `Location` header, which is the disclosure being prevented.

The decision itself is in **`dashboard/lib/hosts.ts`**, which is pure and unit
tested (`lib/hosts.test.ts`). Two properties worth keeping:

- **An unrecognised host is public.** An unset or wrong `ADMIN_HOSTS` degrades to
  "the split still holds", never to "the console is open again".
- **`ADMIN_HOSTS` entries may be bare hosts or full origins.** The neighbouring
  `BACKEND_CORS_ALLOWED_ORIGINS` takes origins, so somebody will paste
  `https://admin.shetrades.digital` here; unstripped that would parse to the host
  `https` and quietly publish the console on its own domain.

**The component workshop is absent from deployed builds.** Middleware 404s
`/previews` on every host unless `ENABLE_COMPONENT_PREVIEWS` says otherwise, and
that flag defaults off whenever `NODE_ENV` is `production` - which on Vercel is
every deployment.

An auth gate alone was not enough, and it is worth recording why. The real admin
pages authenticate before fetching anything, so their server-rendered shell is
empty and a client-side gate is sufficient. The workshop's content is static and
inline, so it lands in the RSC payload whatever the gate chooses to display:
`curl` read the whole component library out of a page that showed a sign-in
prompt in a browser. Nothing on the client can fix that. Not serving the route is
the only complete answer.

**`dashboard/app/previews/layout.tsx`** still adds the gate the workshop never
had. It covers the case the flag deliberately allows: a dev server running on a
shared network, where the route is enabled by design.

**The public path allowlist is deliberately not admin-editable config**, unlike
the content this platform manages. A route allowlist operators can extend is one
mis-click away from republishing the console. Adding a public document is a code
change and a review.

## Settings

| Variable               | Where          | Value                                |
| ---------------------- | -------------- | ------------------------------------ |
| `ADMIN_HOSTS`          | Vercel project | `admin.shetrades.digital`            |
| `ENABLE_COMPONENT_PREVIEWS` | Vercel project | Unset. `true` re-enables the workshop for a design review |
| `ADMIN_DASHBOARD_URL`  | Cloud Run      | `https://admin.shetrades.digital`    |
| `BACKEND_CORS_ALLOWED_ORIGINS` | Cloud Run | Admin host listed **first**       |

Both dashboard variables are read by Next.js middleware, which inlines them at
**build** time. Changing either in Vercel needs a redeploy, not just a save.

The admin host must be **first** in the CORS list because
`resolveAdminLoginUrl()` falls back to the first entry when
`ADMIN_DASHBOARD_URL` is unset, and an invite pointing at the public host would
land on a 404.

## Cutover order

The order matters. Deploying the dashboard before the admin domain resolves
takes the console off `www.shetrades.digital` while its replacement does not yet
exist - not a lockout, since `she-trades.vercel.app` still works, but disruptive.

1. **Add `admin.shetrades.digital` to the Vercel project** and create the DNS
   record it asks for. DNS for this domain is at Hostinger (nameservers
   `hermes.dns-parking.com` / `artemis.dns-parking.com`), so the record is
   created there, not in Vercel.
2. **Set `ADMIN_HOSTS=admin.shetrades.digital`** in the Vercel project settings,
   for every environment.
3. **Deploy the dashboard.** This is the moment `www` stops serving the console.
   Confirm `admin.shetrades.digital/login` renders and
   `www.shetrades.digital/login` 404s.
4. **Apply the Cloud Run env changes** (`ADMIN_DASHBOARD_URL` and the reordered
   CORS list). Update the two keys individually, **not** with
   `--env-vars-file cloudrun-staging-env.yaml`: that flag replaces the whole set,
   and four of this service's variables (`POSTGRES_URL`, `PAYOUTS_WORKER_TOKEN`,
   `WHATSAPP_SANDBOX_TOKEN`, `TOTP_ENCRYPTION_KEY`) are Secret Manager
   references that the yaml does not carry. The CORS value contains commas, so
   it needs gcloud's custom-delimiter form:

   ```
   gcloud run services update shetrades-backend-staging --region us-central1 \
     --update-env-vars "^@^ADMIN_DASHBOARD_URL=https://admin.shetrades.digital@BACKEND_CORS_ALLOWED_ORIGINS=<list>"
   ```

   Afterwards, confirm the secret-backed variables are still present before
   trusting the revision.
5. **Publish the invite URL change:**
   `npm run ops:retarget-config-urls -w @shetrades/backend -- --group admin-host --apply`
   (drop `--apply` first for a dry run).

**Operators will be signed out.** The session token lives in `localStorage`,
which is per-origin, so moving the console to a new hostname means everyone signs
in again once. Tell the team before, not after.

## Certificate URLs

`next.config.ts` proxies `/c/:path*` to the backend so a learner's certificate
link reads `shetrades.digital/c/<id>` rather than naming the Cloud Run service.

**`PUBLIC_BASE_URL` was flipped to `https://www.shetrades.digital` on
2026-08-22**, backend revision `00126-zbg`, after the first real certificate was
issued and fetched through the proxy byte-identically. The flip was deliberately
held until that test existed: the `.png` is the URL **Meta fetches** when sending
a certificate, so the proxy sits in the delivery path and a synthetic check would
not have proved it.

Links issued before the flip keep resolving - the backend still serves `/c/` on
its own hostname - so nothing already in a learner's hands breaks.

### Two consequences worth knowing

**The QR is baked into the rendered image, and the render is cached by
`(publicId, template)` - not by the base URL.** Changing the base does not
rewrite QR codes on images already rendered. Verified: after the flip the fresh
render was 780,802 bytes against the cached 780,860, the difference being the
shorter URL inside the QR. Harmless here because the only certificate predating
the flip is a test one, but a domain change made after real certificates exist
would leave their QR codes pointing at the old host until the cache turns over.

**Vercel's edge now caches certificate responses**, honouring the headers the
backend already sets: 5 minutes on the verification page, 24 hours on the PNG.
That split is deliberate and documented in `routes-public.ts` - revocation has to
reach a reader quickly, so the page carries the short cache and the heavy artefact
carries the long one. The CDN respects it, so revocation still surfaces within
five minutes. What changed is that the cache is now SHARED rather than
per-browser: the first reader after a revocation can now get up to five minutes
of staleness where previously a new reader always got a fresh response.

## Rollback

Remove `ADMIN_HOSTS` and redeploy: every custom domain reverts to public, the
console stays reachable on `*.vercel.app`. To restore the old behaviour
completely, delete `dashboard/middleware.ts`. The config publishes roll back
through the normal version history, like any other document.

## The operator handbook

The handbook used to live at `/handbook.html` in `dashboard/public/`, which meant
Vercel's CDN served twenty-one screenshots of the console to anyone who knew the
URL. The hostname split kept it off the public domain; on the admin domain it was
still an ungated static asset.

Middleware cannot gate it - the session token is in `localStorage`, unreadable
server-side, and a plain link cannot carry an Authorization header. So:

- The file moved to `dashboard/handbook/handbook.html`, outside `public/`, and is
  pulled into the deployed bundle by `outputFileTracingIncludes`.
- **`/api/handbook`** returns it only after forwarding the caller's bearer token
  to the backend's `/api/admin/auth/me`. The dashboard does not verify session
  tokens itself; the backend owns expiry, revocation, and suspended accounts, so
  asking it is the only check that stays right when an account is disabled
  mid-session. An unreachable backend fails CLOSED.
- **`/handbook`** is a gated page that fetches the document with the token and
  hands the bytes to an iframe as a blob URL. An iframe cannot set headers, which
  is why it cannot simply point at the protected route.

The page sits outside `(admin)` on purpose, so the document fills the window
instead of being squeezed into the sidebar shell.

**Size ceiling.** The document is served by a serverless function, whose response
body is capped at 4.5 MB, and base64 PNGs do not compress - the file size IS the
response size. It is 2.7 MB today. `docs/handoff/source/build.mjs` fails the build
above 4 MB rather than letting an operator discover it by clicking Help.

## Not covered

- **The public root has nowhere to go.** `www.shetrades.digital/` redirects to
  `/privacy` because the policy is the only public document. When there is a
  landing page, it takes that slot.
- **CORS no longer lists the public hosts.** Nothing on the public host calls the
  admin API - the privacy page reads its config server-side, verified against the
  live page - so `www.shetrades.digital` and the apex came out of
  `BACKEND_CORS_ALLOWED_ORIGINS`. A future public page that reads config from the
  BROWSER would need them added back.
