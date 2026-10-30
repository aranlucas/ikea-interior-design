import { describe, expect, it } from "vitest";
import { parseColmapModel } from "./colmap-format";
import { photoMatchesInput, reconstructionIsCurrent } from "./reconstruction";

describe("recovered photo geometry", () => {
  it("converts camera extrinsics into camera positions and skips empty observation lines", () => {
    const scene = parseColmapModel(
      "# cameras\n1 SIMPLE_RADIAL 800 600 500 400 300 0\n2 PINHOLE 800 600 520 530 400 300\n",
      "# images\n1 1 0 0 0 1 2 3 1 first.jpeg\n\n2 0.7071067811865476 0 0.7071067811865476 0 1 0 0 2 second.jpeg\n0 0 -1\n",
      "# points\n1 1 2 3 128 200 255 0.5 1 0 2 0\n2 9 9 9 1 2 3 9 1 1 2 1\n3 NaN 2 3 1 2 3 0 1 2 2 2\n",
      new Map([
        ["first.jpeg", "a"],
        ["second.jpeg", "b"],
      ]),
    );
    expect(scene.positions).toEqual([1, 2, 3]);
    expect(scene.colors).toEqual([128, 200, 255]);
    expect(scene.cameras).toHaveLength(2);
    expect(scene.cameras[0]).toMatchObject({
      assetId: "a",
      position: [-1, -2, -3],
      fx: 500,
      fy: 500,
    });
    expect(scene.cameras[1].position[0]).toBeCloseTo(0);
    expect(scene.cameras[1].position[2]).toBeCloseTo(-1);
    expect(scene.cameras[1].fy).toBe(530);
  });
  it("rejects non-finite camera coordinates", () => {
    expect(() =>
      parseColmapModel(
        "1 SIMPLE_PINHOLE 800 600 500 400 300",
        "1 1 0 0 0 NaN 0 0 1 a.jpeg\n\n",
        "",
        new Map([["a.jpeg", "a"]]),
      ),
    ).toThrow("Invalid camera");
  });
});

describe("guided photo matches", () => {
  const matches = {
    aId: crypto.randomUUID(),
    bId: crypto.randomUUID(),
    points: Array.from({ length: 12 }, (_, i) => ({ a: [i / 20, 0.2], b: [i / 20, 0.3] })),
  };
  it("accepts twelve distinct matching points and rejects invalid guidance", () => {
    expect(photoMatchesInput.safeParse(matches).success).toBe(true);
    for (const input of [
      { ...matches, bId: matches.aId },
      { ...matches, points: matches.points.slice(0, 11) },
      { ...matches, points: Array(12).fill(matches.points[0]) },
      { ...matches, points: matches.points.map((p) => ({ ...p, a: [2, 0.1] })) },
    ])
      expect(photoMatchesInput.safeParse(input).success).toBe(false);
  });
  it("marks a saved preview stale when photos are added or removed", () => {
    const result = {
      id: "build",
      key: "result.json",
      photoIds: ["a", "b"],
      registeredIds: ["a", "b"],
      pointCount: 100,
      components: 1,
    };
    const photos = ["a", "b"].map((id) => ({
      id,
      name: id,
      key: `${id}.jpeg`,
      kind: "room" as const,
    }));
    expect(reconstructionIsCurrent(result, photos)).toBe(true);
    expect(reconstructionIsCurrent(result, [photos[1], photos[0]])).toBe(true);
    expect(reconstructionIsCurrent(result, photos.slice(0, 1))).toBe(false);
    expect(reconstructionIsCurrent(result, [...photos, { ...photos[0], id: "c" }])).toBe(false);
  });
});
