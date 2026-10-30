import { expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runColmap } from "./colmap-runner.server";
import { photoMatchesInput } from "./reconstruction";
it.skipIf(!process.env.ROOMFORM_COLMAP_TEST_IMAGES).each([2, 6])(
  "reconstructs %i overlapping views using the installed CPU engine",
  async (count) => {
    const directory = process.env.ROOMFORM_COLMAP_TEST_IMAGES!;
    const files = (await readdir(directory))
      .filter((name) => /\.(jpeg|png|webp)$/.test(name))
      .sort()
      .slice(0, count);
    const photos = files.map((name) => ({
      id: crypto.randomUUID(),
      key: join(directory, name),
      name,
      kind: "room" as const,
    }));
    const stages: string[] = [];
    const matches = process.env.ROOMFORM_COLMAP_TEST_MATCHES
      ? photoMatchesInput.parse({
          aId: photos[0].id,
          bId: photos[1].id,
          points: JSON.parse(await readFile(process.env.ROOMFORM_COLMAP_TEST_MATCHES, "utf8")),
        })
      : undefined;
    const result = await runColmap({
      photos,
      matches,
      loadPhoto: async (path) => new Uint8Array(await readFile(path)),
      progress: async (stage) => {
        stages.push(stage);
      },
      signal: AbortSignal.timeout(150_000),
    });
    expect(result.scene.cameras.length).toBeGreaterThanOrEqual(2);
    expect(result.scene.positions.length / 3).toBeGreaterThan(100);
    expect(result.scene.colors.length).toBe(result.scene.positions.length);
    expect(stages).toContain("Matching photo angles");
    console.log(
      JSON.stringify({
        aligned: result.scene.cameras.length,
        total: photos.length,
        points: result.scene.positions.length / 3,
      }),
    );
  },
  160_000,
);
