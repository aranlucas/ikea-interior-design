import { expect, it } from "vitest";
import { jpegDimensions, outputSize } from "./image-size";
function jpeg(width: number, height: number, marker = 0xc0) {
  return new Uint8Array([
    255,
    216,
    255,
    224,
    0,
    4,
    0,
    0,
    255,
    marker,
    0,
    8,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0,
  ]);
}
it("chooses portrait, roughly square, and landscape for baseline and progressive JPEGs", () => {
  expect(jpegDimensions(jpeg(800, 1200))).toEqual({ width: 800, height: 1200 });
  expect(outputSize(jpeg(800, 1200))).toBe("1024x1536");
  expect(outputSize(jpeg(1050, 1000, 0xc2))).toBe("1024x1024");
  expect(outputSize(jpeg(1200, 800))).toBe("1536x1024");
});
it("falls back safely for unsupported, truncated, and malformed headers", () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([255, 216, 255, 224, 0, 0]),
    jpeg(0, 100),
    jpeg(100, 100).slice(0, 14),
  ]) {
    expect(jpegDimensions(bytes)).toBeUndefined();
    expect(outputSize(bytes)).toBe("1536x1024");
  }
});
