import type { PipelineConfig } from "../config.js";
import { RateLimiter } from "./rate-limiter.js";

export interface GeocodeResult {
  lat: number;
  lon: number;
  quality: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  importance?: number;
  type?: string;
  class?: string;
  display_name?: string;
}

export class NominatimGeocoder {
  private readonly limiter: RateLimiter;

  constructor(private readonly config: PipelineConfig) {
    this.limiter = new RateLimiter(config.geocodeDelayMs);
  }

  buildQuery(normalizedAddress: string): string {
    return `${normalizedAddress}, ${this.config.geocodeRegionHint}`;
  }

  async geocodeQuery(query: string): Promise<GeocodeResult | null> {
    let attempt = 0;

    while (attempt <= this.config.geocodeMaxRetries) {
      await this.limiter.wait();

      const url = new URL("/search", this.config.nominatimBaseUrl);
      url.searchParams.set("q", `${query}, ${this.config.geocodeRegionHint}`);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "gb");

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "apostate-leaks-offline-pipeline/1.0 (privacy map; local batch)",
          Accept: "application/json",
        },
      });

      if (response.status === 429 || response.status >= 500) {
        attempt++;
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const results = (await response.json()) as NominatimResult[];
      if (!results.length) return null;

      const best = results[0];
      const lat = Number(best.lat);
      const lon = Number(best.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const quality = [best.type, best.class, best.importance?.toFixed(3)]
        .filter(Boolean)
        .join("|");

      return { lat, lon, quality };
    }

    return null;
  }

  async geocode(normalizedAddress: string): Promise<GeocodeResult | null> {
    return this.geocodeQuery(normalizedAddress);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
