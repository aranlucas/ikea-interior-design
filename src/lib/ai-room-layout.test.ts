import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { exampleAiRoomLayout, exampleListingRoomLayout } from "./ai-room-layout.fixture";
import { validateAiRoomLayout, footprintArea } from "./ai-room-layout";
import { createAiRoomGroup, toSceneLayout } from "./ai-room-layout-geometry";

describe("AI architectural layout validation", () => {
  it("accepts a coherent polygon with bounded openings and valid photo evidence", () => {
    const layout = exampleAiRoomLayout();
    expect(validateAiRoomLayout(layout, 1)).toEqual(layout);
    expect(footprintArea(layout.footprint)).toBe(24);
  });
  it("rejects intersecting or collapsed floor outlines", () => {
    const layout = exampleAiRoomLayout();
    layout.footprint = [
      { x: 0, z: 0 },
      { x: 4, z: 5 },
      { x: 0, z: 6 },
      { x: 4, z: 0 },
    ];
    expect(() => validateAiRoomLayout(layout, 1)).toThrow();
    layout.footprint = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 6 },
      { x: 4, z: 6 },
    ];
    expect(() => validateAiRoomLayout(layout, 1)).toThrow();
  });
  it("rejects missing walls, false evidence references, and openings outside their wall", () => {
    const layout = exampleAiRoomLayout();
    layout.walls[1].edgeIndex = 0;
    expect(() => validateAiRoomLayout(layout, 1)).toThrow("exactly once");
    layout.walls[1].edgeIndex = 1;
    layout.fixtures[0].photoNumbers = [2];
    expect(() => validateAiRoomLayout(layout, 1)).toThrow("not provided");
    layout.fixtures[0].photoNumbers = [1];
    layout.walls[0].openings[0].center = 0;
    expect(() => validateAiRoomLayout(layout, 1)).toThrow("does not fit");
  });
});
function area(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position"),
    index = geometry.index;
  let result = 0;
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const points = [0, 1, 2].map((n) =>
      new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i + n) : i + n),
    );
    result += new THREE.Triangle(points[0], points[1], points[2]).getArea();
  }
  return result;
}
describe("AI layout geometry", () => {
  it("converts plan handedness without mutating evidence, including rotated fixtures and offset outlines", () => {
    const layout = exampleAiRoomLayout();
    layout.footprint.forEach((point) => {
      point.x += 7;
    });
    layout.fixtures[0].x = 7.75;
    layout.fixtures[0].yawDegrees = 35;
    const original = structuredClone(layout);
    const scene = toSceneLayout(layout);
    expect(scene.fixtures[0]).toMatchObject({ x: 10.25, yawDegrees: -35 });
    expect(footprintArea(scene.footprint)).toBe(-footprintArea(layout.footprint));
    expect(scene.walls).toEqual(layout.walls);
    expect(toSceneLayout(scene)).toEqual(layout);
    expect(layout).toEqual(original);
  });
  it("keeps stairs and doors on the photographed sides when viewed from either end", () => {
    const model = createAiRoomGroup(exampleListingRoomLayout(), true, true);
    try {
      model.group.updateMatrixWorld(true);
      const stairs = model.group.children.find((object) => object.userData.kind === "stairs")!;
      const door = (edgeIndex: number) =>
        model.group.children.find(
          (object) => object.userData.kind === "opening" && object.userData.edgeIndex === edgeIndex,
        )!;
      function screenX(object: THREE.Object3D, fromKitchen: boolean) {
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        camera.position.set(2.6, 1.5, fromKitchen ? 9.8 : 0.3);
        camera.lookAt(2.6, 1.5, fromKitchen ? 0 : 10);
        camera.updateMatrixWorld();
        return new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera)
          .x;
      }
      // Kitchen looking toward living: stairs right, living sliding door left.
      expect(screenX(stairs, true)).toBeGreaterThan(0);
      expect(screenX(door(0), true)).toBeLessThan(0);
      // Living looking toward kitchen: stairs left, kitchen balcony door right.
      expect(screenX(stairs, false)).toBeLessThan(0);
      expect(screenX(door(2), false)).toBeGreaterThan(0);
    } finally {
      model.dispose();
    }
  });
  it("cuts a real window hole in a wall instead of drawing a window over a solid plane", () => {
    const model = createAiRoomGroup(exampleAiRoomLayout(), true, true);
    const walls = model.group.children.filter((object) => object.userData.kind === "wall");
    expect(walls).toHaveLength(4);
    const first = walls[0];
    if (!(first instanceof THREE.Mesh)) throw new Error("Wall mesh missing");
    expect(area(first.geometry)).toBeCloseTo(4 * 2.6 - 1.2 * 1.1);
    const floor = model.group.children.find((object) => object.userData.kind === "floor");
    if (!(floor instanceof THREE.Mesh)) throw new Error("Floor mesh missing");
    expect(area(floor.geometry)).toBeCloseTo(24);
    model.dispose();
  });
  it("can hide inferred structure and fixtures independently", () => {
    const model = createAiRoomGroup(exampleAiRoomLayout(), false, false);
    expect(model.group.children.filter((object) => object.userData.kind === "wall")).toHaveLength(
      2,
    );
    expect(model.group.children.some((object) => object.userData.kind === "island")).toBe(false);
    model.dispose();
  });
});
