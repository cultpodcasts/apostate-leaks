import type { CsvRow } from "../parse-csv.js";
import { analyzeComment } from "./analyze.js";

export interface SentimentFilterStats {
  inputRows: number;
  positiveRows: number;
  skippedNegative: number;
  skippedNeutral: number;
  skippedEmptyComment: number;
}

export function filterPositiveRows(rows: Iterable<CsvRow>): {
  rows: CsvRow[];
  stats: SentimentFilterStats;
} {
  const positiveRows: CsvRow[] = [];
  const stats: SentimentFilterStats = {
    inputRows: 0,
    positiveRows: 0,
    skippedNegative: 0,
    skippedNeutral: 0,
    skippedEmptyComment: 0,
  };

  for (const row of rows) {
    stats.inputRows++;
    const comment = row.comment.trim();

    if (!comment) {
      stats.skippedEmptyComment++;
      continue;
    }

    const sentiment = analyzeComment(comment);
    if (sentiment.label === "positive") {
      positiveRows.push(row);
      stats.positiveRows++;
    } else if (sentiment.label === "negative") {
      stats.skippedNegative++;
    } else {
      stats.skippedNeutral++;
    }
  }

  return { rows: positiveRows, stats };
}
