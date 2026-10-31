import { afterEach, expect, it, vi } from "vitest";
import { setTimeout } from "node:timers/promises";
import { generationError, retryImageRequest } from "./image-errors.server";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
it("stops immediately on exhausted credits even though the API returns 429", async () => {
  const error = {
    statusCode: 429,
    responseBody: JSON.stringify({ error: { code: "credit_balance_exhausted" } }),
  };
  const work = vi.fn().mockRejectedValue(error);
  await expect(retryImageRequest(work, new AbortController().signal)).rejects.toBe(error);
  expect(work).toHaveBeenCalledTimes(1);
  expect(setTimeout).not.toHaveBeenCalled();
  expect(generationError(error)).toContain("organization has no API credits");
});
it("retries transient rate limits with backoff but caps attempts", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const error = { statusCode: 429, data: { error: { code: "rate_limit_exceeded" } } };
  const work = vi.fn().mockRejectedValue(error);
  const signal = new AbortController().signal;
  await expect(retryImageRequest(work, signal)).rejects.toBe(error);
  expect(work).toHaveBeenCalledTimes(3);
  expect(vi.mocked(setTimeout).mock.calls).toEqual([
    [1000, undefined, { signal }],
    [2000, undefined, { signal }],
  ]);
});
it("does not retry authentication or ambiguous server failures", async () => {
  for (const statusCode of [401, 403, 500]) {
    const error = { statusCode };
    const work = vi.fn().mockRejectedValue(error);
    await expect(retryImageRequest(work, new AbortController().signal)).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
  }
  expect(generationError({ statusCode: 403 })).toContain("organization verification");
});
