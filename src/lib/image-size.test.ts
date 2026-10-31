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
it("preserves photo framing within the image API pixel and edge limits", () => {
  expect(jpegDimensions(jpeg(800, 1200))).toEqual({ width: 800, height: 1200 });
  expect(outputSize(jpeg(1920, 1080))).toBe("3840x2160");
  expect(outputSize(jpeg(1080, 1920))).toBe("2160x3840");
  for (const [width, height] of [
    [800, 1200],
    [1050, 1000],
    [1200, 800],
    [10000, 100],
    [100, 10000],
    [1600, 1200],
  ]) {
    const [w, h] = outputSize(jpeg(width, height, 0xc2))
      .split("x")
      .map(Number);
    expect(w % 16).toBe(0);
    expect(h % 16).toBe(0);
    expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
    expect(w * h).toBeLessThanOrEqual(8_294_400);
    expect(w * h).toBeGreaterThanOrEqual(655_360);
    expect(Math.max(w / h, h / w)).toBeLessThanOrEqual(3);
    expect(w / h).toBeCloseTo(Math.min(3, Math.max(1 / 3, width / height)), 1);
  }
});
it("falls back safely for unsupported, truncated, and malformed headers", () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([255, 216, 255, 224, 0, 0]),
    jpeg(0, 100),
    jpeg(100, 100).slice(0, 14),
  ]) {
    expect(jpegDimensions(bytes)).toBeUndefined();
    expect(outputSize(bytes)).toBe("3840x2160");
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
  expect(outputSize(png(800, 1200))).toBe("2336x3520");
  expect(outputSize(png(1200, 800))).toBe("3520x2336");
  expect(pngDimensions(png(100, 100).slice(0, 12))).toBeUndefined();
  expect(pngDimensions(new Uint8Array([1, 2, 3]))).toBeUndefined();
});
