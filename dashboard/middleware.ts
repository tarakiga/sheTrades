import { NextResponse, type NextRequest } from "next/server";

import {
  developmentOnlyRoutesEnabled,
  isDevelopmentOnlyPath,
  parseAdminHosts,
  surfaceForHost,
  verdictForPublicRequest
} from "./lib/hosts";

/**
 * Splits this deployment into two surfaces by hostname.
 *
 * `admin.shetrades.digital` (and anything else named in ADMIN_HOSTS) serves the
 * operator console. Every other hostname serves ONLY the public documents: the
 * privacy policy and certificate verification pages. The bot mails the policy
 * URL to every participant, so the console must not be reachable beside it.
 *
 * Read once at module scope: middleware runs on every request and the setting
 * cannot change without a redeploy anyway. The decision itself lives in
 * `lib/hosts.ts`, which is pure and unit-tested.
 */
const ADMIN_HOSTS = parseAdminHosts(process.env.ADMIN_HOSTS);

const DEVELOPMENT_ROUTES_ENABLED = developmentOnlyRoutesEnabled({
  nodeEnv: process.env.NODE_ENV,
  flag: process.env.ENABLE_COMPONENT_PREVIEWS
});

export function middleware(request: NextRequest): NextResponse {
  // Checked before the host split, because this one is not about who is asking.
  // The component workshop's markup is server-rendered inline, so it reaches an
  // unauthenticated caller through the RSC payload even when the client-side
  // gate refuses to display it. The only complete answer is not serving it.
  if (!DEVELOPMENT_ROUTES_ENABLED && isDevelopmentOnlyPath(request.nextUrl.pathname)) {
    return notFound();
  }

  if (surfaceForHost(request.headers.get("host"), ADMIN_HOSTS) === "admin") {
    return NextResponse.next();
  }

  const verdict = verdictForPublicRequest(request.nextUrl.pathname);

  if (verdict.action === "allow") {
    return NextResponse.next();
  }

  if (verdict.action === "redirect") {
    const destination = request.nextUrl.clone();
    destination.pathname = verdict.to;
    destination.search = "";
    return NextResponse.redirect(destination);
  }

  return notFound();
}

/**
 * A plain 404, deliberately: rendering the console's own not-found page would
 * ship its chunks and branding, and a redirect would name the admin hostname in
 * the Location header. Neither is something a participant should receive.
 */
function notFound(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex"
    }
  });
}

export const config = {
  // Everything except the static assets the policy page itself needs to render.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
