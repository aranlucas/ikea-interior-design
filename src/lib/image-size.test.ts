import { expect, it } from "vitest";
import { jpegDimensions, outputSize, orientationSize, pngDimensions } from "./image-size";
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
it("maps freestyle orientations to render sizes", () => {
  expect(orientationSize("landscape")).toBe("1536x1024");
  expect(orientationSize("portrait")).toBe("1024x1536");
  expect(orientationSize("square")).toBe("1024x1024");
});
function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
it("reads PNG dimensions for designs and masks", () => {
  expect(pngDimensions(png(1024, 1536))).toEqual({ width: 1024, height: 1536 });
  expect(outputSize(png(800, 1200))).toBe("1024x1536");
  expect(outputSize(png(1200, 800))).toBe("1536x1024");
  expect(pngDimensions(png(100, 100).slice(0, 12))).toBeUndefined();
  expect(pngDimensions(new Uint8Array([1, 2, 3]))).toBeUndefined();
});
