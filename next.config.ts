import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@supabase/ssr"]
  },
  output: "standalone"
};

export default nextConfig;
