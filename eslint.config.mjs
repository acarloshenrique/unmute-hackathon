import next from "eslint-config-next/core-web-vitals";
const config = [
  ...next,
  {
    ignores: [
      ".next/**",
      ".agent-local/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },
];
export default config;
