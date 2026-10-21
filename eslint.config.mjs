import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Inherited debt: these components were lifted unchanged from oan_dashboards
  // and carry its loose typing and effect patterns. The rules stay on for every
  // other file; tighten these files as they are next touched, then drop this block.
  {
    files: [
      "components/ethiopia-map.tsx",
      "components/*-dashboard.tsx",
      "components/registry/*.{ts,tsx}",
    ],
    ignores: ["components/dashboard-shell.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
