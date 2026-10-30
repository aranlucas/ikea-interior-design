import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { getRouter } from "../router";
import { getStudioBootstrap } from "./studio-bootstrap";
import { QueryClient } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { DbProvider, HydrationBoundary, useLiveQuery } from "@tanstack/react-db";
import { createStudioData, preloadStudio, studioRoomsQuery } from "./studio-data";
import { readStudio } from "./studio-bootstrap.server";
import { seal } from "./auth.server";
import * as storage from "./storage.server";
import { saveRooms } from "./storage.server";
import { studioKeys } from "./studio-queries";
import type { Room } from "./types";
vi.mock("./studio-bootstrap", () => ({
  getStudioBootstrap: vi.fn(),
  getStudioRooms: vi.fn(() => {
    throw new Error("Unexpected rooms read");
  }),
}));
const directory = mkdtempSync(join(tmpdir(), "roomform-ssr-"));
beforeAll(() => {
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("DEV_AUTH_BYPASS", "false");
  vi.stubEnv("SESSION_SECRET", "request-isolation-secret-at-least-32-characters");
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
const room = (id: string): Room => ({
  id,
  name: `Private ${id}`,
  type: "Bedroom",
  notes: "",
  style: "Japandi",
  assets: [],
  designs: [],
  createdAt: "",
});
function RoomNames() {
  const { data = [] } = useLiveQuery(studioRoomsQuery);
  return createElement("div", null, data.map((r) => r.name).join(","));
}
it("isolates concurrent authenticated requests and hydrates each user's first render without network calls", async () => {
  await saveRooms("alice", [room("alice-room")]);
  await saveRooms("bob", [room("bob-room")]);
  const requests = await Promise.all(
    ["alice", "bob"].map(async (sub) => {
      const token = await seal({ sub, name: sub });
      const request = new Request("https://roomform.test/", {
        headers: { cookie: `roomform_session=${token}` },
      });
      const client = new QueryClient();
      const data = createStudioData(client);
      const initial = await readStudio(request);
      const state = await preloadStudio(client, data, initial);
      return { sub, client, data, state };
    }),
  );
  expect(requests[0].client).not.toBe(requests[1].client);
  expect(requests[0].data.db).not.toBe(requests[1].data.db);
  for (const { sub, client, data, state } of requests) {
    expect(client.getQueryData(studioKeys.session())).toMatchObject({ user: { sub } });
    expect(Array.from(data.rooms.values()).map((r) => r.id)).toEqual([`${sub}-room`]);
    const browser = createStudioData(new QueryClient());
    const html = renderToString(
      createElement(
        DbProvider,
        { client: browser.db },
        createElement(HydrationBoundary, { state }, createElement(RoomNames)),
      ),
    );
    expect(html).toContain(`Private ${sub}-room`);
    expect(html).not.toContain(sub === "alice" ? "bob-room" : "alice-room");
    await browser.db.cleanup();
    await data.db.cleanup();
    client.clear();
  }
});
it("never reads rooms for a signed-out page", async () => {
  const readRooms = vi.spyOn(storage, "rooms");
  const initial = await readStudio(new Request("https://roomform.test/"));
  expect(readRooms).not.toHaveBeenCalled();
  readRooms.mockRestore();
  expect(initial.session.user).toBeNull();
  expect(initial.rooms).toEqual([]);
  const client = new QueryClient();
  const data = createStudioData(client);
  const state = await preloadStudio(client, data, initial);
  expect(client.getQueryData(studioKeys.rooms())).toBeUndefined();
  expect(state.liveQueries).toBeUndefined();
  await data.db.cleanup();
  client.clear();
});
it("keeps the local dev auth bypass working", async () => {
  vi.stubEnv("DEV_AUTH_BYPASS", "true");
  try {
    expect((await readStudio(new Request("http://localhost/"))).session).toMatchObject({
      local: true,
      user: { sub: "local-studio" },
    });
  } finally {
    vi.stubEnv("DEV_AUTH_BYPASS", "false");
  }
});

it("renders the actual signed-out route as a sign-in card without rooms", async () => {
  const initial = await readStudio(new Request("https://roomform.test/"));
  vi.mocked(getStudioBootstrap).mockResolvedValue(initial);
  const readRooms = vi.spyOn(storage, "rooms");
  const router = getRouter();
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const html = renderToString(createElement(RouterProvider, { router }));
  expect(html).toContain("Sign in");
  expect(html).not.toContain('aria-label="Loading"');
  expect(html).not.toContain("New room");
  expect(readRooms).not.toHaveBeenCalled();
  readRooms.mockRestore();
  await router.options.context.studioData.db.cleanup();
  router.options.context.queryClient.clear();
});
