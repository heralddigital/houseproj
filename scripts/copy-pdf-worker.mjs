/**
 * Copy the pdf.js worker into public/ so the browser can load it from a
 * same-origin URL. pdfjs-dist ships it as an ESM bundle inside node_modules,
 * which Next.js will not serve directly.
 *
 * Runs before `dev` and `build`. Keep it in sync with the worker URL set in
 * src/lib/plan/pdf.ts.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsEntry = require.resolve("pdfjs-dist");
const source = join(dirname(pdfjsEntry), "pdf.worker.min.mjs");
const destination = join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`[copy-pdf-worker] ${source} -> ${destination}`);
