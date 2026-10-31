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
