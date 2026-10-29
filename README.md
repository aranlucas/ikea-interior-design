# Roomform

An interior design studio built with TanStack Start + Router, React, Vercel AI SDK, and direct OpenAI image editing. Hosted as one Railway Node service with SQLite on a persistent volume.

Create a room, upload listing/camera photos, collect product photos or IKEA links, select references, and generate or refine a photorealistic visualization. Original architecture remains the prompt’s authority. Results include history, downloads and a before/after slider.

## Secrets

Varlock resolves `OPENAI_API_KEY`, `SESSION_SECRET`, and the OIDC client secret from Bitwarden Secrets Manager. `.env.schema` contains references, never secret values. Supply `BITWARDEN_ACCESS_TOKEN` securely to the process or Railway service. Use a project-scoped machine token. Production uses `varlock run` at boot; secrets are not embedded into the build.

## Development

Node 24+. Install with `npm ci`. Provide the Bitwarden bootstrap token to your shell, then run `npm run dev`. For a local studio without login, supply `DEV_AUTH_BYPASS=true` and `APP_URL=http://localhost:3000`; this is disabled in production. Local SQLite data lives in `.data/`. `npm run check`, `npm test`, and `npm run build` validate the app.

## Railway

Deploy the repository, mount a persistent volume at `/data`, set `DATA_DIR=/data`, and use one replica. `railway.json` configures build/start and health checks. The app uses SQLite WAL and short synchronous transactions for room changes; image generation happens outside those transactions. A per-user lease prevents overlapping paid generations. Back up the persistent volume before migrating or removing it. Images currently live as SQLite blobs; move them to object storage when usage grows.

## Authentication

The existing shared Better Auth service provides OIDC at `https://auth.aranlucas.workers.dev/api/auth`. Register a web client with the exact `${APP_URL}/api/auth/callback`, authorization-code grant, `openid profile email`, PKCE, and `client_secret_basic`. Set the returned client ID and store its secret in Bitwarden. This app verifies authorization state, nonce, PKCE and ID tokens using `openid-client`, then issues a seven-day encrypted HttpOnly app session. Storage and generation routes require that session; browser mutations require the configured app origin.

## Image generation

The server uses `createOpenAI().image()` through AI SDK `generateImage`, with room views first and product/style references afterward. `OPENAI_IMAGE_MODEL` is configurable. Images are resized in the browser before upload. IKEA import only fetches allowlisted HTTPS hosts; unsupported links need a photo and are retained as source labels. No general web scraping or automatic Zillow import. AI output is a visualization, not an accurate measurement or a guarantee of product fit.
