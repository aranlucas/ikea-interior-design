import { describe, expect, it } from "vitest";
import { observeJob } from "./watched-job";
import type { GenerationJob } from "./types";
const job = (id: string, status: GenerationJob["status"]): GenerationJob => ({
  id,
  status,
  roomId: "room",
  owner: "owner",
  error: null,
  designId: null,
  createdAt: "",
  updatedAt: "",
});
describe("generation jobs watched by this tab", () => {
  it("ignores old completed and failed jobs discovered on load", () => {
    for (const status of ["succeeded", "failed"] as const)
      expect(observeJob(undefined, job("old", status)).act).toBe(false);
  });
  it("watches an existing running job and handles its completion exactly once", () => {
    const running = observeJob(undefined, job("a", "running"));
    expect(running).toEqual({ watching: "a", act: false });
    const done = observeJob(running.watching, job("a", "succeeded"));
    expect(done).toEqual({ watching: undefined, act: true });
    expect(observeJob(done.watching, job("a", "succeeded")).act).toBe(false);
  });
  it("handles failure of a started job but ignores unrelated terminal jobs", () => {
    expect(observeJob("a", job("b", "failed")).act).toBe(false);
    expect(observeJob("a", null).act).toBe(false);
    expect(observeJob("a", job("a", "failed"))).toEqual({ watching: undefined, act: true });
    expect(observeJob("a", job("b", "running"))).toEqual({ watching: "b", act: false });
  });
});
