import * as THREE from "three";
import { footprintArea, type AiRoomLayout } from "./ai-room-layout";

/**
 * AI layouts use plan coordinates: facing +z, +x is on the right.
 * In the y-up Three.js scene, facing +z puts +x on the left.
 * Reflect the plan once at this boundary, keeping the stored evidence unchanged.
 * Edge order is preserved, so opening fractions still refer to the same endpoints.
 */
export function toSceneLayout(layout: AiRoomLayout): AiRoomLayout {
  const xs = layout.footprint.map((point) => point.x);
  const across = Math.min(...xs) + Math.max(...xs);
  return {
    ...layout,
    footprint: layout.footprint.map((point) => ({ ...point, x: across - point.x })),
    fixtures: layout.fixtures.map((fixture) => ({
      ...fixture,
      x: across - fixture.x,
      yawDegrees: -fixture.yawDegrees,
    })),
  };
}

export function createAiRoomGroup(
  layout: AiRoomLayout,
  showInferred: boolean,
  showFixtures: boolean,
) {
  layout = toSceneLayout(layout);
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = group,
  ) {
    geometries.push(geometry);
    materials.push(material);
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    width: number,
    height: number,
    depth: number,
    color: string,
    parent: THREE.Object3D = group,
  ) {
    return mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
      parent,
    );
  }
  const outline = new THREE.Shape(
    layout.footprint.map((point) => new THREE.Vector2(point.x, -point.z)),
  );
  const floor = mesh(
    new THREE.ShapeGeometry(outline),
    new THREE.MeshStandardMaterial({
      color: layout.floorColor,
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  floor.userData = { kind: "floor" };
  const wallSide = footprintArea(layout.footprint) > 0 ? THREE.FrontSide : THREE.BackSide;
  for (const wall of layout.walls) {
    if (wall.support === "inferred" && !showInferred) continue;
    const a = layout.footprint[wall.edgeIndex],
      b = layout.footprint[(wall.edgeIndex + 1) % layout.footprint.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, layout.ceilingHeight);
    shape.lineTo(0, layout.ceilingHeight);
    shape.closePath();
    const openings = wall.openings.filter(
      (opening) => showInferred || opening.support === "visible",
    );
    for (const opening of openings) {
      const x = opening.center * length - opening.width / 2,
        y = opening.bottom;
      const hole = new THREE.Path();
      hole.moveTo(x, y);
      hole.lineTo(x, y + opening.height);
      hole.lineTo(x + opening.width, y + opening.height);
      hole.lineTo(x + opening.width, y);
      hole.closePath();
      shape.holes.push(hole);
    }
    const inferred = wall.support === "inferred";
    const surface = mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: inferred ? "#d8c29b" : wall.color,
        roughness: 1,
        side: wallSide,
        transparent: inferred,
        opacity: inferred ? 0.45 : 1,
        depthWrite: !inferred,
      }),
    );
    surface.position.set(a.x, 0, a.z);
    surface.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    surface.userData = { kind: "wall", label: wall.label, support: wall.support };
    for (const opening of openings) {
      const local = new THREE.Group();
      local.position.copy(surface.position);
      local.rotation.copy(surface.rotation);
      local.userData = { kind: "opening", openingKind: opening.kind, edgeIndex: wall.edgeIndex };
      group.add(local);
      const x = opening.center * length,
        y = opening.bottom,
        w = opening.width,
        h = opening.height;
      if (opening.kind === "window") {
        const glass = mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshStandardMaterial({
            color: "#b9d9df",
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            roughness: 0.2,
          }),
          local,
        );
        glass.position.set(x, y + h / 2, 0.012);
      }
      const frameColor = opening.support === "inferred" ? "#b39460" : "#d0cdc5";
      for (const direction of [-1, 1]) {
        const jamb = box(0.045, h, 0.065, frameColor, local);
        jamb.position.set(x + (direction * w) / 2, y + h / 2, 0);
      }
      const lintel = box(w, 0.045, 0.065, frameColor, local);
      lintel.position.set(x, y + h, 0);
      if (opening.kind === "window") {
        const sill = box(w, 0.045, 0.09, frameColor, local);
        sill.position.set(x, y, 0);
      }
    }
  }
  if (showFixtures)
    for (const fixture of layout.fixtures) {
      if (fixture.support === "inferred" && !showInferred) continue;
      const object = new THREE.Group();
      object.position.set(fixture.x, fixture.bottom, fixture.z);
      object.rotation.y = THREE.MathUtils.degToRad(fixture.yawDegrees);
      object.userData = { kind: fixture.kind, label: fixture.label, support: fixture.support };
      group.add(object);
      const color = fixture.support === "inferred" ? "#c9af87" : fixture.color;
      if (fixture.kind === "stairs") {
        for (let i = 0; i < 8; i++) {
          const step = box(
            fixture.width,
            (fixture.height * (i + 1)) / 8,
            fixture.depth / 8,
            color,
            object,
          );
          step.position.set(
            0,
            (fixture.height * (i + 1)) / 16,
            -fixture.depth / 2 + (fixture.depth * (i + 0.5)) / 8,
          );
        }
        continue;
      }
      const body = box(fixture.width, fixture.height, fixture.depth, color, object);
      body.position.y = fixture.height / 2;
      const edges = new THREE.EdgesGeometry(body.geometry);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: "#8b867b",
        transparent: true,
        opacity: 0.3,
      });
      geometries.push(edges);
      materials.push(lineMaterial);
      const lines = new THREE.LineSegments(edges, lineMaterial);
      lines.position.copy(body.position);
      object.add(lines);
      if (
        fixture.kind === "island" ||
        (fixture.kind === "cabinet" && fixture.bottom < 0.1 && fixture.height < 1.4)
      ) {
        const counter = box(fixture.width + 0.04, 0.035, fixture.depth + 0.04, "#c9c6bd", object);
        counter.position.y = fixture.height + 0.0175;
      }
      if (fixture.kind === "range") {
        const top = box(fixture.width, 0.025, fixture.depth, "#30312f", object);
        top.position.y = fixture.height + 0.012;
      }
    }
  return {
    group,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
