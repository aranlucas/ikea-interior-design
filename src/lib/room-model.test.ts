import { describe, expect, it } from "vitest";
import { roomModel, roomModelInput } from "./room-model";
import type { Asset } from "./types";

const photos: Asset[] = Array.from({ length: 5 }, (_, i) => ({
  id: crypto.randomUUID(),
  key: `room/${i}.jpg`,
  name: `Wall ${i}`,
  kind: "room",
}));
const product: Asset = { ...photos[0], id: crypto.randomUUID(), kind: "product" };

describe("non-AI room model", () => {
  it("starts with example dimensions and assigns only room photos in upload order", () => {
    expect(roomModel(undefined, [product, ...photos])).toEqual({
      width: 4,
      depth: 5,
      height: 2.7,
      walls: { back: photos[0].id, right: photos[1].id, front: photos[2].id, left: photos[3].id },
    });
    expect(roomModel(undefined, []).walls).toEqual({});
  });

  it("preserves blank walls and clears removed photos without reassigning other walls", () => {
    const model = {
      width: 6,
      depth: 3.5,
      height: 2.4,
      walls: { back: photos[0].id, right: photos[1].id, left: product.id },
    };
    expect(roomModel(model, [product, photos[1], photos[2]])).toEqual({
      width: 6,
      depth: 3.5,
      height: 2.4,
      walls: { right: photos[1].id },
    });
  });

  it.each([
    { width: 0 },
    { width: 31 },
    { depth: -1 },
    { depth: Infinity },
    { height: 1.7 },
    { height: 8.1 },
    { width: NaN },
    { walls: { back: "invalid" } },
  ])("rejects invalid geometry or photo IDs: %o", (invalid) => {
    expect(
      roomModelInput.safeParse({ width: 4, depth: 5, height: 2.7, walls: {}, ...invalid }).success,
    ).toBe(false);
  });
});
