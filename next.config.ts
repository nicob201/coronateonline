import type { NextConfig } from "next";

// Baseline security headers applied to every response. Full CSP is deferred until the design pass.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Vercel restores Turbopack's build cache across lockfile changes and it broke next/font resolution (Dependabot PR #22).
  experimental: { turbopackFileSystemCacheForBuild: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
