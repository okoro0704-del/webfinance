import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo: keep tracing rooted at the repo, not a nested lockfile
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
