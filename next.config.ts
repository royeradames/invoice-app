import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { inlineCss: true, cpus: 2 },
};
export default config;
