import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The engine runs on the server only (node:crypto); keep it out of client bundles.
  serverExternalPackages: [],
};

export default nextConfig;
