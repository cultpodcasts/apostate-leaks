import { cellToBoundary } from "h3-js";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AggregateOutput } from "./h3-aggregate.js";
import { densityBandLabel } from "./density-band.js";

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { count: number; countBand: string };
    geometry: {
      type: "Polygon";
      coordinates: number[][][];
    };
  }>;
  meta: AggregateOutput["meta"];
}

export function toGeoJson(output: AggregateOutput): GeoJsonFeatureCollection {
  const features = output.cells.map(({ cellId, count }) => {
    const ring = cellToBoundary(cellId, true).map(([lon, lat]) => [lon, lat]);
    if (ring.length > 0) {
      const [firstLon, firstLat] = ring[0];
      const [lastLon, lastLat] = ring[ring.length - 1];
      if (firstLon !== lastLon || firstLat !== lastLat) {
        ring.push([firstLon, firstLat]);
      }
    }

    return {
      type: "Feature" as const,
      properties: {
        count,
        countBand: densityBandLabel(count, output.meta.k),
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [ring],
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
    meta: output.meta,
  };
}

export interface DeployManifest {
  generatedAt: string;
  filter: { positiveCommentsOnly: boolean };
  aggregation: AggregateOutput["meta"];
  privacy: {
    purpose: string;
    insiderCanVerify: string[];
    outsiderCannot: string[];
  };
}

export async function writeDeployArtifacts(
  output: AggregateOutput,
  workerDataDir: string,
  options: { positiveCommentsOnly: boolean },
): Promise<{ geojsonPath: string; metaPath: string }> {
  await mkdir(workerDataDir, { recursive: true });

  const geojsonPath = path.join(workerDataDir, "cells.geojson");
  const metaPath = path.join(workerDataDir, "meta.json");

  const manifest: DeployManifest = {
    generatedAt: output.meta.generatedAt,
    filter: { positiveCommentsOnly: options.positiveCommentsOnly },
    aggregation: output.meta,
    privacy: {
      purpose:
        "Geographic distribution of addresses with positive comments only; aggregated so individual properties cannot be identified.",
      insiderCanVerify: [
        "Bulk of supportive responses falls in the expected town/area",
        "Relative concentration (centre vs periphery) matches expectations",
      ],
      outsiderCannot: [
        "Determine which specific property appears in the dataset",
        "Search or click to reveal addresses",
        "Infer singleton addresses from isolated cells (k-anonymity enforced)",
      ],
    },
  };

  await writeFile(geojsonPath, JSON.stringify(toGeoJson(output)), "utf8");
  await writeFile(metaPath, JSON.stringify(manifest, null, 2), "utf8");

  for (const legacy of [
    "cells-regional.geojson",
    "cells-local.geojson",
    "aggregates.json",
  ]) {
    await unlink(path.join(workerDataDir, legacy)).catch(() => {});
  }

  return { geojsonPath, metaPath };
}
