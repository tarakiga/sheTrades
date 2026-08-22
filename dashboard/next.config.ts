import type { NextConfig } from "next";

// Same origin the rest of the app talks to. Certificate pages are rendered by
// the backend, not by Next.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(
  /\/+$/,
  ""
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Certificate verification pages and their PNGs, proxied so a learner's
      // link reads shetrades.digital/c/<id> rather than naming the Cloud Run
      // service. The public host allows /c/ in middleware; on the admin host
      // this rewrite is simply unused.
      //
      // The .png is the URL Meta fetches when sending the certificate, so this
      // proxy sits in the delivery path. It is live and verifiable now, but
      // PUBLIC_BASE_URL still points at the backend directly - flip that only
      // once a real certificate has been fetched through here end to end.
      { source: "/c/:path*", destination: `${API_BASE_URL}/c/:path*` }
    ];
  }
};

export default nextConfig;
