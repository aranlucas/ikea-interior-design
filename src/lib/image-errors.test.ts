import { afterEach, expect, it, vi } from "vitest";
import { generationError, retryImageRequest } from "./image-errors.server";

afterEach(() => vi.useRealTimers());
it("stops immediately on exhausted credits even though the API returns 429", async () => {
  const error = {
    statusCode: 429,
    responseBody: JSON.stringify({ error: { code: "credit_balance_exhausted" } }),
  };
  const work = vi.fn().mockRejectedValue(error);
  await expect(retryImageRequest(work, new AbortController().signal)).rejects.toBe(error);
  expect(work).toHaveBeenCalledTimes(1);
  expect(generationError(error)).toContain("organization has no API credits");
});
it("retries transient rate limits with backoff but caps attempts", async () => {
  vi.useFakeTimers();
  const error = { statusCode: 429, data: { error: { code: "rate_limit_exceeded" } } };
  const work = vi.fn().mockRejectedValue(error);
  const result = expect(retryImageRequest(work, new AbortController().signal)).rejects.toBe(error);
  await vi.runAllTimersAsync();
  await result;
  expect(work).toHaveBeenCalledTimes(3);
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
