import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { generationOptions, roomsOptions, sessionOptions } from "./studio-queries";

afterEach(() => vi.unstubAllGlobals());
it("disables all studio reads on the server without changing defaults for unrelated queries", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  const observers = [
    new QueryObserver(client, sessionOptions()),
    new QueryObserver(client, roomsOptions()),
    new QueryObserver(client, generationOptions()),
  ];
  const unsubscribes = observers.map((observer) => {
    expect(observer.options.enabled).toBe(false);
    return observer.subscribe(() => {});
  });
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
  expect(client.getDefaultOptions()).toEqual({});
  unsubscribes.forEach((unsubscribe) => unsubscribe());
  client.clear();
});
