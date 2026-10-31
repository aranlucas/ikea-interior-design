# Roomform

An interior design studio built with TanStack Start + Router, React, Vercel AI SDK, and direct OpenAI image editing. Hosted as one Railway Node service with SQLite on a persistent volume.

Create a room, upload listing/camera photos, collect product photos or IKEA links, select references, and generate or refine a photorealistic visualization. Original architecture remains the prompt’s authority. Results include history, downloads and a before/after slider.

Upload overlapping room photos, open **3D room**, and click **Build 3D room**. The server runs classical COLMAP DSP-SIFT extraction with affine feature shapes, guided brute-force matching, and structure from motion on the CPU. Two-view tracks are retained so small listing-photo sets can initialize. No wall labels, room measurements, AI models, external image services, or OpenAI key are needed. The saved preview contains recovered colored points and camera positions; orbit it or select a recovered photo angle. This is a sparse, partial reconstruction. Blank walls and unseen areas remain gaps, and the result has no known physical scale. It is not a solid, textured mesh or a measurement tool. Listing photos may fail to align when there is insufficient shared detail or camera movement. For best results, use several closer overlapping angles of the same unchanged room, with details visible in multiple photos.

If alignment fails, **Help match photo details** lets you mark at least 12 distinct corresponding points in a pair of photos. These are added to automatic matches and passed through geometric verification; they do not guarantee reconstruction. Pointer and keyboard input are supported. **Use a manual layout** retains the editable photo-covered rectangular room as an optional fallback. An optional **Create AI finish** action uses the existing image generator to produce a separate image from the original room photos. Its inferred areas are labeled, and it does not create measured 3D geometry.

For a solid approximate model, choose **AI-assisted**, then **Build AI room layout**. This sends up to the first eight room photos together to OpenAI vision with structured output, validates the floor outline, wall openings, and photo evidence, and saves a Three.js architectural block model. It estimates walls, windows, doors, cabinets, appliances, stairs, and existing large furniture. Orbit, zoom, switch to a top view, hide fixtures or inferred structure, and expand the assumptions and photo evidence. Inferred surfaces are amber; even elements visible in photos have estimated positions and sizes. This mode does not recover camera poses or depth maps, and its dimensions are not measured. It requires `OPENAI_API_KEY` and uses `OPENAI_VISION_MODEL` (default `gpt-6.1-sol`). Requests set `store: false`. The API work runs remotely; the Mac renders the geometry without CUDA, local model weights, or COLMAP. The separate **Create AI finish** action still produces only a 2D image.

Build status and results persist with the room. The client polls progress while a build runs, including across reloads. One reconstruction runs at a time per server, with four CPU threads and a 12-minute total deadline. Cancelling a build stops its child process. A failed rebuild keeps the previous successful result; changes to the input photos mark that result as outdated. A server restart marks an interrupted build as failed on the next status request so it can be retried. Temporary images and feature databases are removed after completion or cancellation.

AI layouts are stored in plan coordinates: facing plan +z, +x is on the right. `toSceneLayout` converts that convention once at the geometry boundary to Three.js's y-up coordinates, including fixture rotation and wall-opening placement. Stored evidence stays unchanged. Orientation regression tests project the actual geometry from opposing photo viewpoints to catch mirrored stairs and doors.

## Secrets

Varlock resolves `OPENAI_API_KEY`, `SESSION_SECRET`, and the OIDC client secret from Bitwarden Secrets Manager. `.env.schema` contains references, never secret values. Supply `BITWARDEN_ACCESS_TOKEN` securely to the process or Railway service. Use a project-scoped machine token. Production uses `varlock run` at boot; secrets are not embedded into the build.

On macOS, save the bootstrap token in your login Keychain once:

```bash
npm run secrets:store
```

Paste the token at the hidden prompt. The helper uses Apple's Security framework to create or update the `roomform.bitwarden-access-token` item for your macOS username. It accepts standard input for secure automation; the token never appears in command arguments or output. macOS may ask you to authorize Keychain access.

