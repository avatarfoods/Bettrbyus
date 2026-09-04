import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.2.106"],
  turbopack: {
    // Lanes are git worktrees under .claude/worktrees with their own lockfile.
    // Without an explicit root, Next picks the main checkout's package-lock.json
    // as the workspace root and watches every worktree from there.
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Master production .xlsm uploads exceed the 1 MB default.
      bodySizeLimit: "25mb",
    },
    // The auth proxy buffers request bodies; the default 10 MB cutoff
    // truncates master file uploads ("Unexpected end of form").
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
