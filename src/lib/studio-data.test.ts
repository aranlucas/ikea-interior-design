import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createStudioData } from "./studio-data";
import { studioKeys } from "./studio-queries";
import type { Room } from "./types";
const room: Room = {
  id: "room",
  name: "Before",
  type: "Living room",
  notes: "",
  style: "Japandi",
  assets: [],
  designs: [],
  createdAt: "",
};
vi.mock("./studio-bootstrap", async () => {
  const { api } = await import("./studio-client");
  return { getStudioRooms: () => api("/api/rooms") };
});
afterEach(() => vi.unstubAllGlobals());
describe("rooms collection", () => {
  it("rolls back failed optimistic edits and accepts server rooms without refetch", async () => {
    const fetch = vi.fn(async () => Response.json([room]));
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient();
    const { rooms, change, update } = createStudioData(client);
    await rooms.preload();
    let reject!: (error: Error) => void;
    const pending = change(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
      () =>
        rooms.update(room.id, (draft) => {
          draft.name = "Optimistic";
        }),
    );
    expect(rooms.get(room.id)?.name).toBe("Optimistic");
    reject(new Error("Denied"));
    await expect(pending).rejects.toThrow("Denied");
    expect(rooms.get(room.id)?.name).toBe("Before");
    await change(
      async () => {
        await update({ ...room, name: "Server" });
      },
      () =>
        rooms.update(room.id, (draft) => {
          draft.name = "Client";
        }),
    );
    expect(rooms.get(room.id)?.name).toBe("Server");
    expect(client.getQueryData<Room[]>(studioKeys.rooms())?.[0].name).toBe("Server");
    expect(fetch).toHaveBeenCalledTimes(1);
    await rooms.cleanup();
    client.clear();
  });
});

it("exposes initial and background fetch failures through collection health, keeping loaded rooms", async () => {
  vi.stubGlobal("window", {});
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: "Denied" }, { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  const { rooms } = createStudioData(client);
  await expect(rooms.preload()).rejects.toThrow("Denied");
  expect(rooms.health.error?.message).toBe("Denied");
  fetch.mockImplementation(async () => Response.json([room]));
  await rooms.reload();
  expect(rooms.health.hasErrors).toBe(false);
  fetch.mockImplementation(async () => Response.json({ error: "Offline" }, { status: 503 }));
  await expect(rooms.utils.refetch({ throwOnError: true })).rejects.toThrow("Offline");
  expect(rooms.get(room.id)?.name).toBe("Before");
  expect(rooms.health.failureReason?.message).toBe("Offline");
  await rooms.cleanup();
  client.clear();
});
