# Roomform

An interior design studio built with TanStack Start + Router, React, Vercel AI SDK, and direct OpenAI image editing. Hosted as one Railway Node service with SQLite on a persistent volume.

Create a room, upload listing/camera photos, collect product photos or IKEA links, select references, and generate or refine a photorealistic visualization. Original architecture remains the prompt’s authority. Results include history, downloads and a before/after slider.

## Secrets

Varlock resolves `OPENAI_API_KEY`, `SESSION_SECRET`, and the OIDC client secret from Bitwarden Secrets Manager. `.env.schema` contains references, never secret values. Supply `BITWARDEN_ACCESS_TOKEN` securely to the process or Railway service. Use a project-scoped machine token. Production uses `varlock run` at boot; secrets are not embedded into the build.

## Development

Node 24+. Install with `npm ci`, then run `npm run dev:local` for a local studio without Bitwarden or login. SQLite data defaults to `.data/`; generation is disabled unless you supply `OPENAI_API_KEY` in your shell. Override `DATA_DIR` or `APP_URL` as needed. When using `tailscale serve`, set `APP_URL` to the exact browser origin (for example, `https://host.tailnet.ts.net:8443`); its hostname is allowed by Vite and mutations require that origin.

For the regular secrets-backed setup, supply `BITWARDEN_ACCESS_TOKEN` and run `npm run dev`. Local mode applies only to the dev server; production authentication is unchanged. Validate with `npm run check`, `npm test`, `npm run lint`, and `npm run fmt:check`. Use `npm run fmt` to format and `npm run build` to build.

## Railway

Deploy the repository, mount a persistent volume at `/data`, set `DATA_DIR=/data`, and use one replica. `railway.json` configures build/start and health checks. The app uses SQLite WAL and short synchronous transactions for room changes; image generation happens outside those transactions. A per-user lease prevents overlapping paid generations. Back up the persistent volume before migrating or removing it. Images currently live as SQLite blobs; move them to object storage when usage grows.

## Authentication

The existing shared Better Auth service provides OIDC at `https://auth.aranlucas.workers.dev/api/auth`. The production web client is `roomform_dd49377094d4bb7659702cb9`, registered with the exact `https://roomform-production.up.railway.app/api/auth/callback`, authorization-code grant, `openid profile email`, PKCE, and `client_secret_basic`. Its secret is held in Bitwarden and referenced by `.env.schema`. Provisioning used `cf d1 query --batch` against the shared Auth database, following its existing deployment-owned client schema and SHA-256 secret hashing. This app verifies authorization state, nonce, PKCE and ID tokens using `openid-client`, then issues a seven-day encrypted HttpOnly app session. Storage and generation routes require that session; browser mutations require the configured app origin.

## Image generation

Generation has three modes: **Redesign** (preserve architecture, restyle and refurnish), **Stage** (furnish an empty room), and **Empty** (remove furniture, keep the shell). Before rendering, a layout pre-pass sends the base photo to a vision model (`OPENAI_LAYOUT_MODEL`, default `gpt-6-luna`) which estimates the room's geometry and returns a placement plan — where each selected product goes and what fraction of the wall it should span given its physical size. The plan is embedded in the image prompt and shown under the design. If the pre-pass fails, generation falls back to prompt-only guidance.

Sizes drive the render: `src/lib/scale.ts` parses product dimensions (`211 × 88 × 83 cm`, `W:84 1/4"`, mm/m/in, fractional inches) and room measurements (`4.2 × 3.6 m, ceiling 2.6 m`), and turns them into scale guidance with real wall ratios. Room measurements are optional, editable per room, and act as the scale authority when present. Output orientation follows the base photo's pixel aspect ratio, read server-side from JPEG headers (`src/lib/image-size.ts`); pixel dimensions are never treated as physical measurements. `OPENAI_IMAGE_MODEL` is configurable. Each run generates 1, 2, or 4 variations in one call; the per-user lease covers the longer runtime for larger batches. Images are resized in the browser before upload.

Product import reads Open Graph, Twitter, structured Product data, and main-page images on public HTTPS pages. Shopify variant links use the selected variant’s product image. Imports also capture structured physical dimensions and Shopify size options. Explicit variant sizes are selected automatically; multiple unselected sizes remain choices. Each reference has an editable physical-size field, which feeds the same scale guidance. Cheerio handles HTML parsing; ipaddr.js rejects non-public IP ranges, and HTTPS requests pin validated DNS results and recheck redirects. Websites that block access or require JavaScript still need an uploaded photo. No general web scraping or automatic Zillow import. AI output is a visualization, not an accurate measurement or a guarantee of product fit.
