import { RateLimiter } from "./rate-limiter.js";

export interface GeocodeResult {
  lat: number;
  lon: number;
  quality: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_key?: string;
    countrycode?: string;
  };
}

export class PhotonGeocoder {
  private readonly limiter = new RateLimiter(200);

  async geocode(query: string, regionHint: string): Promise<GeocodeResult | null> {
    await this.limiter.wait();

    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", `${query}, ${regionHint}`);
    url.searchParams.set("limit", "1");
    url.searchParams.set("lang", "en");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { features?: PhotonFeature[] };
    const feature = data.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;

    const [lon, lat] = coords;
    if (feature.properties?.countrycode && feature.properties.countrycode !== "GB") {
      return null;
    }

    const quality = [feature.properties?.osm_key, feature.properties?.osm_type]
      .filter(Boolean)
      .join("|");

    return { lat, lon, quality: `photon:${quality}` };
  }
}
