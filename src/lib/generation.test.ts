import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("ai", () => ({ generateImage: vi.fn() }));
import { generateImage } from "ai";
const directory = mkdtempSync(join(tmpdir(), "roomform-jobs-"));
beforeAll(() => {
  process.env.DATA_DIR = directory;
  process.env.OPENAI_API_KEY = "test";
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it("persists a paid result after POST returns, scopes status, and releases the lease", async () => {
  const s = await import("./storage.server");
  const { startGeneration } = await import("./generation.server");
  const owner = "jobs-success";
  const roomId = crypto.randomUUID();
  const baseId = crypto.randomUUID();
  const key = s.ownerPrefix(owner) + roomId + "/base.jpeg";
  await s.save(key, new Uint8Array([1]), "image/jpeg");
  await s.saveRooms(owner, [
    {
      id: roomId,
      name: "Room",
      type: "Living",
      notes: "",
      style: "",
      assets: [{ id: baseId, key, name: "Base", kind: "room" }],
      designs: [],
      createdAt: new Date().toISOString(),
    },
  ]);
  let complete!: (value: unknown) => void;
  vi.mocked(generateImage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = (value) => resolve(value as Awaited<ReturnType<typeof generateImage>>);
      }) as ReturnType<typeof generateImage>,
  );
  const { jobId } = await startGeneration(owner, {
    roomId,
    baseId,
    notes: "",
    style: "",
    assetIds: [],
  });
  expect(s.getJob(owner, jobId)?.status).toBe("running");
  expect(s.getJob("other", jobId)).toBeUndefined();
  await expect(
    startGeneration(owner, { roomId, baseId, notes: "", style: "", assetIds: [] }),
  ).rejects.toThrow("already");
  await s.mutateRooms(owner, (all) => {
    all[0].notes = "Edited while generating";
  });
  complete({ image: { uint8Array: new Uint8Array([1, 2]) } });
  await vi.waitFor(() => expect(s.getJob(owner, jobId)?.status).toBe("succeeded"));
  const job = s.getJob(owner, jobId)!;
  expect((await s.rooms(owner))[0].designs[0].id).toBe(job.designId);
  expect((await s.rooms(owner))[0].notes).toBe("Edited while generating");
  expect(s.claimGeneration(owner)).toBe(true);
  s.releaseGeneration(owner);
  vi.mocked(generateImage).mockRejectedValueOnce(new Error("Provider failed"));
  const failed = await startGeneration(owner, {
    roomId,
    baseId,
    notes: "",
    style: "",
    assetIds: [],
  });
  await vi.waitFor(() => expect(s.getJob(owner, failed.jobId)?.status).toBe("failed"));
  expect(s.getJob(owner, failed.jobId)?.error).toBe("Provider failed");
  expect(s.claimGeneration(owner)).toBe(true);
  s.releaseGeneration(owner);
});
it("recovers interrupted jobs and leases when a new server opens the database", async () => {
  const s = await import("./storage.server");
  expect(s.claimGeneration("restart")).toBe(true);
  const job = s.createJob("restart", crypto.randomUUID());
  const done = s.createJob("completed", crypto.randomUUID());
  s.finishJob("someone-else", done.id, { error: "Wrong owner" });
  expect(s.getJob("completed", done.id)?.status).toBe("running");
  s.finishJob("completed", done.id, { designId: "finished-design" });
  s.finishJob("completed", done.id, { error: "Late failure" });
  expect(s.getJob("completed", done.id)?.status).toBe("succeeded");
  vi.resetModules();
  const restarted = await import("./storage.server");
  expect(restarted.getJob("restart", job.id)?.status).toBe("failed");
  expect(restarted.getJob("restart", job.id)?.error).toContain("restart");
  expect(restarted.claimGeneration("restart")).toBe(true);
  expect(restarted.getJob("completed", done.id)?.status).toBe("succeeded");
});
