# Map data (do not commit)

The offline pipeline writes `cells.geojson` and `meta.json` here locally.

**Do not commit these files to git** — public repositories render GeoJSON on GitHub and expose geography.

After `npm run audit` in `offline-pipeline/`:

```bash
cd worker
npm run r2:create    # once — bucket apostate-leaks-map-data
npm run upload:data
```

That uploads to Cloudflare R2 (`apostate-leaks-map-data`). The live site serves them only after Auth0 sign-in.
