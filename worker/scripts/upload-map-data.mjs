#!/usr/bin/env node
/**
 * Upload published map artifacts to R2 (not stored in public git).
 *
 * Usage (from worker/, after offline pipeline + audit):
 *   npm run upload:data
 *   npm run upload:data -- --dry-run
 *
 * Requires: npx wrangler login, R2 bucket from wrangler.toml, files in public/data/
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(WORKER_ROOT, "public", "data");

const OBJECTS = [
  { key: "data/cells.geojson", file: "cells.geojson" },
  { key: "data/meta.json", file: "meta.json" },
];

const BUCKET = "apostate-leaks-map-data";

function main() {
  const dryRun = process.argv.includes("--dry-run");

  for (const { key, file } of OBJECTS) {
    const abs = path.join(DATA_DIR, file);
    if (!existsSync(abs)) {
      console.error(`Missing ${abs}. Run offline pipeline first.`);
      process.exit(1);
    }

    if (dryRun) {
      console.log(`[dry-run] wrangler r2 object put ${BUCKET}/${key} --file=${file}`);
      continue;
    }

    console.log(`Uploading ${file} → ${BUCKET}/${key}…`);
    const result = spawnSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", abs, "--remote"],
      { cwd: WORKER_ROOT, stdio: "inherit", shell: process.platform === "win32" },
    );

    if (result.status !== 0) {
      console.error(`Upload failed for ${file} (exit ${result.status}).`);
      process.exit(1);
    }
  }

  console.log("\nDone. Map data is in R2 only — do not commit public/data/*.geojson or *.json to git.");
}

main();
