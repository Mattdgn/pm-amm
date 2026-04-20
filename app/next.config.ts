import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["@coral-xyz/anchor"],
};

export default nextConfig;
