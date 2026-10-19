import type { NextConfig } from "next";

// Static export: every screen is plain HTML + JS that the service worker can
// cache, so the app opens with no connection. All data is fetched client-side.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
