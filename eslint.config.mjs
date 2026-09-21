import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested agent worktrees are full copies of this repo (excluded from git
    // via .git/info/exclude). Linting them re-reports every finding twice.
    ".kilo/**",
    ".kilocode/**",
  ]),
]);

export default eslintConfig;
