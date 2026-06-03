import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export interface PipelineConfig {
  inputCsv: string;
  cacheDir: string;
  geocodeCachePath: string;
  progressPath: string;
  workerDataDir: string;
  /** Appended to geocode queries for UK disambiguation (not published). */
  geocodeRegionHint: string;
  /** H3 resolution (8 ≈ 460 m hex edge; 9 is finer but often too sparse). */
  h3Resolution: number;
  kAnonymity: number;
  /** Optional count noise: max absolute delta per cell (0 = disabled). */
  countNoiseMax: number;
  /** Metres: random offset applied once per point before H3 (0 = disabled). */
  coordinateJitterMetres: number;
  nominatimBaseUrl: string;
  geocodeDelayMs: number;
  geocodeMaxRetries: number;
  placeholderAddresses: Set<string>;
  /** When true, skip sentiment filter (include all comments). */
  includeAllSentiments: boolean;
}

function parseArgs(argv: string[]): Partial<PipelineConfig> & { inputCsv?: string } {
  const out: Record<string, string | number | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) out.inputCsv = argv[++i];
    if (arg === "--k" && argv[i + 1]) out.kAnonymity = Number(argv[++i]);
    if (arg === "--h3" && argv[i + 1]) out.h3Resolution = Number(argv[++i]);
    if (arg === "--jitter" && argv[i + 1])
      out.coordinateJitterMetres = Number(argv[++i]);
    if (arg === "--noise" && argv[i + 1]) out.countNoiseMax = Number(argv[++i]);
    if (arg === "--region" && argv[i + 1]) out.geocodeRegionHint = argv[++i];
    if (arg === "--geocode-only") out.geocodeOnly = true;
    if (arg === "--skip-geocode") out.skipGeocode = true;
    if (arg === "--retry-failed") out.retryFailed = true;
    if (arg === "--include-all-sentiments") out.includeAllSentiments = true;
  }
  return out as Partial<PipelineConfig> & {
    inputCsv?: string;
    geocodeOnly?: boolean;
    skipGeocode?: boolean;
    retryFailed?: boolean;
  };
}

export interface CliFlags {
  geocodeOnly: boolean;
  skipGeocode: boolean;
  retryFailed: boolean;
  includeAllSentiments: boolean;
}

const defaultPlaceholders = [
  "<missing address>",
  "missing address",
  "unknown",
  "n/a",
  "na",
  "null",
  "-",
  "tbc",
  "none",
  "",
];

export function loadConfig(argv = process.argv.slice(2)): PipelineConfig & CliFlags {
  const args = parseArgs(argv);
  const cacheDir = path.join(repoRoot, "offline-pipeline", ".cache");
  const defaultInput = path.join(repoRoot, "source-data", "update-20260602-114715.csv");

  return {
    inputCsv: args.inputCsv ?? defaultInput,
    cacheDir,
    geocodeCachePath: path.join(cacheDir, "geocode-cache.jsonl"),
    progressPath: path.join(cacheDir, "geocode-progress.json"),
    workerDataDir: path.join(repoRoot, "worker", "public", "data"),
    geocodeRegionHint: args.geocodeRegionHint ?? "United Kingdom",
    h3Resolution: args.h3Resolution ?? 8,
    kAnonymity: args.kAnonymity ?? 4,
    countNoiseMax: args.countNoiseMax ?? 0,
    coordinateJitterMetres: args.coordinateJitterMetres ?? 130,
    nominatimBaseUrl:
      process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org",
    geocodeDelayMs: Number(process.env.GEOCODE_DELAY_MS ?? "1100"),
    geocodeMaxRetries: 4,
    placeholderAddresses: new Set(
      defaultPlaceholders.map((p) => p.toLowerCase()),
    ),
    geocodeOnly: Boolean((args as { geocodeOnly?: boolean }).geocodeOnly),
    skipGeocode: Boolean((args as { skipGeocode?: boolean }).skipGeocode),
    retryFailed: Boolean((args as { retryFailed?: boolean }).retryFailed),
    includeAllSentiments: Boolean(
      (args as { includeAllSentiments?: boolean }).includeAllSentiments,
    ),
  };
}
