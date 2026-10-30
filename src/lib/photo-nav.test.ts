import { describe, expect, it } from "vitest";
import { stepPhoto } from "./photo-nav";
import type { Asset } from "./types";
const photo = (id: string): Asset => ({ id, name: id, key: id, kind: "room" });
const photos = [photo("a"), photo("b"), photo("c")];

describe("stepping through photos", () => {
  it("does nothing with fewer than two photos", () => {
    expect(stepPhoto([], "a", 1)).toBeUndefined();
    expect(stepPhoto([photo("a")], "a", 1)).toBeUndefined();
    expect(stepPhoto([photo("a")], "a", -1)).toBeUndefined();
  });
  it("moves to the neighboring photo", () => {
    expect(stepPhoto(photos, "a", 1)).toBe(photos[1]);
    expect(stepPhoto(photos, "b", 1)).toBe(photos[2]);
    expect(stepPhoto(photos, "b", -1)).toBe(photos[0]);
    expect(stepPhoto(photos, "c", -1)).toBe(photos[1]);
  });
  it("stops at the ends instead of wrapping", () => {
    expect(stepPhoto(photos, "c", 1)).toBeUndefined();
    expect(stepPhoto(photos, "a", -1)).toBeUndefined();
  });
  it("starts from an edge when the current photo is not in the room", () => {
    expect(stepPhoto(photos, "", 1)).toBe(photos[0]);
    expect(stepPhoto(photos, "gone", 1)).toBe(photos[0]);
    expect(stepPhoto(photos, "gone", -1)).toBe(photos[2]);
  });
});
