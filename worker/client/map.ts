import type { MaplibreMap } from "./globals.js";
import type {
  AggregationMeta,
  BuildInfo,
  CellsGeoJson,
  Manifest,
  MapLibreColorExpression,
} from "./types.js";

const MIN_ZOOM = 10;
const MAX_ZOOM = 14;
/** Pan limit beyond hex bbox — generous so wide screens can pan E/W and zoom out still works. */
const MAX_BOUNDS_PAD_FRACTION = 1.25;
const MIN_MAX_BOUNDS_PAD_LON_DEG = 0.055;
const MIN_MAX_BOUNDS_PAD_LAT_DEG = 0.05;
const MOBILE_MQ = "(max-width: 720px)";

const COLORS = {
  low: "#fbbf24",
  mid: "#f97316",
  high: "#dc2626",
  peak: "#991b1b",
} as const;

const FILL_OPACITY = 0.82;
const BASEMAP_OPACITY = 0.85;

const H3_EDGE_METRES: Record<number, number> = { 7: 1406, 8: 531, 9: 201, 10: 76 };

async function loadCells(): Promise<CellsGeoJson> {
  const res = await fetch("/data/cells.geojson");
  if (!res.ok) throw new Error(`Failed to load map data (${res.status})`);
  return (await res.json()) as CellsGeoJson;
}

async function loadManifest(): Promise<Manifest | null> {
  const res = await fetch("/data/meta.json");
  if (!res.ok) return null;
  return (await res.json()) as Manifest;
}

function getBuildInfoFromScript(): BuildInfo | null {
  const info = globalThis.__BUILD_INFO__;
  return info && typeof info === "object" ? info : null;
}

async function loadBuildInfo(): Promise<BuildInfo | null> {
  const fromScript = getBuildInfoFromScript();
  if (hasKnownCommit(fromScript)) return fromScript;

  try {
    const res = await fetch("/build-info.json");
    if (!res.ok) return fromScript;
    const fetched = (await res.json()) as BuildInfo;
    if (hasKnownCommit(fetched)) return fetched;
  } catch {
    /* offline / blocked fetch */
  }
  return fromScript;
}

function hasKnownCommit(info: BuildInfo | null | undefined): boolean {
  return Boolean(info?.commit && info.commit !== "unknown");
}

