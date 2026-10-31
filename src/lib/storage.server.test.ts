import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, save } from "./storage.server";

const directory = mkdtempSync(join(tmpdir(), "roomform-storage-"));
beforeAll(() => {
  process.env.DATA_DIR = directory;
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it.each(["", "A room with café furniture 🪑\u0000"])(
  "stores strings as UTF-8 binary data: %j",
  async (value) => {
    await save("text", value, "application/json");
    const stored = await load("text");
    expect(stored).toBeInstanceOf(Uint8Array);
    expect(stored).toEqual(new Uint8Array(Buffer.from(value, "utf8")));
  },
);

it.each([
  ["Uint8Array", () => new Uint8Array([99, 1, 128, 255, 77])],
  ["Buffer", () => Buffer.from([99, 1, 128, 255, 77])],
] as const)("stores only the exact %s subarray range", async (_name, makeBytes) => {
  const bytes = makeBytes();
  const view = bytes.subarray(1, 4);
  await save("image", view, "image/png");
  expect(await load("image")).toEqual(new Uint8Array([1, 128, 255]));
});

it.each([
  ["Uint8Array", () => new Uint8Array([99, 1, 128, 255, 77])],
  ["Buffer", () => Buffer.from([99, 1, 128, 255, 77])],
] as const)("snapshots %s bytes before the caller can mutate them", async (_name, makeBytes) => {
  const bytes = makeBytes();
  const saved = save("snapshot", bytes.subarray(1, 4), "image/png");
  // save() has bound and copied the bytes even before its promise is awaited.
  bytes.fill(0);
  await saved;
  expect(await load("snapshot")).toEqual(new Uint8Array([1, 128, 255]));
});
