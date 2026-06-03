import { cellToBoundary, latLngToCell } from "h3-js";
import { jitterCoordinates } from "./jitter.js";
import { applyCountNoise, suppressBelowK } from "./privacy.js";
import type { ResolvedPoint } from "../geocode/run-geocode.js";

export interface AggregateOptions {
  h3Resolution: number;
  kAnonymity: number;
  coordinateJitterMetres: number;
  countNoiseMax: number;
}

export interface AggregateMeta {
  h3Resolution: number;
  k: number;
  coordinateJitterMetres: number;
  countNoiseMax: number;
  generatedAt: string;
  bbox: [number, number, number, number];
  totalPoints: number;
  publishedCells: number;
  suppressedCells: number;
}

export interface AggregateCell {
  cellId: string;
  count: number;
}

export interface AggregateOutput {
  meta: AggregateMeta;
  cells: AggregateCell[];
}

export function aggregatePoints(
  points: ResolvedPoint[],
  options: AggregateOptions,
): AggregateOutput {
  const rawCounts = new Map<string, number>();

  for (const point of points) {
    const jittered = jitterCoordinates(
      point.lat,
      point.lon,
      options.coordinateJitterMetres,
    );
    const cellId = latLngToCell(
      jittered.lat,
      jittered.lon,
      options.h3Resolution,
    );
    rawCounts.set(cellId, (rawCounts.get(cellId) ?? 0) + 1);
  }

  const withNoise = new Map<string, number>();
  for (const [cellId, count] of rawCounts) {
    withNoise.set(cellId, applyCountNoise(count, options.countNoiseMax));
  }

  const published = suppressBelowK(withNoise, options.kAnonymity);
  const suppressedCells = rawCounts.size - published.size;

  const cells: AggregateCell[] = [...published.entries()]
    .map(([cellId, count]) => ({ cellId, count }))
    .sort((a, b) => b.count - a.count);

  const bbox = computeBbox(cells);

  return {
    meta: {
      h3Resolution: options.h3Resolution,
      k: options.kAnonymity,
      coordinateJitterMetres: options.coordinateJitterMetres,
      countNoiseMax: options.countNoiseMax,
      generatedAt: new Date().toISOString(),
      bbox,
      totalPoints: points.length,
      publishedCells: cells.length,
      suppressedCells,
    },
    cells,
  };
}

function computeBbox(cells: AggregateCell[]): [number, number, number, number] {
  if (!cells.length) return [0, 0, 0, 0];

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const { cellId } of cells) {
    const boundary = cellToBoundary(cellId, true);
    for (const [lon, lat] of boundary) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }

  return [west, south, east, north];
}
