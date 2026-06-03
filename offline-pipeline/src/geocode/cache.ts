import { createReadStream, existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

export interface GeocodeCacheEntry {
  addressKey: string;
  lat: number;
  lon: number;
  quality: string;
  updatedAt: string;
}

export class GeocodeCache {
  private readonly map = new Map<string, GeocodeCacheEntry>();

  constructor(private readonly cachePath: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.cachePath)) return;

    const rl = createInterface({
      input: createReadStream(this.cachePath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as GeocodeCacheEntry;
        if (
          entry.addressKey &&
          typeof entry.lat === "number" &&
          typeof entry.lon === "number"
        ) {
          this.map.set(entry.addressKey, entry);
        }
      } catch {
        // skip corrupt line
      }
    }
  }

  get(addressKey: string): GeocodeCacheEntry | undefined {
    return this.map.get(addressKey);
  }

  async set(entry: GeocodeCacheEntry): Promise<void> {
    this.map.set(entry.addressKey, entry);
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    await appendFile(this.cachePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  size(): number {
    return this.map.size;
  }
}

export interface GeocodeProgress {
  completedKeys: string[];
  failedKeys: string[];
  updatedAt: string;
}

export async function loadProgress(filePath: string): Promise<GeocodeProgress> {
  if (!existsSync(filePath)) {
    return { completedKeys: [], failedKeys: [], updatedAt: "" };
  }
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as GeocodeProgress;
}

export async function saveProgress(
  filePath: string,
  progress: GeocodeProgress,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  progress.updatedAt = new Date().toISOString();
  await writeFile(filePath, JSON.stringify(progress, null, 2), "utf8");
}

export function addressKey(normalizedAddress: string): string {
  return normalizedAddress.toLowerCase();
}
