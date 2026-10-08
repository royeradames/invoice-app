import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "next-env.d.ts", ".test-state/**"]),
  {
    // Invoices live only in this browser's storage. Every page reads it on a full
    // document load, and the editor's beforeunload guard only covers document
    // navigation, so internal links stay plain anchors on purpose.
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
]);
