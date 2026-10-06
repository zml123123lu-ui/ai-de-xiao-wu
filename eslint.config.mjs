import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // .netlify/ 是 Netlify CLI 构建出来的函数产物，不该参与 lint
  globalIgnores([".next/**", ".next 2/**", ".netlify/**", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
