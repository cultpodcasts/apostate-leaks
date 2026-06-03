# Deploying the map worker

**Canonical URL:** [https://apostateleaks.cultpodcasts.com/](https://apostateleaks.cultpodcasts.com/)

**Production deploys are done only by Cloudflare** (Workers → your project → Settings → **Builds**, Git connection). Do not deploy from a laptop.

The **offline pipeline never runs on Cloudflare**. It runs on your machine, writes into `worker/public/data/`, and you **upload those files to R2** (`npm run upload:data`). **Do not commit** `cells.geojson` or `meta.json` to git — public GitHub repos preview GeoJSON on a map. Cloudflare builds and deploys the worker code only.

## What to run locally

### Update map data (offline pipeline)

```bash
cd offline-pipeline
npm install
npm run process
npm run audit
```

Then upload map data (from `worker/`):

```bash
npm run upload:data
```

Creates/updates objects in R2 bucket `apostate-leaks-map-data`.

**First time only** — create the bucket (dashboard → **R2** → **Create bucket**, name `apostate-leaks-map-data`, or from `worker/` after `npx wrangler login`):

```bash
npm run r2:create
```

### Preview the site

```bash
cd worker
npm install
npm run dev    # runs build then wrangler dev — http://localhost:8787
```

`wrangler deploy` is blocked on local machines (`wrangler.toml` `[build]` runs `assert-cloudflare-ci.mjs`).

## Cloudflare build settings

| Setting | Value |
|---------|--------|
| **Root directory** | `worker` |
| **Build command** | `npm ci && npm run build` |
| **Deploy command** | `npx wrangler deploy` |

`npm run build` generates `public/build-info.js` (commit SHA) and compiles `client/*.ts` → `public/map.js`.

`wrangler.toml` `[build]` runs the same `npm run build` again during `wrangler deploy` (harmless duplicate).

Do **not** point the Cloudflare build at `offline-pipeline/` — that tooling is local-only.

## Auth0 (required for production)

The worker enforces Auth0 sign-in and a required role before serving any page. See **[AUTH0.md](AUTH0.md)**.

Set these **secrets** in Cloudflare (Worker → Settings → Variables and Secrets):

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `SESSION_SECRET`
- `ACCESS_REQUEST_EMAIL` (optional — inbox for access-request emails; not in git)

Vars in `wrangler.toml` include `REQUIRED_ROLE` (default `map-viewer`), callback URLs, and optional `ACCESS_REQUEST_URL`. Optional secrets `ACCESS_REQUEST_FROM` and `ACCESS_REQUEST_EMAIL` enable the access-request email button.

**Request access** emails use [Cloudflare Email Service](https://developers.cloudflare.com/email-service/get-started/send-emails/) (`[[send_email]]` in `wrangler.toml`). Onboard the sending domain in the dashboard before deploy.

## Source layout

- `offline-pipeline/` — local CSV processing → `worker/public/data/` (gitignored; upload to R2)
- `worker/client/` — browser map UI (TypeScript)
- `worker/src/` — Cloudflare Worker
- `worker/public/map.js` — generated at build (gitignored)

## Release checklist

1. **Local:** `npm run process` and `npm run audit` in `offline-pipeline/`.
2. **Upload:** `npm run upload:data` in `worker/` (after audit).
3. **Commit & push** code changes only (never `public/data/*.geojson` or `meta.json`).
4. Cloudflare dashboard build deploys the worker.

### Map data was previously in git?

Remove the files from the latest commit and **purge git history** (or make the repo private) so GitHub no longer serves `cells.geojson` in the file viewer. Historic commits may still contain coordinates until rewritten.

There is **no** GitHub Actions deploy workflow in this repository.

## Open Graph image

Share preview uses `public/og-image.png` (1200×630, 1.91:1). The typographic master is `public/og-image-source.png`; after editing it, run `npm run render:og` in `worker/` and commit both PNGs. `/og-image.png` and OG/Twitter meta on the sign-in page are served without Auth0 so link previews work.
