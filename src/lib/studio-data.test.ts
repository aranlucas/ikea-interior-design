import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createStudioData } from "./studio-data";
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
afterEach(() => vi.unstubAllGlobals());
describe("rooms collection", () => {
  it("does not request rooms on the server", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient();
    const { rooms } = createStudioData(client);
    const unsubscribe = rooms.subscribeChanges(() => {});
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    unsubscribe.unsubscribe();
    await rooms.cleanup();
    client.clear();
  });
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
    expect(client.getQueryData<Room[]>(["rooms"])?.[0].name).toBe("Server");
    expect(fetch).toHaveBeenCalledTimes(1);
    await rooms.cleanup();
    client.clear();
  });
});
