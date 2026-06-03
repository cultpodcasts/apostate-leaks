/**
 * Wired into wrangler.toml [build]. Blocks `wrangler deploy` from a laptop;
 * Cloudflare Git builds set WORKERS_CI_* when they run deploy.
 */
const onCloudflare =
  process.env.WORKERS_CI === "true" ||
  process.env.WORKERS_CI === "1" ||
  Boolean(process.env.WORKERS_CI_COMMIT_SHA);

if (!onCloudflare) {
  console.error(`
Production deploy is disabled on this machine.

  Push to Git — Cloudflare Workers (Settings → Builds) deploys automatically.
  Local preview only:  cd worker && npm run dev

  Do not run: wrangler deploy, npm run deploy
`);
  process.exit(1);
}
