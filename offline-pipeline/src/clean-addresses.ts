import type { PipelineConfig } from "./config.js";
import type { CsvRow } from "./parse-csv.js";

export type SkipReason = "missing" | "placeholder" | "duplicate";

export interface AddressCleanStats {
  totalRows: number;
  validAddresses: number;
  uniqueAddresses: number;
  skipped: Record<SkipReason, number>;
}

export interface CleanedAddress {
  normalized: string;
}

function normalizeAddress(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function isPlaceholder(address: string, placeholders: Set<string>): boolean {
  const lower = address.toLowerCase();
  return placeholders.has(lower);
}

export async function collectCleanAddresses(
  rows: AsyncIterable<CsvRow> | Iterable<CsvRow>,
  config: PipelineConfig,
  csvStats: { totalRows: number },
): Promise<{ addresses: CleanedAddress[]; stats: AddressCleanStats }> {
  const seen = new Set<string>();
  const addresses: CleanedAddress[] = [];
  const skipped: Record<SkipReason, number> = {
    missing: 0,
    placeholder: 0,
    duplicate: 0,
  };

  for await (const row of rows) {
    const normalized = normalizeAddress(row.address);

    if (!normalized) {
      skipped.missing++;
      continue;
    }

    if (isPlaceholder(normalized, config.placeholderAddresses)) {
      skipped.placeholder++;
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      skipped.duplicate++;
      continue;
    }

    seen.add(key);
    addresses.push({ normalized });
  }

  return {
    addresses,
    stats: {
      totalRows: csvStats.totalRows,
      validAddresses:
        addresses.length + skipped.duplicate,
      uniqueAddresses: addresses.length,
      skipped,
    },
  };
}