function renderBuildProvenance(info: BuildInfo | null): void {
  const bar = document.getElementById("build-provenance");
  const panel = document.getElementById("privacy-build-links");
  const auditLink = document.getElementById("audit-source-link") as HTMLAnchorElement | null;
  const auditLabel = document.getElementById("audit-source-link-label");

  if (!hasKnownCommit(info)) {
    if (auditLink) {
      auditLink.href = info?.repository ?? "https://github.com/cultpodcasts/apostate-leaks";
      auditLink.title = "Repository (run deploy build step to record commit)";
    }
    if (auditLabel) auditLabel.textContent = "Audit source on GitHub";
    if (bar) {
      bar.innerHTML =
        '<span class="audit-bar__warn">Commit not recorded on this deploy — enable the build step (<code>node scripts/write-build-info.mjs</code>).</span>';
    }
    return;
  }

  if (auditLink) {
    auditLink.href = info!.commitUrl;
    auditLink.title = `View deployed source at commit ${info!.commitShort}`;
  }
  if (auditLabel) auditLabel.textContent = `Source at ${info!.commitShort}`;

  const built = info!.builtAt
    ? `${new Date(info!.builtAt).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "";

  if (bar) {
    bar.innerHTML = [`<code>${info!.branch}</code>`, built ? `· ${built}` : ""]
      .filter(Boolean)
      .join(" ");
  }

  if (panel) {
    panel.innerHTML = [
      `<a href="${info!.treeUrl}" target="_blank" rel="noopener noreferrer">View repository at this commit</a>`,
      ` · <a href="${info!.dataAuditPath}" target="_blank" rel="noopener noreferrer">Privacy audit script</a>`,
    ].join("");
  }
}

function populatePrivacyPanel(
  manifest: Manifest | null,
  cellMeta: CellsGeoJson["meta"] | AggregationMeta,
): void {
  const agg: AggregationMeta = manifest?.aggregation ?? cellMeta ?? {};
  const k = agg.k ?? 4;
  const jitter = agg.coordinateJitterMetres ?? 130;
  const h3 = agg.h3Resolution ?? 8;
  const hexEdge = H3_EDGE_METRES[h3] ?? 460;
  const published = agg.publishedCells ?? "—";
  const total = agg.totalPoints ?? "—";
  const positiveOnly = manifest?.filter?.positiveCommentsOnly !== false;

  for (const el of document.querySelectorAll("[data-meta='k']")) {
    el.textContent = String(k);
  }
  for (const el of document.querySelectorAll("[data-meta='jitter']")) {
    el.textContent = String(jitter);
  }
  for (const el of document.querySelectorAll("[data-meta='h3']")) {
    el.textContent = String(h3);
  }
  for (const el of document.querySelectorAll("[data-meta='hexSize']")) {
    el.textContent = String(Math.round(hexEdge));
  }

  const metaEl = document.getElementById("privacy-dataset-meta");
  if (metaEl) {
    metaEl.textContent = `Current build: ${published} hexagon(s) published from ${total} geocoded positive record(s). Comment filter: ${positiveOnly ? "positive only" : "off"}.`;
  }

  const scaleEl = document.getElementById("privacy-scale-context");
  if (scaleEl) {
    scaleEl.textContent = `Each hex covers roughly ${Math.round(hexEdge)} m across (H3 res ${h3}). Only cells with at least ${k} records are shown.`;
  }
}

function colorExpressionFromCounts(counts: number[]): MapLibreColorExpression {
  const unique = [...new Set(counts)].sort((a, b) => a - b);
  if (unique.length === 0) return COLORS.mid;
  if (unique.length === 1) {
    return ["step", ["get", "count"], COLORS.mid, unique[0] + 1, COLORS.mid];
  }

  const palette = [COLORS.low, COLORS.mid, COLORS.high, COLORS.peak];
  const stops: Array<string | number | MapLibreColorExpression> = [
    "interpolate",
    ["linear"],
    ["get", "count"],
  ];

  for (let i = 0; i < unique.length; i++) {
    const t = i / (unique.length - 1);
    const idx = Math.min(palette.length - 1, Math.round(t * (palette.length - 1)));
    stops.push(unique[i], palette[idx]);
  }

  return stops;
}

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_MQ).matches;
}

function padBbox(
  bbox: [number, number, number, number],
  fraction = 0.1,
): [[number, number], [number, number]] {
  const [west, south, east, north] = bbox;
  const padLon = (east - west) * fraction || 0.03;
  const padLat = (north - south) * fraction || 0.03;
  return [
    [west - padLon, south - padLat],
    [east + padLon, north + padLat],
  ];
}

function maxBoundsFromBbox(
  bbox: [number, number, number, number],
): [[number, number], [number, number]] {
  const [west, south, east, north] = bbox;
  const lonSpan = east - west || 0.01;
  const latSpan = north - south || 0.01;
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;

  let halfLon = lonSpan / 2 + Math.max(lonSpan * MAX_BOUNDS_PAD_FRACTION, MIN_MAX_BOUNDS_PAD_LON_DEG);
  let halfLat = latSpan / 2 + Math.max(latSpan * MAX_BOUNDS_PAD_FRACTION, MIN_MAX_BOUNDS_PAD_LAT_DEG);

  // Match degree span on both axes so wide viewports are not locked on east/west pan.
  const half = Math.max(halfLon, halfLat);
  halfLon = half;
  halfLat = half;

  return [
    [cx - halfLon, cy - halfLat],
    [cx + halfLon, cy + halfLat],
  ];
}

function viewportFit(
  bbox: [number, number, number, number],
): {
  bounds: [[number, number], [number, number]];
  fitBoundsOptions: {
    padding: number | { top: number; bottom: number; left: number; right: number };
    maxZoom?: number;
  };
} {
  const mobile = isMobileViewport();
  return {
    bounds: padBbox(bbox, mobile ? 0.28 : 0.1),
    fitBoundsOptions: mobile
      ? {
          padding: { top: 40, bottom: 120, left: 36, right: 36 },
          maxZoom: 12,
        }
      : { padding: 48 },
  };
}

function fitMapToData(map: MaplibreMap, bbox: [number, number, number, number]): void {
  const { bounds, fitBoundsOptions } = viewportFit(bbox);
  map.fitBounds(bounds, { ...fitBoundsOptions, duration: 0 });
}

function renderLegend(hexEdge: number, k: number, counts: number[]): void {
  const el = document.getElementById("legend");
  if (!el) return;
  const min = counts.length ? Math.min(...counts) : k;
  const max = counts.length ? Math.max(...counts) : k;
  el.innerHTML = `
    <h2>Aggregated density</h2>
    <p class="legend-note">~${Math.round(hexEdge)} m hexagons; min ${k} addresses each. Colour and hover use the same scale.</p>
    <div class="legend-row"><span class="legend-swatch" style="background:${COLORS.low}"></span> ${min} addresses</div>
    <div class="legend-row"><span class="legend-swatch" style="background:${COLORS.mid}"></span> mid</div>
    <div class="legend-row"><span class="legend-swatch" style="background:${COLORS.peak}"></span> ${max}${max > min ? "+" : ""} addresses</div>
  `;
}

function initFontControls(): void {
  const root = document.documentElement;
  const buttons = document.querySelectorAll<HTMLButtonElement>(".font-controls__btn");
  if (!buttons.length) return;

  function apply(size: string): void {
    root.classList.remove("font-large", "font-xlarge");
    if (size === "large") root.classList.add("font-large");
    if (size === "xlarge") root.classList.add("font-xlarge");
    buttons.forEach((btn) => {
      const on = btn.getAttribute("data-font") === size;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  apply("normal");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const size = btn.getAttribute("data-font") || "normal";
      apply(size);
    });
  });
}

/** On narrow screens, keep one sidebar panel open at a time. */
function initMobilePanels(): void {
  const panels = document.querySelectorAll<HTMLDetailsElement>(".sidebar-disclosure");
  if (!panels.length) return;

  const mq = window.matchMedia("(max-width: 720px)");

  panels.forEach((panel) => {
    panel.addEventListener("toggle", () => {
      if (!mq.matches || !panel.open) return;
      panels.forEach((other) => {
        if (other !== panel) other.open = false;
      });
    });
  });
}

async function init(): Promise<void> {
  const buildInfo = await loadBuildInfo();
  renderBuildProvenance(buildInfo);

  const [geojson, manifest] = await Promise.all([loadCells(), loadManifest()]);
  const { meta, features } = geojson;
  populatePrivacyPanel(manifest, meta);

  const mapEl = document.getElementById("map");
  if (!features.length) {
    if (mapEl) {
      mapEl.innerHTML =
        "<p style='padding:2rem'>No map data published yet. Run the offline pipeline.</p>";
    }
    return;
  }

  const counts = features.map((f) => Number(f.properties.count));
  const hexEdge = H3_EDGE_METRES[meta.h3Resolution] ?? 200;
  renderLegend(hexEdge, meta.k, counts);

  const { bounds, fitBoundsOptions } = viewportFit(meta.bbox);
  const maxBounds = maxBoundsFromBbox(meta.bbox);

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
          paint: { "raster-opacity": BASEMAP_OPACITY },
        },
      ],
    },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    bounds,
    maxBounds,
    fitBoundsOptions,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const fillColor = colorExpressionFromCounts(counts);

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      map.resize();
      fitMapToData(map, meta.bbox);
    }, 150);
  });

  map.on("load", () => {
    fitMapToData(map, meta.bbox);

    map.addSource("cells", { type: "geojson", data: geojson });

    map.addLayer({
      id: "cells-fill-under",
      type: "fill",
      source: "cells",
      paint: { "fill-color": fillColor, "fill-opacity": 0.4 },
    });

    map.addLayer({
      id: "cells-fill",
      type: "fill",
      source: "cells",
      paint: {
        "fill-color": fillColor,
        "fill-opacity": FILL_OPACITY,
        "fill-outline-color": "#7c2d12",
      },
    });

    map.addLayer({
      id: "cells-halo",
      type: "line",
      source: "cells",
      paint: {
        "line-color": "#7c2d12",
        "line-width": 4,
        "line-opacity": 0.5,
        "line-blur": 2,
      },
    });

    map.addLayer({
      id: "cells-outline",
      type: "line",
      source: "cells",
      paint: {
        "line-color": "#431407",
        "line-width": 2.5,
        "line-opacity": 0.95,
      },
    });

    const interactiveLayers = ["cells-fill", "cells-fill-under"];
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "240px",
      className: "density-popup",
    });

    map.on("mousemove", (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      if (!hits.length) {
        map.getCanvas().style.cursor = "";
        popup.remove();
        return;
      }
      const band = hits[0].properties?.countBand ?? "—";
      map.getCanvas().style.cursor = "help";
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="density-popup__inner"><span class="density-popup__label">This hex</span><span class="density-popup__value">${band}</span></div>`,
        )
        .addTo(map);
    });

    map.on("mouseleave", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
  });
}

async function initAuthChrome(): Promise<void> {
  try {
    const res = await fetch("/auth/session");
    if (!res.ok) return;
    const data = (await res.json()) as { signedIn?: boolean };
    if (!data.signedIn) return;
    const wrap = document.getElementById("auth-logout-wrap");
    if (wrap) wrap.hidden = false;
  } catch {
    /* auth disabled or offline */
  }
}

renderBuildProvenance(getBuildInfoFromScript());
initFontControls();
initMobilePanels();
void initAuthChrome();

init().catch((err) => {
  console.error(err);
  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.innerHTML =
      "<p style='padding:2rem;color:#fc8181'>Could not load map data. Run the offline pipeline first.</p>";
  }
});
