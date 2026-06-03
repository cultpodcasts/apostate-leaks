#!/usr/bin/env node
/**
 * Upload Auth0 / session secrets to Cloudflare via wrangler.
 *
 * Usage (from worker/):
 *   node scripts/set-wrangler-secrets.mjs              # interactive prompts
 *   node scripts/set-wrangler-secrets.mjs --from-file .dev.vars
 *   node scripts/set-wrangler-secrets.mjs --generate-session   # force-generate SESSION_SECRET when loading from file
 *
 * Requires: logged in to Cloudflare (`npx wrangler login`) and permission to update
 * the worker named in wrangler.toml.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.join(__dirname, "..");

const SECRET_NAMES = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "SESSION_SECRET",
];

/** Uploaded when set; omit to disable the Request access email button. */
const OPTIONAL_SECRET_NAMES = ["ACCESS_REQUEST_EMAIL", "ACCESS_REQUEST_FROM"];

const HINTS = {
  AUTH0_DOMAIN: "Tenant domain only, e.g. your-tenant.eu.auth0.com",
  AUTH0_CLIENT_ID: "Auth0 application Client ID",
  AUTH0_CLIENT_SECRET: "Auth0 application Client Secret",
  SESSION_SECRET: "optional — press Enter to auto-generate",
  ACCESS_REQUEST_EMAIL: "optional — inbox for access-request emails; Enter to skip",
  ACCESS_REQUEST_FROM:
    "optional — Email Service sender, e.g. access-request@cultpodcasts.com; Enter to skip",
};

function parseArgs(argv) {
  const opts = { fromFile: null, generateSession: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from-file") {
      opts.fromFile = argv[++i];
      if (!opts.fromFile) throw new Error("--from-file requires a path");
    } else if (arg === "--generate-session") {
      opts.generateSession = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`\
Set Cloudflare Worker secrets (npx wrangler secret put)

  node scripts/set-wrangler-secrets.mjs
  node scripts/set-wrangler-secrets.mjs --from-file .dev.vars
  node scripts/set-wrangler-secrets.mjs --dry-run

Required secrets: ${SECRET_NAMES.join(", ")}
Optional: ${OPTIONAL_SECRET_NAMES.join(", ")}
SESSION_SECRET is auto-generated if you press Enter (interactive) or leave it blank in the file.

For file upload: copy .dev.vars.example → .dev.vars, fill secrets, then --from-file .dev.vars
(only secret keys are uploaded; AUTH0_DISABLED and [vars] in wrangler.toml are ignored).
`);
}

function parseEnvFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(WORKER_ROOT, filePath);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const text = readFileSync(abs, "utf8");
  const out = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function generateSessionSecret() {
  return randomBytes(32).toString("base64");
}

async function promptLine(label, hint) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = hint ? `${label} (${hint}): ` : `${label}: `;
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

async function promptSessionSecret() {
  console.log(
    "SESSION_SECRET — used to sign login cookies. Leave blank and press Enter to generate a secure random value.",
  );
  const answer = await promptLine("SESSION_SECRET", HINTS.SESSION_SECRET);
  if (!answer) {
    const secret = generateSessionSecret();
    console.log(`Generated SESSION_SECRET (${secret.length} characters).`);
    return secret;
  }
  return answer;
}

function ensureSessionSecret(values, source) {
  if (values.SESSION_SECRET?.trim()) return values.SESSION_SECRET.trim();
  const secret = generateSessionSecret();
  console.log(`Generated SESSION_SECRET (${secret.length} characters)${source ? ` — ${source}` : ""}.`);
  return secret;
}

async function loadValues(opts) {
  const values = {};

  if (opts.fromFile) {
    Object.assign(values, parseEnvFile(opts.fromFile));
  }

  for (const name of SECRET_NAMES) {
    if (name === "SESSION_SECRET") {
      if (values.SESSION_SECRET?.trim()) continue;
      if (opts.fromFile || opts.generateSession) {
        values.SESSION_SECRET = ensureSessionSecret(values, opts.fromFile ? "not set in file" : "");
        continue;
      }
      values.SESSION_SECRET = await promptSessionSecret();
      continue;
    }

    if (values[name]?.trim()) continue;

    if (opts.fromFile) {
      throw new Error(`Missing ${name} in ${opts.fromFile}`);
    }

    values[name] = await promptLine(name, HINTS[name]);
    if (!values[name]) {
      throw new Error(`Empty value for ${name}`);
    }
  }

  for (const name of SECRET_NAMES) {
    if (!values[name]?.trim()) throw new Error(`Missing ${name}`);
  }

  for (const name of OPTIONAL_SECRET_NAMES) {
    if (opts.fromFile || values[name] !== undefined) continue;
    const answer = await promptLine(name, HINTS[name]);
    if (answer) values[name] = answer;
  }

  if (values.AUTH0_DOMAIN?.includes("://")) {
    throw new Error("AUTH0_DOMAIN must not include https:// — use the hostname only");
  }

  return values;
}

function putSecret(name, value, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] wrangler secret put ${name} (${value.length} chars)`);
    return;
  }

  console.log(`Setting ${name}…`);

  const result = spawnSync("npx", ["wrangler", "secret", "put", name], {
    cwd: WORKER_ROOT,
    input: value,
    encoding: "utf-8",
    stdio: ["pipe", "inherit", "inherit"],
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(
      `wrangler secret put ${name} failed (exit ${result.status}). Run: npx wrangler login`,
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const values = await loadValues(opts);

  const toUpload = [
    ...SECRET_NAMES,
    ...OPTIONAL_SECRET_NAMES.filter((name) => values[name]?.trim()),
  ];

  console.log(`\nUploading ${toUpload.length} secret(s) to worker in ${WORKER_ROOT}\n`);

  for (const name of toUpload) {
    putSecret(name, values[name].trim(), opts.dryRun);
  }

  console.log("\nDone. Redeploy or wait for the next Git build for secrets to apply.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
