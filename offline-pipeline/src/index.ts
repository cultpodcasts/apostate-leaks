import { mkdir } from "node:fs/promises";
import { aggregatePoints } from "./aggregate/h3-aggregate.js";
import { writeDeployArtifacts } from "./aggregate/export.js";
import { collectCleanAddresses } from "./clean-addresses.js";
import { loadConfig } from "./config.js";
import { geocodeAddresses } from "./geocode/run-geocode.js";
import type { CsvRow } from "./parse-csv.js";
import { streamCsvRows } from "./parse-csv.js";
import { filterPositiveRows } from "./sentiment/filter-rows.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.cacheDir, { recursive: true });

  console.log("Privacy map offline pipeline");
  console.log(`Input: ${config.inputCsv}`);
  console.log(
    config.includeAllSentiments
      ? "Sentiment filter: off (--include-all-sentiments)"
      : "Sentiment filter: positive comments only",
  );
  console.log(
    `Aggregation: H3 res ${config.h3Resolution}, k=${config.kAnonymity}, jitter=${config.coordinateJitterMetres}m`,
  );

  const rowBuffer: CsvRow[] = [];
  const csvStats = await streamCsvRows(config.inputCsv, async (row) => {
    rowBuffer.push(row);
  });

  const sentimentFilter = config.includeAllSentiments
    ? null
    : filterPositiveRows(rowBuffer);
  const rowsForPipeline = config.includeAllSentiments
    ? rowBuffer
    : sentimentFilter!.rows;

  if (sentimentFilter) {
    const s = sentimentFilter.stats;
    console.log("\n--- Sentiment (positive comments only) ---");
    console.log(`Positive rows:        ${s.positiveRows}`);
    console.log(`Skipped (negative):   ${s.skippedNegative}`);
    console.log(`Skipped (neutral):    ${s.skippedNeutral}`);
    console.log(`Skipped (no comment): ${s.skippedEmptyComment}`);
  }

  const { addresses, stats: cleanStats } = await collectCleanAddresses(
    rowsForPipeline,
    config,
    csvStats,
  );

  console.log("\n--- CSV statistics ---");
  console.log(`Total rows:           ${csvStats.totalRows}`);
  console.log(`Malformed rows:       ${csvStats.malformedRows}`);
  console.log(`Unique addresses:     ${cleanStats.uniqueAddresses}`);
  console.log(`Skipped (missing):    ${cleanStats.skipped.missing}`);
  console.log(`Skipped (placeholder): ${cleanStats.skipped.placeholder}`);
  console.log(`Skipped (duplicate):  ${cleanStats.skipped.duplicate}`);

  if (config.skipGeocode) {
    console.log("\n--skip-geocode set; stopping after parse.");
    return;
  }

  console.log("\n--- Geocoding (cached + Nominatim) ---");
  const { points, stats: geoStats } = await geocodeAddresses(addresses, config, {
    retryFailed: config.retryFailed,
  });
  console.log(`From cache:           ${geoStats.cached}`);
  console.log(`Newly geocoded:       ${geoStats.newlyGeocoded}`);
  console.log(`Failed:               ${geoStats.failed}`);
  console.log(`Points for aggregate: ${points.length}`);

  if (!points.length) {
    console.error("No geocoded points; cannot aggregate.");
    process.exit(1);
  }

  console.log("\n--- Aggregation ---");
  const aggregate = aggregatePoints(points, {
    h3Resolution: config.h3Resolution,
    kAnonymity: config.kAnonymity,
    coordinateJitterMetres: config.coordinateJitterMetres,
    countNoiseMax: config.countNoiseMax,
  });
  console.log(`Published cells:      ${aggregate.meta.publishedCells}`);
  console.log(`Suppressed (<k):      ${aggregate.meta.suppressedCells}`);

  const paths = await writeDeployArtifacts(aggregate, config.workerDataDir, {
    positiveCommentsOnly: !config.includeAllSentiments,
  });
  console.log("\n--- Deploy artifacts (privacy-safe) ---");
  console.log(paths.geojsonPath);
  console.log(paths.metaPath);
  console.log("\nRun audit: npm run audit");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
