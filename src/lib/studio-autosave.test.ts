import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createStudioData } from "./studio-data";
import type { Room } from "./types";
vi.mock("./studio-bootstrap", async () => {
  const { api } = await import("./studio-client");
  return { getStudioRooms: () => api("/api/rooms") };
});
const room: Room = {
  id: "a",
  name: "Before",
  type: "Living room",
  notes: "",
  style: "Japandi",
  assets: [],
  designs: [],
  createdAt: "",
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup() {
  let server = [{ ...room }, { ...room, id: "b" }];
  const writes: unknown[] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method) return Response.json(server);
    const value = JSON.parse(init.body as string);
    writes.push(value);
    const row = server.find((r) => r.id === value.roomId)!;
    Object.assign(row, { notes: value.notes, style: value.style });
    return Response.json(row);
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  const data = createStudioData(client);
  await data.rooms.preload();
  vi.useFakeTimers();
  return {
    data,
    writes,
    fetch,
    server,
    close: async () => {
      await data.db.cleanup();
      client.clear();
    },
  };
}
it("merges typing into the newest text after a 500ms quiet period and saves the original room", async () => {
  const { data, writes, close } = await setup();
  const first = data.saveDraft("a", { notes: "old", style: "Japandi" });
  await vi.advanceTimersByTimeAsync(300);
  const latest = data.saveDraft("a", { notes: "newest", style: "Scandinavian" });
  const other = data.saveDraft("b", { notes: "other", style: "Japandi" });
  expect(first).toBe(latest);
  expect(data.rooms.get("a")?.notes).toBe("newest");
  await vi.advanceTimersByTimeAsync(499);
  expect(writes).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  await Promise.all([latest.when("settled"), other.when("settled")]);
  expect(writes).toEqual([
    { roomId: "a", notes: "newest", style: "Scandinavian" },
    { roomId: "b", notes: "other", style: "Japandi" },
  ]);
  await close();
});
it("drains autosave before rename and deletion, never resurrecting the deleted room", async () => {
  const { data, server, close } = await setup();
  const tx = data.saveDraft("a", { notes: "saved first", style: "Japandi" });
  const renamed = data.runRoom("a", async () => {
    expect(server[0].notes).toBe("saved first");
    server[0].name = "Renamed";
    await data.update({ ...server[0] });
  });
  await vi.advanceTimersByTimeAsync(500);
  await renamed;
  expect(data.rooms.get("a")?.name).toBe("Renamed");
  const next = data.saveDraft("a", { notes: "before delete", style: "Japandi" });
  const deleted = data.runRoom("a", async () => {
    await data.rooms.utils.writeDelete("a");
  });
  await vi.advanceTimersByTimeAsync(500);
  await Promise.all([tx.when("settled"), next.when("settled"), deleted]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(data.rooms.has("a")).toBe(false);
  // A stale editor submitting after deletion cannot upsert its former room.
  const stale = data.saveDraft("a", { notes: "late", style: "Japandi" });
  await vi.advanceTimersByTimeAsync(500);
  await stale.when("settled");
  expect(data.rooms.has("a")).toBe(false);
  await close();
});
it("rolls back failed paced writes and lets later saves and operations proceed", async () => {
  const { data, fetch, close } = await setup();
  fetch.mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 500 }));
  const failed = data.saveDraft("a", { notes: "optimistic", style: "Japandi" });
  const rejection = expect(failed.when("settled")).rejects.toThrow("Denied");
  await vi.advanceTimersByTimeAsync(500);
  await rejection;
  expect(data.rooms.get("a")?.notes).toBe("");
  const retry = data.saveDraft("a", { notes: "recovered", style: "Japandi" });
  await vi.advanceTimersByTimeAsync(500);
  await retry.when("settled");
  expect(data.rooms.get("a")?.notes).toBe("recovered");
  await close();
});

it("serializes a held save, rename, and newer pending save without overwriting the name", async () => {
  const { data, fetch, server, close } = await setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetch.mockImplementationOnce(async (_url, init) => {
    await gate;
    const value = JSON.parse(init!.body as string);
    Object.assign(server[0], { notes: value.notes, style: value.style });
    return Response.json(server[0]);
  });
  const old = data.saveDraft("a", { notes: "old", style: "Japandi" });
  await vi.advanceTimersByTimeAsync(500);
  const rename = data.runRoom("a", async () => {
    server[0].name = "Kept rename";
    await data.update({ ...server[0] });
  });
  const newest = data.saveDraft("a", { notes: "newest", style: "Scandinavian" });
  await vi.advanceTimersByTimeAsync(500);
  expect(data.rooms.get("a")?.notes).toBe("newest");
  release();
  await Promise.all([old.when("settled"), newest.when("settled"), rename]);
  expect(data.rooms.get("a")).toMatchObject({ notes: "newest", name: "Kept rename" });
  await close();
});
