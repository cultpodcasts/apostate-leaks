import { createReadStream } from "node:fs";
import { parse } from "csv-parse";

export interface CsvParseStats {
  totalRows: number;
  malformedRows: number;
}

export interface CsvRow {
  timestamp: string;
  address: string;
  /** Column 3+ (index 2+); may contain embedded newlines when quoted. */
  comment: string;
}

/**
 * Stream-parse RFC 4180 CSV. Column 0 = timestamp, column 1 = address,
 * column 2+ = comment (joined if multiple columns).
 */
export async function streamCsvRows(
  filePath: string,
  onRow: (row: CsvRow) => void | Promise<void>,
): Promise<CsvParseStats> {
  const stats: CsvParseStats = { totalRows: 0, malformedRows: 0 };

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: false,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false,
      bom: true,
    }),
  );

  for await (const record of parser) {
    if (!Array.isArray(record)) continue;
    stats.totalRows++;

    if (record.length < 2) {
      stats.malformedRows++;
      continue;
    }

    const timestamp = String(record[0] ?? "").trim();
    const address = String(record[1] ?? "").trim();
    const comment = record
      .slice(2)
      .map((part: unknown) => String(part ?? ""))
      .join("\n")
      .trim();

    await onRow({ timestamp, address, comment });
  }

  return stats;
}
