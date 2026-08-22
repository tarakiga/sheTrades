import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Serves the operator handbook to a signed-in admin.
 *
 * The document used to sit in `public/`, which means Vercel's CDN handed it to
 * anyone who knew the URL - and it is twenty-one screenshots of the console.
 * The hostname split kept it off the public domain, but on the admin domain it
 * was still a static asset with no gate in front of it.
 *
 * It cannot be gated by middleware, because the session token lives in
 * localStorage and is not readable server-side, and a plain link cannot carry an
 * Authorization header. So the file moved out of `public/` and reaches the
 * browser only through this route, which the handbook page calls with the
 * token in hand.
 */

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(
  /\/+$/,
  ""
);

// Resolved at request time rather than build time; `handbook/` is pulled into
// the deployed bundle by outputFileTracingIncludes in next.config.ts.
const HANDBOOK_PATH = path.join(process.cwd(), "handbook", "handbook.html");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(): NextResponse {
  return NextResponse.json({ message: "Sign in to read the handbook." }, { status: 401 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return unauthorized();
  }

  // The dashboard does not verify session tokens itself - the backend owns
  // expiry, revocation, and suspended accounts. Asking it is the only check
  // that stays correct when an account is disabled mid-session.
  let sessionIsValid = false;
  try {
    const probe = await fetch(`${API_BASE_URL}/api/admin/auth/me`, {
      headers: { authorization },
      cache: "no-store"
    });
    sessionIsValid = probe.ok;
  } catch {
    // Fail CLOSED. An unreachable backend must not become a way to read the
    // document without a session.
    return NextResponse.json(
      { message: "Could not verify your session. Try again in a moment." },
      { status: 503 }
    );
  }

  if (!sessionIsValid) {
    return unauthorized();
  }

  const html = await readFile(HANDBOOK_PATH, "utf8");
  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex"
    }
  });
}
