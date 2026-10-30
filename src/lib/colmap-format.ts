import type { ReconstructedScene, RecoveredCamera } from "./reconstruction";

export function parseColmapModel(
  camerasText: string,
  imagesText: string,
  pointsText: string,
  names: Map<string, string>,
): ReconstructedScene {
  const intrinsics = new Map<number, Omit<RecoveredCamera, "assetId" | "position" | "rotation">>();
  for (const line of camerasText.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [id, model, w, h, ...params] = line.trim().split(/\s+/);
    const p = params.map(Number);
    if (!["SIMPLE_RADIAL", "SIMPLE_PINHOLE", "PINHOLE", "OPENCV"].includes(model))
      throw new Error("Unsupported reconstruction camera model.");
    const simple = model.startsWith("SIMPLE_");
    intrinsics.set(Number(id), {
      width: Number(w),
      height: Number(h),
      fx: p[0],
      fy: simple ? p[0] : p[1],
      cx: p[simple ? 1 : 2],
      cy: p[simple ? 2 : 3],
    });
  }
  const cameras: RecoveredCamera[] = [];
  const imageLines = imagesText.split(/\r?\n/);
  for (let i = 0; i < imageLines.length; i++) {
    const line = imageLines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split(/\s+/);
    i++; // Each pose is followed by a POINTS2D line, which may be empty.
    const assetId = names.get(fields.slice(9).join(" "));
    const calibration = intrinsics.get(Number(fields[8]));
    if (!assetId || !calibration) continue;
    const [w, x, y, z, tx, ty, tz] = fields.slice(1, 8).map(Number);
    // COLMAP stores world-to-camera rotation and translation. Recover camera-to-world.
    const r = [
      1 - 2 * y * y - 2 * z * z,
      2 * x * y - 2 * z * w,
      2 * x * z + 2 * y * w,
      2 * x * y + 2 * z * w,
      1 - 2 * x * x - 2 * z * z,
      2 * y * z - 2 * x * w,
      2 * x * z - 2 * y * w,
      2 * y * z + 2 * x * w,
      1 - 2 * x * x - 2 * y * y,
    ];
    const position: [number, number, number] = [
      -(r[0] * tx + r[3] * ty + r[6] * tz),
      -(r[1] * tx + r[4] * ty + r[7] * tz),
      -(r[2] * tx + r[5] * ty + r[8] * tz),
    ];
    if (![...position, w, x, y, z, ...Object.values(calibration)].every(Number.isFinite))
      throw new Error("Invalid camera coordinates in reconstruction.");
    cameras.push({ assetId, ...calibration, position, rotation: [-x, -y, -z, w] });
  }
  const positions: number[] = [];
  const colors: number[] = [];
  for (const line of pointsText.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const f = line.trim().split(/\s+/).map(Number);
    if (f.length < 12 || f[7] > 4 || !f.slice(1, 8).every(Number.isFinite)) continue;
    positions.push(...f.slice(1, 4));
    colors.push(...f.slice(4, 7).map((v) => Math.max(0, Math.min(255, v))));
    if (positions.length >= 80_000 * 3) break;
  }
  return { version: 1, kind: "sparse", positions, colors, cameras };
}