`npm run dev`, `npm run build`, `npm start`, and `npm run images -- --batch` read that item only when no `BITWARDEN_ACCESS_TOKEN` is already supplied. The token is exported to that command's process, not to your shell profile. To reuse an item created with [Bitwarden's Keychain guide](https://bitwarden.com/blog/how-to-securely-store-your-secrets-manager-access-tokens-with-bash-scripting/), set `BITWARDEN_KEYCHAIN_SERVICE` to its item name (for example, `BWS_ACCESS_TOKEN`) and `BITWARDEN_KEYCHAIN_ACCOUNT` to its account name. On Railway or other non-macOS hosts, continue supplying `BITWARDEN_ACCESS_TOKEN` through the platform's secret environment settings. `npm run dev:local` still works without credentials.

## Development

Node 24+. Install with `npm ci`, then run `npm run dev:local` for a local studio without Bitwarden or login. SQLite data defaults to `.data/`; generation is disabled unless you supply `OPENAI_API_KEY` in your shell. Override `DATA_DIR` or `APP_URL` as needed. When using `tailscale serve`, set `APP_URL` to the exact browser origin (for example, `https://host.tailnet.ts.net:8443`); its hostname is allowed by Vite and mutations require that origin.

For the regular secrets-backed setup, save the bootstrap token in macOS Keychain or supply `BITWARDEN_ACCESS_TOKEN` in the environment, then run `npm run dev`. Local mode applies only to the dev server; production authentication is unchanged. Validate with `npm run check`, `npm test`, `npm run lint`, and `npm run fmt:check`. Use `npm run fmt` to format and `npm run build` to build.

Automatic reconstruction requires **COLMAP 4.x** on the server. On macOS, install it with `brew install colmap`; optionally set `COLMAP_BIN` to an executable path before starting the app. The tested Mac uses COLMAP 4.2.1 without GPU support. The app explicitly selects SIFT and SIFT brute-force matching; learned features, neural matchers, and learned calibration are not enabled. Install the same engine in a production container before using automatic reconstruction there; the existing Railway service configuration does not install COLMAP. Sparse CPU reconstruction works without CUDA. COLMAP dense reconstruction requires a separate CUDA-capable worker, which this implementation does not provision. To run the real-engine integration test against a folder of overlapping `.jpeg`, `.png`, or `.webp` photos, use `ROOMFORM_COLMAP_TEST_IMAGES=/absolute/path/to/photos npx vitest run src/lib/colmap-runner.integration.test.ts`. Normal tests mock job execution and test parsing, match import, ownership, cancellation, saved results, and restart recovery.

## Railway

Deploy the repository, mount a persistent volume at `/data`, set `DATA_DIR=/data`, and use one replica. `railway.json` configures build/start and health checks. The app uses SQLite WAL and short synchronous transactions for room changes; image generation happens outside those transactions. A per-user lease prevents overlapping paid generations. Back up the persistent volume before migrating or removing it. Images currently live as SQLite blobs; move them to object storage when usage grows.

## Authentication

The existing shared Better Auth service provides OIDC at `https://auth.aranlucas.workers.dev/api/auth`. The production web client is `roomform_dd49377094d4bb7659702cb9`, registered with the exact `https://roomform-production.up.railway.app/api/auth/callback`, authorization-code grant, `openid profile email`, PKCE, and `client_secret_basic`. Its secret is held in Bitwarden and referenced by `.env.schema`. Provisioning used `cf d1 query --batch` against the shared Auth database, following its existing deployment-owned client schema and SHA-256 secret hashing. This app verifies authorization state, nonce, PKCE and ID tokens using `openid-client`, then issues a seven-day encrypted HttpOnly app session. Storage and generation routes require that session; browser mutations require the configured app origin.

## Image generation

The studio defaults to `gpt-image-2.5-sunburst`, explicit `max` quality, `3840x2160`, and PNG output. **Image settings** lets you choose all five quality levels or Auto, lower resolutions, portrait, square, or **Match photo** to preserve the source aspect ratio within the API's pixel limits. Settings save with each room. Outputs above `2560x1440` are experimental. Designs record the requested model, quality, size, and reported output-token usage; the displayed image-output cost excludes input tokens. Transient rate limits retry twice with backoff. Exhausted credits stop immediately and show billing guidance. Photos open in the Photo view; the 3D builder is available separately.

The server uses `createOpenAI().image()` through AI SDK `generateImage`, with room views first and product/style references afterward. `OPENAI_IMAGE_MODEL` is configurable. Images are resized in the browser before upload. Product import reads Open Graph, Twitter, structured Product data, and main-page images on public HTTPS pages. Shopify variant links use the selected variant’s product image. Imports also capture structured physical dimensions and Shopify size options. Explicit variant sizes are selected automatically; multiple unselected sizes remain choices. Each reference has an editable physical-size field, which is passed to generation as scale guidance alongside any room measurements in the design brief. Image pixel dimensions are never treated as real-world measurements. Cheerio handles HTML parsing; ipaddr.js rejects non-public IP ranges, and HTTPS requests pin validated DNS results and recheck redirects. Websites that block access or require JavaScript still need an uploaded photo. No general web scraping or automatic Zillow import. AI output is a visualization, not an accurate measurement or a guarantee of product fit.

### Generate images from a prompt file

Set `OPENAI_API_KEY` in your shell, then create `prompts.txt` with one prompt per line. The standalone script uses Sunburst, Max quality, `3840x2160`, and PNG. It writes `out/0001.png`, `out/0002.png`, and so on, prints each response's output tokens, and maintains a running image-output cost. Existing files are never overwritten.

```bash
node scripts/generate-images.mjs
node scripts/generate-images.mjs --batch
```

Batch submission prints a batch ID and saves its receipt under `out/`. Completion can take up to 24 hours. Collect the result using the printed command, `node scripts/generate-images.mjs --batch --collect batch_ID`, replacing `batch_ID` with that ID. Collection uses each request's custom ID to preserve numbering even when responses arrive out of order. It can be repeated after interruption; identical images are kept, and failures are saved to an error file.

The script retries rate limits with backoff and stops on `credit_balance_exhausted` or `insufficient_quota`. It reports image-output cost at $30 per million tokens, or $15 with Batch; text and image inputs cost extra. These are usage estimates, not a report of your credit balance. Use a project API key from the organization that received the credits. You may need to verify that organization before using image models. See the official [image generation guide](https://developers.openai.com/api/docs/guides/image-generation), [Batch guide](https://developers.openai.com/api/docs/guides/batch), and [API credit eligibility](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).
