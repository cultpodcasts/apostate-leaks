import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const dataDir = path.join(repoRoot, "worker", "public", "data");

const UK_POSTCODE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const SUSPICIOUS_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "UK postcode", regex: UK_POSTCODE },
  { name: "street suffix", regex: /\b\d+\s+\w+\s+(road|street|lane|close|avenue)\b/i },
  { name: "lat property", regex: /"lat"\s*:\s*-?\d/ },
  { name: "lon/lng property", regex: /"(lon|lng)"\s*:\s*-?\d/ },
  { name: "address field", regex: /"address"\s*:/i },
];

async function auditFile(filePath: string): Promise<string[]> {
  const issues: string[] = [];
  const content = await readFile(filePath, "utf8");
  const name = path.basename(filePath);

  for (const { name: patternName, regex } of SUSPICIOUS_PATTERNS) {
    if (regex.test(content)) {
      issues.push(`${name}: matched ${patternName}`);
    }
  }

  if (name.endsWith(".geojson") || name.endsWith(".json")) {
    const parsed = JSON.parse(content) as unknown;
    if (name.endsWith(".geojson") && typeof parsed === "object" && parsed) {
      const fc = parsed as { features?: Array<{ properties?: Record<string, unknown> }> };
      for (const f of fc.features ?? []) {
        const keys = Object.keys(f.properties ?? {});
        const allowed = new Set(["count", "countBand"]);
        if (keys.some((k) => !allowed.has(k))) {
          issues.push(`${name}: unexpected feature properties: ${keys.join(", ")}`);
        }
        if ("cellId" in (f.properties ?? {})) {
          issues.push(`${name}: must not publish cellId`);
        }
      }
    }
  }

  return issues;
}

async function main(): Promise<void> {
  let files: string[];
  try {
    files = await readdir(dataDir);
  } catch {
    console.error(`No deploy data at ${dataDir}. Run pipeline first.`);
    process.exit(1);
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json") || f.endsWith(".geojson"));
  const allIssues: string[] = [];

  for (const file of jsonFiles) {
    allIssues.push(...(await auditFile(path.join(dataDir, file))));
  }

  if (!jsonFiles.length) {
    console.error("No JSON artifacts to audit.");
    process.exit(1);
  }

  if (allIssues.length) {
    console.error("Privacy audit FAILED:");
    for (const issue of allIssues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log("Privacy audit passed for:", jsonFiles.join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
