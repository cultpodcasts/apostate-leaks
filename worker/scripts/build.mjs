/**
 * Asset build for deploy and local dev (no Cloudflare-CI guard).
 * - write build-info.js / .json
 * - compile client/*.ts → public/map.js
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

execSync("node scripts/write-build-info.mjs", { cwd: root, stdio: "inherit" });
execSync("npx tsc -p tsconfig.client.json", { cwd: root, stdio: "inherit" });

console.log("Build complete: public/build-info.js, public/map.js");
