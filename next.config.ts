import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["agora-agents", "agora-token"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
        ],
      },
    ];
  },
};
export default config;
