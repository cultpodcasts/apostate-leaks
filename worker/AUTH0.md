# Auth0 access control

The map site is protected at the **Cloudflare Worker** (not in browser JavaScript only). Visitors must sign in with Auth0 and have a specific **role** before any HTML, map data, or assets are served.

`wrangler.toml` sets `run_worker_first = true` so the Worker runs **before** static files (default Cloudflare behaviour serves `/index.html` directly and would skip Auth0).

## Auth0 application setup

1. In [Auth0 Dashboard](https://manage.auth0.com/) → **Applications** → create or use a **Regular Web Application**.
2. **Application URIs**
   - **Allowed Callback URLs:**  
     `https://apostateleaks.cultpodcasts.com/auth/callback`  
     (add `http://localhost:8787/auth/callback` for local testing if needed)
   - **Allowed Logout URLs:**  
     `https://apostateleaks.cultpodcasts.com`  
     (and `http://localhost:8787` for local dev)
3. Note **Domain**, **Client ID**, and **Client Secret**.

## Roles

1. **User Management** → **Roles** → create a role, e.g. `map-viewer`.
2. Assign that role to users who may access the map.
3. **Actions** → **Library** → **Build Custom** → **Login / Post Login** — add an Action so roles appear in the ID token:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://api.cultpodcasts.com";
  if (event.authorization?.roles?.length) {
    api.idToken.setCustomClaim(`${namespace}/roles`, event.authorization.roles);
  }
};
```

4. Attach the Action to the Login flow (drag into **Post Login**).
5. Ensure the role name matches `REQUIRED_ROLE` in `wrangler.toml` (default: `map-viewer`).

Alternatively set `AUTH0_ROLE_CLAIM` in Wrangler vars if you use a different claim name.

## Cloudflare Worker configuration

### Vars (`wrangler.toml` or dashboard **Variables**)

| Name | Example |
|------|---------|
| `AUTH0_BASE_URL` | `https://apostateleaks.cultpodcasts.com` |
| `AUTH0_CALLBACK_URL` | `https://apostateleaks.cultpodcasts.com/auth/callback` |
| `REQUIRED_ROLE` | `map-viewer` |
| `AUTH0_ROLE_CLAIM` | `https://api.cultpodcasts.com/roles` (must match your Auth0 Action namespace) |
| `AUTH0_DISABLED` | `false` (production) |
| `AUTH0_DEBUG` | `false` in production (`true` only for staging — exposes JWT on access denied) |
| `ACCESS_REQUEST_URL` | Optional HTTPS form link if not using the email button |

### Secrets (dashboard → **Settings** → **Variables and Secrets** → **Encrypt**)

| Secret | Description |
|--------|-------------|
| `AUTH0_DOMAIN` | Tenant domain, e.g. `your-tenant.eu.auth0.com` (no `https://`) |
| `AUTH0_CLIENT_ID` | Application client ID |
| `AUTH0_CLIENT_SECRET` | Application client secret |
| `SESSION_SECRET` | Long random string (32+ bytes) for signing session cookies |
| `ACCESS_REQUEST_EMAIL` | Inbox that receives access-request emails |
| `ACCESS_REQUEST_FROM` | Sender address on a domain onboarded in [Cloudflare Email Service](https://developers.cloudflare.com/email-service/get-started/send-emails/) |

Generate a session secret:

```bash
openssl rand -base64 32
```

### Upload secrets with Wrangler (script)

From `worker/`, after `npx wrangler login`:

```bash
# Interactive — prompts for each value (press Enter at SESSION_SECRET to auto-generate)
npm run secrets:auth0

# Or from .dev.vars (copy .dev.vars.example → .dev.vars, include ACCESS_REQUEST_EMAIL if used)
node scripts/set-wrangler-secrets.mjs --from-file .dev.vars
```

If `SESSION_SECRET` is empty or omitted, a random value is generated automatically.  
The **Request access** button uses the Worker’s `EMAIL` binding ([Cloudflare Email Service](https://developers.cloudflare.com/email-service/get-started/send-emails/)). Onboard your sending domain in the dashboard (**Email Sending** → **Onboard Domain**), then set secrets `ACCESS_REQUEST_FROM` (sender) and `ACCESS_REQUEST_EMAIL` (inbox). Omit them to fall back to `ACCESS_REQUEST_URL` or generic contact text. Neither address is exposed in HTML.

For local testing with `wrangler dev`, add `remote = true` under `[[send_email]]` in `wrangler.toml` (see Cloudflare remote bindings docs).  
Use `--dry-run` to print what would be set without calling Cloudflare. Non-secret keys in `.dev.vars` are ignored.

## Local development

```bash
cd worker
cp .dev.vars.example .dev.vars
```

- **`AUTH0_DISABLED=true`** (default in the example) — skip login while developing UI.
- **`AUTH0_DISABLED=false`** — uncomment Auth0 secrets and local URLs in `.dev.vars`, and add `http://localhost:8787/auth/callback` in Auth0.

## Routes

| Path | Purpose |
|------|---------|
| `/` | HTML: map if signed in, otherwise sign-in page (200, no redirect loop) |
| `/auth/login` | HTML sign-in page; `?go=1` starts OAuth (only redirect to Auth0) |
| `/auth/callback` | OAuth callback — serves the map HTML directly (200 + session cookie) |
| `/auth/logout` | Clears session cookies and redirects to Auth0 logout (then back to the site) |
| `/auth/session` | JSON `{ "signedIn": true/false }` for the map UI |
| `/auth/request-access` | POST — sends access-request email (requires session without the required role) |
| `/privacy` | Public sign-in & account privacy (no map/application details) |
| `/*` assets (`.js`, `.geojson`, …) | 401 if unsigned in (not redirected) |

## Users without the required role

If someone signs in but lacks `REQUIRED_ROLE`, they see a generic **Access denied** page (no role names shown). It includes their Auth0 user ID (and email when available) plus **Request access** when Email Service is configured (`[[send_email]]`, `ACCESS_REQUEST_FROM`, and `ACCESS_REQUEST_EMAIL` secret). The email to you contains only user ID and email — not their roles.

Assign the role in Auth0 → **User Management** → **Users** → **Roles** when you approve a request.

## Troubleshooting “Access denied” after sign-in

With `AUTH0_DEBUG=true`, the access-denied page shows decoded ID/access token claims, roles found per claim, and the raw JWTs.

Common causes:

1. **Post-Login Action missing or not attached** — roles assigned in the dashboard are not in the token until the Action runs (see [Roles](#roles)).
2. **Wrong claim name** — the worker reads `AUTH0_ROLE_CLAIM` (default `https://api.cultpodcasts.com/roles`). Your Action must use the same namespace.
3. **Role name mismatch** — token must include `map-viewer` (or whatever `REQUIRED_ROLE` is).

The worker merges roles from **both** the ID token and access token (and `permissions` on the access token when present).

## Privacy note

Sign-in, **cookies** (<code>al_session</code>, <code>al_oauth_state</code>), and **Request access** are described in the public **[privacy policy](/privacy)** (linked on sign-in and access-denied pages), including Auth0’s role and Auth0’s own cookies on their domain. Data-removal requests: **privacy@cultpodcasts.com**.
