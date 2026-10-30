import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPrompt, designInput, roomName } from "./validation";
import { seal, unseal, user, authorizationRedirect } from "./auth.server";
const dir = mkdtempSync(join(tmpdir(), "roomform-"));
beforeAll(() => {
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
  process.env.DEV_AUTH_BYPASS = "false";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
describe("private studio", () => {
  it("isolates media and room records by identity and commits room updates atomically", async () => {
    const s = await import("./storage.server");
    const a = s.ownerPrefix("a");
    const b = s.ownerPrefix("b");
    await s.save(a + "photo.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(await s.load(b + "photo.png")).toBeNull();
    expect(Array.from((await s.load(a + "photo.png"))!)).toEqual([1, 2, 3]);
    await s.mutateRooms("a", (all) => {
      all.push({
        id: crypto.randomUUID(),
        name: "Room",
        type: "Living",
        notes: "",
        style: "Japandi",
        assets: [],
        designs: [],
        createdAt: new Date().toISOString(),
      });
    });
    expect(await s.rooms("b")).toEqual([]);
    await expect(
      s.mutateRooms("a", (all) => {
        all[0].name = "Wrong";
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect((await s.rooms("a"))[0].name).toBe("Room");
  });
  it("prevents simultaneous generations for the same user", async () => {
    const s = await import("./storage.server");
    expect(s.claimGeneration("a")).toBe(true);
    expect(s.claimGeneration("a")).toBe(false);
    expect(s.claimGeneration("b")).toBe(true);
    s.releaseGeneration("a");
    expect(s.claimGeneration("a")).toBe(true);
  });
  it("rejects tampered or expired sessions and authenticates a valid identity", async () => {
    const token = await seal({ sub: "a", name: "Alex" });
    expect((await unseal(token))?.sub).toBe("a");
    expect(await unseal(token.slice(0, -8) + "tampered")).toBeNull();
    expect(await unseal(await seal({ sub: "a" }, "-1s"))).toBeNull();
    expect(
      await user(
        new Request("http://localhost", { headers: { cookie: `roomform_session=${token}` } }),
      ),
    ).toEqual({ sub: "a", name: "Alex", email: undefined });
    expect(await user(new Request("http://localhost"))).toBeNull();
  });
  it("keeps image reference numbers aligned with architectural context", () => {
    const input = designInput.parse({
      roomId: crypto.randomUUID(),
      baseId: crypto.randomUUID(),
      notes: "Add the sofa",
      style: "Japandi",
      assetIds: [],
    });
    const p = buildPrompt("Living room", input, [{ name: "Sofa", kind: "product" }], 3);
    expect(p).toContain("Image 4: product, Sofa");
    expect(p).toContain("Preserve its architecture");
    expect(p).toContain("Add the sofa");
  });
});

describe("Better Auth browser handoff", () => {
  it("opens the signed sign-in page supplied by the provider JSON response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ redirect: true, url: "/auth/sign-in?sig=provider-signed" }),
      );
    try {
      expect(
        await authorizationRedirect(new URL("https://auth.example/api/auth/oauth2/authorize")),
      ).toBe("https://auth.example/auth/sign-in?sig=provider-signed");
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("rejects external destinations from the authorization response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ redirect: true, url: "https://untrusted.example/auth/sign-in" }),
      );
    try {
      await expect(
        authorizationRedirect(new URL("https://auth.example/api/auth/oauth2/authorize")),
      ).rejects.toThrow("unexpected login destination");
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe("room deletion", () => {
  it("deletes the room and all its media while preserving other rooms and users", async () => {
    const s = await import("./storage.server");
    const owner = "room-deletion-owner";
    const other = "room-deletion-other";
    const id = crypto.randomUUID();
    const keepId = crypto.randomUUID();
    const prefix = `${s.ownerPrefix(owner)}${id}/`;
    const keepKey = `${s.ownerPrefix(owner)}${keepId}/keep.png`;
    const otherKey = `${s.ownerPrefix(other)}${id}/photo.png`;
    const room = {
      id,
      name: "Delete this room",
      type: "Living room",
      notes: "",
      style: "Japandi",
      assets: [],
      designs: [],
      createdAt: new Date().toISOString(),
    };
    await s.saveRooms(owner, [room, { ...room, id: keepId, name: "Keep this room" }]);
    await s.saveRooms(other, [room]);
    for (const key of [
      prefix + "photo.png",
      prefix + "design.png",
      prefix + "unlisted-reference.png",
      keepKey,
      otherKey,
    ])
      await s.save(key, new Uint8Array([1]), "image/png");
    expect(await s.deleteRoom("unrelated-owner", id)).toBe(false);
    expect(await s.load(prefix + "photo.png")).not.toBeNull();
    expect(s.claimGeneration(owner)).toBe(true);
    await expect(s.deleteRoom(owner, id)).rejects.toMatchObject({ status: 409 });
    expect((await s.rooms(owner)).length).toBe(2);
    s.releaseGeneration(owner);
    expect(await s.deleteRoom(owner, id)).toBe(true);
    expect((await s.rooms(owner)).map((r) => r.id)).toEqual([keepId]);
    for (const key of [
      prefix + "photo.png",
      prefix + "design.png",
      prefix + "unlisted-reference.png",
    ])
      expect(await s.load(key)).toBeNull();
    expect(await s.load(keepKey)).not.toBeNull();
    expect(await s.load(otherKey)).not.toBeNull();
    expect((await s.rooms(other)).map((r) => r.id)).toEqual([id]);
  });
});

describe("room names", () => {
  it("names rooms after their type and numbers repeats", () => {
    expect(roomName("Bedroom", ["Living room"])).toBe("Bedroom");
    expect(roomName("Living room", ["Living room", "Living room 2"])).toBe("Living room 3");
  });
});

describe("room updates and design deletion", () => {
  it("validates names and draft fields, preserves other fields, and checks ownership", async () => {
    const s = await import("./storage.server");
    const { updateRoom } = await import("./room-actions.server");
    const owner = "room-editor";
    const id = crypto.randomUUID();
    const assetId = crypto.randomUUID();
    await s.saveRooms(owner, [
      {
        id,
        name: "Living room",
        type: "Living room",
        notes: "",
        style: "Japandi",
        assets: [
          { id: assetId, key: s.ownerPrefix(owner) + "ref.jpeg", name: "Chair", kind: "product" },
        ],
        designs: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    await expect(updateRoom("someone-else", { roomId: id, name: "Wrong" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(updateRoom(owner, { roomId: id, name: "   " })).rejects.toThrow();
    await expect(updateRoom(owner, { roomId: id, name: "x".repeat(101) })).rejects.toThrow();
    await expect(
      updateRoom(owner, { roomId: id, notes: "x".repeat(4001), style: "" }),
    ).rejects.toThrow();
    await updateRoom(owner, { roomId: id, name: "  Den  " });
    await updateRoom(owner, { roomId: id, notes: "Keep the floor", style: "Scandinavian" });
    const result = await updateRoom(owner, { roomId: id, assetId, dimensions: " 80 cm " });
    expect(result).toMatchObject({ name: "Den", notes: "Keep the floor", style: "Scandinavian" });
    expect(result.assets[0].dimensions).toBe("80 cm");
  });
  it("removes only the owner's selected design and blob", async () => {
    const s = await import("./storage.server");
    const { deleteDesign } = await import("./room-actions.server");
    const owner = "design-deleter";
    const id = crypto.randomUUID();
    const designId = crypto.randomUUID();
    const keepId = crypto.randomUUID();
    const key = s.ownerPrefix(owner) + id + "/" + designId + ".png";
    const keepKey = s.ownerPrefix(owner) + id + "/" + keepId + ".png";
    const otherKey = s.ownerPrefix("other") + id + "/" + designId + ".png";
    const design = {
      id: designId,
      key,
      prompt: "",
      baseId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await s.saveRooms(owner, [
      {
        id,
        name: "Room",
        type: "Living",
        notes: "",
        style: "",
        assets: [],
        designs: [design, { ...design, id: keepId, key: keepKey }],
        createdAt: new Date().toISOString(),
      },
    ]);
    for (const item of [key, keepKey, otherKey])
      await s.save(item, new Uint8Array([1]), "image/png");
    await expect(deleteDesign("other", id, designId)).rejects.toMatchObject({ status: 404 });
    await expect(deleteDesign(owner, crypto.randomUUID(), designId)).rejects.toMatchObject({
      status: 404,
    });
    expect(await s.load(key)).not.toBeNull();
    const result = await deleteDesign(owner, id, designId);
    expect(result.designs.map((d) => d.id)).toEqual([keepId]);
    expect(await s.load(key)).toBeNull();
    expect(await s.load(keepKey)).not.toBeNull();
    expect(await s.load(otherKey)).not.toBeNull();
    await expect(deleteDesign(owner, id, designId)).rejects.toMatchObject({ status: 404 });
  });
});
