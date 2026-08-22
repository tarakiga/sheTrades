/**
 * Hostname routing for the two surfaces this app serves.
 *
 * The operator console and the public documents are ONE Next.js app in one
 * deployment, and they must not share a hostname. The bot's privacy notice
 * sends its URL to every participant, so anything reachable beside that page is
 * effectively published to the entire programme - the console's sign-in form
 * included. Splitting by host is what keeps the console's address out of a
 * message going to thousands of people.
 *
 * This module is pure so the decision can be tested without a request object;
 * `middleware.ts` is the thin wrapper that applies it.
 */

/** Which of the two surfaces a request belongs to. */
export type Surface = "admin" | "public";

/** What the middleware should do with a request that landed on the public surface. */
export type RouteVerdict =
  | { action: "allow" }
  | { action: "notFound" }
  | { action: "redirect"; to: string };

/**
 * Hosts that are ALWAYS the console, whatever ADMIN_HOSTS says.
 *
 * Vercel serves every project on its own *.vercel.app hostnames and those
 * cannot be removed, so classifying them as public would only mean the console
 * stays reachable at an address the middleware does not know about. Treating
 * them as admin also means a DNS mistake on the custom domain cannot lock the
 * team out of their own console. The exposure being fixed here is PUBLISHING
 * the console's address to every participant, not the address existing.
 */
const ALWAYS_ADMIN_SUFFIXES = [".vercel.app"];
const ALWAYS_ADMIN_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Paths served on the public host.
 *
 * Deliberately NOT admin-editable config, unlike the content this app manages:
 * a route allowlist operators can extend is one mis-click away from
 * republishing the console. Adding a public document is a code change and a
 * review.
 */
const PUBLIC_EXACT_PATHS = new Set(["/privacy"]);

/** Certificate verification pages and their PNGs, proxied to the backend. */
const PUBLIC_PATH_PREFIXES = ["/c/"];

/** Where the bare public root goes. The policy is the only public document. */
const PUBLIC_ROOT_DESTINATION = "/privacy";

/**
 * Paths that must not exist in a deployed build at all.
 *
 * The component workshop server-renders every admin workspace INLINE, so its
 * markup lands in the RSC payload whether or not the client-side gate chooses to
 * display it - curl gets the whole thing regardless. The real admin pages do not
 * have this problem: they authenticate first and fetch their data afterwards, so
 * their server-rendered shell is empty. Nothing on the client can fix the
 * workshop, so it is simply absent from deployed builds instead.
 */
const DEVELOPMENT_ONLY_PREFIXES = ["/previews"];

/** True when the path belongs to a surface that only exists in development. */
export function isDevelopmentOnlyPath(pathname: string): boolean {
  const path = normalisePath(pathname);
  return DEVELOPMENT_ONLY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/**
 * Whether development-only routes are served.
 *
 * Defaults to off in production builds, which on Vercel means every deployment.
 * An explicit ENABLE_COMPONENT_PREVIEWS wins in both directions so the workshop
 * can be turned on deliberately for a design review, and off locally.
 */
export function developmentOnlyRoutesEnabled(env: {
  nodeEnv?: string | null | undefined;
  flag?: string | null | undefined;
}): boolean {
  const flag = (env.flag ?? "").trim().toLowerCase();
  if (flag === "true" || flag === "1") {
    return true;
  }
  if (flag === "false" || flag === "0") {
    return false;
  }
  return (env.nodeEnv ?? "").trim().toLowerCase() !== "production";
}

/**
 * Lowercases a Host header and drops the port. IPv6 literals arrive bracketed
 * ("[::1]:3000"), where the port is the colon AFTER the closing bracket, so
 * they cannot be split on the first colon like a name can.
 */
export function normaliseHost(hostHeader: string | null | undefined): string {
  const raw = (hostHeader ?? "").trim().toLowerCase();
  if (raw.length === 0) {
    return "";
  }
  if (raw.startsWith("[")) {
    const close = raw.indexOf("]");
    return close === -1 ? raw : raw.slice(0, close + 1);
  }
  const colon = raw.indexOf(":");
  return colon === -1 ? raw : raw.slice(0, colon);
}

/**
 * Reads the comma-separated ADMIN_HOSTS setting. Blank entries are dropped.
 *
 * Entries may be written as bare hostnames or as full origins. The neighbouring
 * BACKEND_CORS_ALLOWED_ORIGINS setting takes origins, so someone WILL paste
 * "https://admin.shetrades.digital" here; left unstripped that parses to the
 * host "https" and the console silently becomes public on its own domain.
 */
export function parseAdminHosts(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => normaliseHost(stripOrigin(entry)))
    .filter((entry) => entry.length > 0);
}

/** Reduces "https://admin.example.com/anything" to "admin.example.com". */
function stripOrigin(entry: string): string {
  const withoutScheme = entry.trim().replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  const slash = withoutScheme.indexOf("/");
  return slash === -1 ? withoutScheme : withoutScheme.slice(0, slash);
}

/**
 * Classifies a request by its Host header.
 *
 * Anything unrecognised is PUBLIC. That is the least-privilege default: an
 * unset ADMIN_HOSTS leaves the console reachable on *.vercel.app and localhost
 * while the custom domains stay locked down, so a missing env var degrades to
 * "the split still holds" rather than "the console is open again".
 */
export function surfaceForHost(
  hostHeader: string | null | undefined,
  adminHosts: readonly string[]
): Surface {
  const host = normaliseHost(hostHeader);
  if (host.length === 0) {
    return "public";
  }
  if (ALWAYS_ADMIN_HOSTS.includes(host)) {
    return "admin";
  }
  if (ALWAYS_ADMIN_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return "admin";
  }
  return adminHosts.includes(host) ? "admin" : "public";
}

/** Trailing slashes are not meaningful here; "/privacy/" is "/privacy". */
function normalisePath(pathname: string): string {
  if (pathname.length <= 1) {
    return pathname;
  }
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.length === 0 ? "/" : trimmed;
}

/**
 * Decides what a path may do on the public host.
 *
 * Everything off the allowlist is 404, never a redirect to the console. A
 * redirect would name the admin hostname in its Location header, which is
 * precisely the disclosure this split exists to prevent.
 */
export function verdictForPublicRequest(pathname: string): RouteVerdict {
  const path = normalisePath(pathname);
  if (path === "/") {
    return { action: "redirect", to: PUBLIC_ROOT_DESTINATION };
  }
  if (PUBLIC_EXACT_PATHS.has(path)) {
    return { action: "allow" };
  }
  if (PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return { action: "allow" };
  }
  return { action: "notFound" };
}
