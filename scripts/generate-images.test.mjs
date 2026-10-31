import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi, main } from "./generate-images.mjs";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRe8AAAAASUVORK5CYII=";
const image = (tokens = 100) => ({ data: [{ b64_json: png }], usage: { output_tokens: tokens } });
const directories = [];
async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), "roomform-image-script-"));
  directories.push(cwd);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  await writeFile(join(cwd, "prompts.txt"), "A warm living room\n\nAn oak kitchen\n");
  return cwd;
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

it("generates numbered PNGs with exact settings and running output-token costs", async () => {
  const cwd = await setup();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json(image(100)))
    .mockResolvedValueOnce(Response.json(image(200)));
  const log = vi.fn();
  await main([], { cwd, fetchImpl, log });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
    model: "gpt-image-2.5-sunburst",
    quality: "max",
    size: "3840x2160",
    output_format: "png",
    n: 1,
    prompt: "A warm living room",
  });
  expect(await readFile(join(cwd, "out/0002.png"))).toEqual(Buffer.from(png, "base64"));
  expect(log.mock.calls.at(-1)[0]).toContain("300 tokens, $0.0090");
  const noSpend = vi.fn();
  await expect(main([], { cwd, fetchImpl: noSpend, log })).rejects.toThrow("already exists");
  expect(noSpend).not.toHaveBeenCalled();
});

it("backs off for transient rate limits and never retries exhausted credits", async () => {
  const rateLimit = () =>
    Response.json(
      { error: { code: "rate_limit_exceeded", message: "Slow down" } },
      { status: 429 },
    );
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(rateLimit())
    .mockResolvedValueOnce(Response.json(image()));
  const wait = vi.fn();
  const request = createApi("test", { fetchImpl, wait, log: vi.fn() });
  await request("/v1/images/generations", { method: "POST", body: {} });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(wait.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
  const exhausted = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: { code: "credit_balance_exhausted" } }, { status: 429 }),
    );
  await expect(
    createApi("test", { fetchImpl: exhausted, wait })("/v1/images/generations"),
  ).rejects.toThrow("credit_balance_exhausted");
  expect(exhausted).toHaveBeenCalledTimes(1);
  expect(wait).toHaveBeenCalledTimes(1);
});

it("submits the same image requests as Batch JSONL and saves a receipt", async () => {
  const cwd = await setup();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ id: "file_input" }))
    .mockResolvedValueOnce(Response.json({ id: "batch_test", status: "validating" }));
  await main(["--batch"], { cwd, fetchImpl, log: vi.fn() });
  const form = fetchImpl.mock.calls[0][1].body;
  expect(form.get("purpose")).toBe("batch");
  const rows = (await form.get("file").text()).trim().split("\n").map(JSON.parse);
  expect(rows.map((row) => row.custom_id)).toEqual(["image-0001", "image-0002"]);
  expect(rows[0]).toMatchObject({
    url: "/v1/images/generations",
    body: { quality: "max", size: "3840x2160", model: "gpt-image-2.5-sunburst" },
  });
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toMatchObject({
    endpoint: "/v1/images/generations",
    completion_window: "24h",
    input_file_id: "file_input",
  });
  expect(JSON.parse(await readFile(join(cwd, "out/batch_test.json"), "utf8")).id).toBe(
    "batch_test",
  );
});

it("collects unordered results by custom ID, applies Batch pricing, and resumes safely", async () => {
  const cwd = await setup();
  await mkdir(join(cwd, "out"));
  await writeFile(join(cwd, "out/0002.png"), Buffer.from(png, "base64"));
  const job = {
    id: "batch_test",
    status: "completed",
    output_file_id: "file_output",
    request_counts: { completed: 2, total: 2, failed: 0 },
  };
  const rows = [2, 1]
    .map((n) =>
      JSON.stringify({
        custom_id: `image-000${n}`,
        response: { status_code: 200, body: image(n * 100) },
      }),
    )
    .join("\n");
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(Response.json(job))
    .mockResolvedValueOnce(new Response(rows));
  const log = vi.fn();
  await main(["--batch", "--collect", "batch_test"], { cwd, fetchImpl, log });
  expect(await readFile(join(cwd, "out/0001.png"))).toEqual(Buffer.from(png, "base64"));
  expect(log.mock.calls.at(-1)[0]).toContain("300 tokens, $0.0045");
});
