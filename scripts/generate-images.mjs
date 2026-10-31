#!/usr/bin/env node
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const model = "gpt-image-2.5-sunburst";
const endpoint = "/v1/images/generations";
const settings = { model, quality: "max", size: "3840x2160", output_format: "png", n: 1 };
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const number = (index) => String(index + 1).padStart(4, "0");

export function createApi(key, { fetchImpl = fetch, wait = sleep, log = console.log } = {}) {
  return async function request(path, { method = "GET", body } = {}) {
    for (let attempt = 0; ; attempt++) {
      const multipart = body instanceof FormData;
      const response = await fetchImpl(`https://api.openai.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
        signal: AbortSignal.timeout(600_000),
      });
      if (response.ok) return response;
      const text = await response.text();
      let detail;
      try {
        detail = JSON.parse(text).error;
      } catch {
        /* Non-JSON gateway response. */
      }
      const code = detail?.code;
      if (code === "credit_balance_exhausted" || code === "insufficient_quota")
        throw new Error(
          `${code}: No API credits remain. Check billing and use a key from the organization that received the credits.`,
        );
      if (response.status !== 429 || attempt >= 5)
        throw new Error(
          `OpenAI HTTP ${response.status}${code ? ` (${code})` : ""}: ${detail?.message || text.slice(0, 300)}`,
        );
      const retryAfter = response.headers.get("retry-after");
      const retryMs =
        retryAfter && Number.isFinite(Number(retryAfter))
          ? Number(retryAfter) * 1000
          : retryAfter
            ? Date.parse(retryAfter) - Date.now()
            : 0;
      const delay = Math.max(
        1000 * 2 ** attempt + Math.random() * 250,
        Math.min(60_000, retryMs || 0),
      );
      log(`Rate limited. Retrying in ${(delay / 1000).toFixed(1)}s…`);
      await wait(delay);
    }
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function saveImage(out, index, body, collecting = false) {
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) throw new Error(`Image ${number(index)}: response has no image data.`);
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.subarray(0, 8).equals(pngSignature))
    throw new Error(`Image ${number(index)}: response is not a PNG.`);
  const file = join(out, `${number(index)}.png`);
  // Collection can be repeated after interruption; only reuse identical bytes.
  if (collecting && (await exists(file))) {
    if (!(await readFile(file)).equals(bytes)) throw new Error(`Refusing to overwrite ${file}.`);
  } else {
    await writeFile(file, bytes, { flag: "wx" });
  }
  return file;
}

function usageReporter(batch, log) {
  let total = 0;
  let missing = false;
  const rate = batch ? 15 : 30;
  return (file, usage) => {
    const tokens = usage?.output_tokens;
    if (Number.isFinite(tokens) && tokens >= 0) total += tokens;
    else missing = true;
    log(
      `${file}: ${tokens ?? "unknown"} output tokens. Running ${missing ? "known " : ""}total: ${total} tokens, $${((total * rate) / 1_000_000).toFixed(4)} image output.`,
    );
  };
}

export async function main(args = process.argv.slice(2), { cwd = process.cwd(), ...options } = {}) {
  const log = options.log ?? console.log;
  const batch = args.includes("--batch");
  const collectIndex = args.indexOf("--collect");
  const collect = collectIndex >= 0 ? args[collectIndex + 1] : undefined;
  if (args.includes("--help")) {
    log(
      "node scripts/generate-images.mjs [--batch] [--collect batch_ID]\nReads prompts.txt, writes ./out/0001.png, etc.\n--batch submits a job (up to 24 hours); --batch --collect batch_ID saves its results.\nReads OPENAI_API_KEY. Output cost excludes text/image input tokens.",
    );
    return;
  }
  const allowed = new Set(["--batch", "--collect", collect]);
  if (
    args.some((arg) => !allowed.has(arg)) ||
    (collectIndex >= 0 && (!batch || !/^batch_[\w-]+$/.test(collect ?? "")))
  )
    throw new Error("Usage: node scripts/generate-images.mjs [--batch] [--collect batch_ID]");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set OPENAI_API_KEY to a key from your credited OpenAI organization.");
  const request = createApi(key, options);
  const out = resolve(cwd, "out");
  await mkdir(out, { recursive: true });
  const report = usageReporter(batch, log);
  log(
    `Model: ${model} · quality: max · size: 3840x2160 · PNG. Image output: $${batch ? 15 : 30}/million tokens; input tokens cost extra. 4K output is experimental.`,
  );

  if (collect) {
    const job = await (await request(`/v1/batches/${encodeURIComponent(collect)}`)).json();
    log(
      `${job.id}: ${job.status} (${job.request_counts?.completed ?? 0}/${job.request_counts?.total ?? "?"} completed)`,
    );
    const terminal = ["completed", "failed", "expired", "cancelled"].includes(job.status);
    if (!terminal) {
      log(
        `Not ready yet. Run again later: node scripts/generate-images.mjs --batch --collect ${collect}`,
      );
      return;
    }
    let failed = job.request_counts?.failed ?? 0;
    if (job.output_file_id) {
      const text = await (
        await request(`/v1/files/${encodeURIComponent(job.output_file_id)}/content`)
      ).text();
      for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
        const row = JSON.parse(line);
        const match = /^image-(\d+)$/.exec(row.custom_id ?? "");
        if (!match || Number(match[1]) < 1)
          throw new Error("Unexpected batch custom_id; cannot safely name the image.");
        if (row.error || row.response?.status_code !== 200) {
          failed++;
          const error = row.error ?? row.response?.body?.error;
          if (["credit_balance_exhausted", "insufficient_quota"].includes(error?.code))
            throw new Error(`${error.code}: No API credits remain. Stopped collecting.`);
          log(`${row.custom_id} failed: ${error?.message ?? "Unknown request error"}`);
          continue;
        }
        const file = await saveImage(out, Number(match[1]) - 1, row.response.body, true);
        report(file, row.response.body.usage);
      }
    }
    if (job.error_file_id) {
      const errors = await (
        await request(`/v1/files/${encodeURIComponent(job.error_file_id)}/content`)
      ).text();
      await writeFile(join(out, `${collect}-errors.jsonl`), errors);
      log(`Request errors saved to ${join(out, `${collect}-errors.jsonl`)}.`);
    }
    if (job.status !== "completed" || failed)
      throw new Error(
        `Batch ${job.status}; some images may be missing. Saved images were kept. ${JSON.stringify(job.errors ?? {})}`,
      );
    return;
  }

  const prompts = (await readFile(join(cwd, "prompts.txt"), "utf8"))
    .split(/\r?\n/)
    .map((prompt) => prompt.trim())
    .filter(Boolean);
  if (!prompts.length) throw new Error("prompts.txt has no prompts. Add one prompt per line.");
  if (prompts.some((prompt) => prompt.length > 32_000))
    throw new Error("Each prompt must be at most 32,000 characters.");
  // Check the whole destination before spending credits on the first request.
  for (let i = 0; i < prompts.length; i++) {
    if (await exists(join(out, `${number(i)}.png`)))
      throw new Error(
        `out/${number(i)}.png already exists. Move existing images before starting a new run.`,
      );
  }
  if (batch) {
    if (prompts.length > 50_000) throw new Error("A batch supports at most 50,000 prompts.");
    const jsonl =
      prompts
        .map((prompt, i) =>
          JSON.stringify({
            custom_id: `image-${number(i)}`,
            method: "POST",
            url: endpoint,
            body: { ...settings, prompt },
          }),
        )
        .join("\n") + "\n";
    if (Buffer.byteLength(jsonl) > 200_000_000)
      throw new Error("Batch input exceeds the 200 MB limit.");
    const form = new FormData();
    form.set("purpose", "batch");
    form.set("file", new Blob([jsonl], { type: "application/jsonl" }), "images.jsonl");
    const upload = await (await request("/v1/files", { method: "POST", body: form })).json();
    const job = await (
      await request("/v1/batches", {
        method: "POST",
        body: {
          input_file_id: upload.id,
          endpoint,
          completion_window: "24h",
        },
      })
    ).json();
    await writeFile(join(out, `${job.id}.json`), JSON.stringify({ ...job, settings }, null, 2));
    log(
      `Submitted ${prompts.length} images: ${job.id}. Completion can take up to 24 hours.\nCollect later: node scripts/generate-images.mjs --batch --collect ${job.id}`,
    );
    return;
  }
  for (let i = 0; i < prompts.length; i++) {
    const body = await (
      await request(endpoint, { method: "POST", body: { ...settings, prompt: prompts[i] } })
    ).json();
    const file = await saveImage(out, i, body);
    report(file, body.usage);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
