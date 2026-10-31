// Offline, opt-in reproduction. No credentials, network, or production data.
// Run each mode in a fresh process: node scripts/profile-image-memory.mjs sdk 1
//                                 node scripts/profile-image-memory.mjs native 1
import { createOpenAI } from "@ai-sdk/openai";
import { generateImage } from "ai";
import { spawnSync } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const worker = process.argv[2] === "--worker";
const [mode = "native", countText = "1", directory] = process.argv.slice(worker ? 3 : 2);
const count = Number(countText);
if (!["sdk", "native"].includes(mode) || ![1, 4, 8].includes(count)) {
  throw new Error("Usage: node scripts/profile-image-memory.mjs <sdk|native> <1|4|8>");
}

if (!worker) {
  const temporary = mkdtempSync(join(tmpdir(), "roomform-image-memory-"));
  try {
    // A valid high-entropy 4K PNG, not a claim about production image sizes.
    const png = syntheticPng();
    writeFileSync(
      join(temporary, "response.json"),
      JSON.stringify({
        created: 1,
        data: Array.from({ length: count }, () => ({ b64_json: png.toString("base64") })),
      }),
    );
    console.log(JSON.stringify({ fixture: "synthetic 3840x2160 RGB PNG", bytes: png.length }));
    // Fixture construction is outside the measured process. Its fake fetch
    // streams JSON from disk through the installed SDK's real response parser.
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--worker", mode, String(count), temporary],
      { stdio: "inherit" },
    );
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
} else {
  const database = new DatabaseSync(join(directory, "images.sqlite"));
  try {
    database.exec("CREATE TABLE images (id INTEGER PRIMARY KEY, data BLOB NOT NULL)");
    const model = createOpenAI({
      apiKey: "offline-fake-key",
      fetch: async () =>
        new Response(Readable.toWeb(createReadStream(join(directory, "response.json"))), {
          headers: { "content-type": "application/json" },
        }),
    }).image("gpt-image-2.5-sunburst");
    const beforeRss = process.memoryUsage().rss;
    const start = performance.now();
    const result = await generateImage({
      model,
      prompt: "Offline synthetic fixture; no network",
      size: "3840x2160",
      n: count,
      maxRetries: 0,
    });
    const afterTransportRss = process.memoryUsage().rss;
    let totalBytes = 0;
    for (const [index, image] of result.images.entries()) {
      const bytes = mode === "sdk" ? image.uint8Array : Buffer.from(image.base64, "base64");
      totalBytes += bytes.byteLength;
      database
        .prepare("INSERT INTO images VALUES (?,?)")
        .run(index, mode === "sdk" ? Buffer.from(bytes) : bytes);
    }
    console.log(
      JSON.stringify({
        mode,
        count,
        totalBytes,
        elapsedMs: Math.round(performance.now() - start),
        beforeRss,
        afterTransportRss,
        afterRss: process.memoryUsage().rss,
        peakRss: process.resourceUsage().maxRSS * 1024,
      }),
    );
  } finally {
    database.close();
  }
}

function syntheticPng() {
  const width = 3840;
  const height = 2160;
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  let state = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      pixels[y * stride + 1 + x * 3] = state & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(data, crc32(name)));
  return Buffer.concat([length, name, data, checksum]);
}
