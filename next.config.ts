import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  async redirects() {
    return [
      { source: "/dashboard", destination: "/vendors", permanent: false },
      { source: "/review", destination: "/vendors?filter=review", permanent: false },
      { source: "/rules", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
