import { expect, it } from "vitest";
import { convertRoomSize, readRoomSize, writeRoomSize } from "./room-measurements";
import { parseRoomMeasurements } from "./scale";

it("loads existing metric and imperial measurements into separate fields", () => {
  expect(readRoomSize("4.2 × 3.6 m, ceiling 2.6 m", "m")).toEqual({
    width: "4.2",
    depth: "3.6",
    height: "2.6",
  });
  const imperial = readRoomSize('W: 120" D: 144" H: 96"', "in");
  // The existing parser rounds to the nearest millimeter.
  expect(Number(imperial.width)).toBeCloseTo(120, 1);
  expect(Number(imperial.depth)).toBeCloseTo(144, 1);
  expect(Number(imperial.height)).toBeCloseTo(96, 1);
});

it("keeps partial dimensions on their own axes through the generation parser", () => {
  const value = writeRoomSize({ width: "", depth: "12", height: "8" }, "ft");
  expect(parseRoomMeasurements(value)).toEqual({ depthCm: 365.8, heightCm: 243.8 });
  expect(readRoomSize(value, "m").width).toBe("");
  expect(writeRoomSize({ width: "", depth: "", height: "" }, "m")).toBe("");
});

it("converts units without losing unknown dimensions or changing physical size", () => {
  const fields = { width: "10", depth: "", height: "8" };
  const converted = convertRoomSize(fields, "ft", "m");
  expect(converted).toEqual({ width: "3.048", depth: "", height: "2.4384" });
  expect(convertRoomSize(converted, "m", "ft")).toEqual(fields);
  expect(parseRoomMeasurements(writeRoomSize(converted, "m"))).toEqual(
    parseRoomMeasurements(writeRoomSize(fields, "ft")),
  );
});
