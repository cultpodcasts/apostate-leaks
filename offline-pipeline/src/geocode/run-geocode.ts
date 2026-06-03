import type { PipelineConfig } from "../config.js";
import type { CleanedAddress } from "../clean-addresses.js";
import {
  GeocodeCache,
  addressKey,
  loadProgress,
  saveProgress,
} from "./cache.js";
import { buildQueryVariants } from "./normalize-query.js";
import { NominatimGeocoder } from "./nominatim.js";
import { PhotonGeocoder } from "./photon.js";

export interface GeocodeRunStats {
  cached: number;
  newlyGeocoded: number;
  failed: number;
  totalResolved: number;
}

export interface ResolvedPoint {
  lat: number;
  lon: number;
}

async function geocodeWithVariants(
  normalized: string,
  nominatim: NominatimGeocoder,
  photon: PhotonGeocoder,
  config: PipelineConfig,
): Promise<{ lat: number; lon: number; quality: string } | null> {
  const variants = buildQueryVariants(normalized);

  for (const variant of variants) {
    const result = await nominatim.geocodeQuery(variant);
    if (result) return result;
  }

  for (const variant of variants) {
    const result = await photon.geocode(variant, config.geocodeRegionHint);
    if (result) return result;
  }

  return null;
}

export async function geocodeAddresses(
  addresses: CleanedAddress[],
  config: PipelineConfig,
  options?: { retryFailed?: boolean },
): Promise<{ points: ResolvedPoint[]; stats: GeocodeRunStats }> {
  const cache = new GeocodeCache(config.geocodeCachePath);
  await cache.load();

  const progress = await loadProgress(config.progressPath);
  if (options?.retryFailed) {
    progress.failedKeys = [];
  }
  const failedSet = new Set(progress.failedKeys);
  const nominatim = new NominatimGeocoder(config);
  const photon = new PhotonGeocoder();
  const points: ResolvedPoint[] = [];

  const stats: GeocodeRunStats = {
    cached: 0,
    newlyGeocoded: 0,
    failed: 0,
    totalResolved: 0,
  };

  for (const { normalized } of addresses) {
    const key = addressKey(normalized);
    const existing = cache.get(key);

    if (existing) {
      points.push({ lat: existing.lat, lon: existing.lon });
      stats.cached++;
      stats.totalResolved++;
      continue;
    }

    if (failedSet.has(key)) {
      stats.failed++;
      continue;
    }

    const result = await geocodeWithVariants(
      normalized,
      nominatim,
      photon,
      config,
    );
    if (!result) {
      stats.failed++;
      failedSet.add(key);
      progress.failedKeys = [...failedSet];
      await saveProgress(config.progressPath, progress);
      continue;
    }

    await cache.set({
      addressKey: key,
      lat: result.lat,
      lon: result.lon,
      quality: result.quality,
      updatedAt: new Date().toISOString(),
    });

    points.push({ lat: result.lat, lon: result.lon });
    stats.newlyGeocoded++;
    stats.totalResolved++;
    progress.completedKeys.push(key);
    await saveProgress(config.progressPath, progress);
  }

  return { points, stats };
}
