# Privacy-preserving geographic disclosure map

Two-part project: an **offline pipeline** processes a local CSV (never deployed), and a **Cloudflare Worker** serves an aggregated hex map only.

## Prerequisites

- Node.js 20+
- Cloudflare account with **Workers Git builds** connected to this repo ([deploy details](worker/DEPLOY.md))
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) for **local preview only** (`npm run dev`)

## Source data

Place your CSV under `source-data/` (gitignored). Expected columns:

| Index | Field |
|-------|--------|
| 0 | Timestamp |
| 1 | Address |
| 2+ | Comment (may contain commas and newlines; RFC 4180 quoted) |

Only rows whose comment is classified as **positive** (supporting sentiment) are geocoded and mapped. Neutral, negative, and empty comments are excluded.

Default input: `source-data/update-20260602-114715.csv`

## Offline pipeline

```bash
cd offline-pipeline
npm install
npm run process
```

Options:

```text
--input <path>     CSV file
--k <n>            k-anonymity threshold (default 5)
--h3 <res>         H3 resolution (default 8)
--jitter <metres>  Pre-aggregation jitter (default 75, 0 to disable)
--noise <n>        Max count noise (default 0)
--region <text>    Geocode hint (default "United Kingdom")
--skip-geocode     Parse and print stats only
--retry-failed     Clear failed-geocode list and try again
--include-all-sentiments  Disable positive-only filter (debug)
```

Geocoding uses [Nominatim](https://nominatim.org/release-docs/develop/api/Search/) at ≤1 req/s with a JSONL cache in `offline-pipeline/.cache/` (gitignored). Re-run safely; cached addresses are not looked up again.

Outputs (privacy-safe) into `worker/public/data/`:

- `cells.geojson` — hex polygons + binned counts
- `aggregates.json` — `[{ cellId, count }]`
- `meta.json` — resolution, k, bbox (no addresses)

Privacy audit before deploy:

```bash
npm run audit
```

## Worker (map site)

```bash
cd worker
npm install
npm run build   # client/*.ts → public/map.js + build-info.js
npm run dev     # local preview only — do not deploy from this machine
```

Map UI source is **`worker/client/`** (TypeScript). **`public/map.js`** is generated at build time.

Live site: [apostateleaks.cultpodcasts.com](https://apostateleaks.cultpodcasts.com/) (also [workers.dev](https://apostate-leaks-map.jonbreen.workers.dev))

**Production deploys:** push to Git; **Cloudflare** builds and deploys the worker only (see [worker/DEPLOY.md](worker/DEPLOY.md)). The **offline pipeline runs locally** — it does not run in Cloudflare.

### Open-source audit & provenance

Source: [github.com/cultpodcasts/apostate-leaks](https://github.com/cultpodcasts/apostate-leaks)

The map shows the **Git commit SHA** it was built from (top bar). Cloudflare’s build runs `npm run build` in `worker/`, which generates gitignored `public/build-info.js` and compiles `client/*.ts` → `public/map.js`.

### Deploy

Full checklist and dashboard settings: **[worker/DEPLOY.md](worker/DEPLOY.md)**.

**Local:** `npm run process` and `npm run audit` in `offline-pipeline/`, then **`npm run upload:data`** in `worker/` (R2 — **do not commit** `cells.geojson` or `meta.json` to git). **Push** code changes — Cloudflare deploys the worker; map files stay in R2 only.

Single map layer: **H3 resolution 8** (~460 m hexagons), **k=4** minimum per cell, **130 m jitter** before aggregation. Finer H3-9 is available via `--h3 9` but may publish no cells for small datasets. Positive comments only.

Re-run `npm run process` after CSV changes. Tune with `--k 4 --h3 8 --jitter 130`.

## Privacy checklist

- [ ] Raw CSV and `.cache/` never committed
- [ ] `cells.geojson` / `meta.json` never committed (upload with `npm run upload:data`)
- [ ] `npm run audit` passes
- [ ] k threshold appropriate for your dataset size
- [ ] Review suppressed vs published cell counts in pipeline output

## Folder layout

```text
source-data/           # raw CSV (gitignored)
offline-pipeline/      # local processing
worker/                # Cloudflare Worker + static map (DEPLOY.md)
```