import type { BuildInfo } from "./types.js";

declare global {
  /** Injected by generated public/build-info.js */
  var __BUILD_INFO__: BuildInfo | undefined;

  /** Loaded from CDN in index.html */
  const maplibregl: {
    Map: new (options: Record<string, unknown>) => MaplibreMap;
    NavigationControl: new (options: { showCompass: boolean }) => unknown;
    Popup: new (options: Record<string, unknown>) => MaplibrePopup;
  };
}

interface MaplibrePopup {
  setLngLat(lngLat: { lng: number; lat: number }): this;
  setHTML(html: string): this;
  addTo(map: MaplibreMap): this;
  remove(): void;
}

export interface MaplibreMap {
  resize(): void;
  fitBounds(
    bounds: [[number, number], [number, number]],
    options?: {
      padding?: number | { top: number; bottom: number; left: number; right: number };
      maxZoom?: number;
      duration?: number;
    },
  ): void;
  on(event: string, handler: () => void): void;
  on(
    event: "mousemove",
    handler: (e: { point: { x: number; y: number }; lngLat: { lng: number; lat: number } }) => void,
  ): void;
  addControl(control: unknown, position?: string): void;
  addSource(id: string, source: { type: string; data: unknown }): void;
  addLayer(layer: Record<string, unknown>): void;
  queryRenderedFeatures(
    point: { x: number; y: number },
    options: { layers: string[] },
  ): Array<{ properties?: { countBand?: string } }>;
  getCanvas(): { style: { cursor: string } };
}

export {};
