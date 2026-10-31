import { ENV } from "varlock/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseColmapModel } from "./colmap-format";
import { importPhotoMatches } from "./colmap-matches.server";
import type { Asset } from "./types";
import type { PhotoMatches, ReconstructedScene } from "./reconstruction";

const execute = promisify(execFile);
const binary = () => ENV.COLMAP_BIN || "colmap";
let engineProbe: { until: number; value: Promise<boolean> } | undefined;
export async function reconstructionEngineAvailable() {
  if (engineProbe && engineProbe.until > Date.now()) return engineProbe.value;
  const value = probe();
  engineProbe = { until: Date.now() + 30_000, value };
  return value;
}
async function probe() {
  try {
    const { stdout, stderr } = await execute(binary(), ["-h"], {
      timeout: 10_000,
      maxBuffer: 100_000,
    });
    return /COLMAP 4\./.test(stdout + stderr);
  } catch {
    return false;
  }
}
export async function runColmap({
  photos,
  matches,
  loadPhoto,
  progress,
  signal,
}: {
  photos: Asset[];
  matches?: PhotoMatches;
  loadPhoto: (key: string) => Promise<Uint8Array | null>;
  progress: (stage: string) => Promise<void>;
  signal: AbortSignal;
}) {
  const directory = await mkdtemp(join(tmpdir(), "roomform-reconstruction-"));
  const command = async (args: string[]) => {
    signal.throwIfAborted();
    try {
      await execute(binary(), [...args, "--log_target", "stderr"], {
        signal,
        timeout: 300_000,
        maxBuffer: 8_000_000,
        env: { ...process.env, QT_QPA_PLATFORM: "offscreen" },
      });
    } catch (error) {
      if (!signal.aborted)
        console.error(
          "COLMAP command failed",
          args[0],
          error && typeof error === "object" && "stderr" in error
            ? String(error.stderr).slice(-1800)
            : "Process interrupted",
        );
      throw error;
    }
  };
  try {
    const images = join(directory, "images"),
      sparse = join(directory, "sparse"),
      database = join(directory, "features.db");
    await Promise.all([mkdir(images), mkdir(sparse)]);
    const names = new Map<string, string>();
    await progress("Preparing photos");
    for (const photo of photos) {
      const bytes = await loadPhoto(photo.key);
      if (!bytes) throw new Error("A room photo is missing. Upload it again before rebuilding.");
      const extension = photo.key.split(".").pop();
      if (!["jpeg", "png", "webp"].includes(extension ?? ""))
        throw new Error("Use JPG, PNG, or WebP room photos.");
      const name = `${photo.id}.${extension}`;
      names.set(name, photo.id);
      await writeFile(join(images, name), bytes);
    }
    await progress("Finding shared details");
    await command([
      "feature_extractor",
      "--database_path",
      database,
      "--image_path",
      images,
      "--ImageReader.camera_model",
      "SIMPLE_RADIAL",
      "--FeatureExtraction.type",
      "SIFT",
      "--FeatureExtraction.use_gpu",
      "0",
      "--FeatureExtraction.num_threads",
      "4",
      "--FeatureExtraction.max_image_size",
      "1600",
      "--SiftExtraction.max_num_features",
      "8192",
      "--SiftExtraction.estimate_affine_shape",
      "1",
      "--SiftExtraction.domain_size_pooling",
      "1",
    ]);
    await progress("Matching photo angles");
    const matching = [
      "--database_path",
      database,
      "--FeatureMatching.type",
      "SIFT_BRUTEFORCE",
      "--FeatureMatching.use_gpu",
      "0",
      "--FeatureMatching.num_threads",
      "4",
      "--FeatureMatching.guided_matching",
      "1",
      "--TwoViewGeometry.min_num_inliers",
      matches ? "8" : "15",
    ];
    await command(["exhaustive_matcher", ...matching]);
    let initialPair: number[] | undefined;
    if (matches) {
      const path = join(directory, "manual-matches.txt");
      const imported = importPhotoMatches(database, matches);
      initialPair = imported.imageIds;
      await writeFile(path, imported.text);
      await command([
        "matches_importer",
        ...matching,
        "--match_list_path",
        path,
        "--match_type",
        "raw",
      ]);
    }
    await progress("Recovering the room in 3D");
    await command([
      "mapper",
      "--database_path",
      database,
      "--image_path",
      images,
      "--output_path",
      sparse,
      "--Mapper.num_threads",
      "4",
      "--Mapper.min_model_size",
      "2",
      // Listing sets often contain details visible in only two views.
      "--Mapper.tri_ignore_two_view_tracks",
      "0",
      "--Mapper.abs_pose_min_num_inliers",
      matches ? "8" : "15",
      "--Mapper.min_num_matches",
      matches ? "8" : "15",
      "--Mapper.init_min_num_inliers",
      matches ? "8" : "30",
      "--Mapper.init_min_tri_angle",
      "4",
      ...(initialPair
        ? [
            "--Mapper.init_image_id1",
            String(initialPair[0]),
            "--Mapper.init_image_id2",
            String(initialPair[1]),
          ]
        : []),
    ]);
    await progress("Preparing the 3D preview");
    const models = (await readdir(sparse, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && /^\d+$/.test(entry.name),
    );
    let best: ReconstructedScene | undefined;
    for (const model of models) {
      const path = join(sparse, model.name);
      await command([
        "model_converter",
        "--input_path",
        path,
        "--output_path",
        path,
        "--output_type",
        "TXT",
      ]);
      const texts = await Promise.all(
        ["cameras.txt", "images.txt", "points3D.txt"].map((name) =>
          readFile(join(path, name), "utf8"),
        ),
      );
      const scene = parseColmapModel(texts[0], texts[1], texts[2], names);
      if (
        !best ||
        scene.cameras.length > best.cameras.length ||
        (scene.cameras.length === best.cameras.length &&
          scene.positions.length > best.positions.length)
      )
        best = scene;
    }
    if (!best || best.cameras.length < 2 || best.positions.length < 24)
      throw new Error(
        "These photos could not be aligned into a stable 3D preview. Add closer overlapping angles, or help match the same details in two photos. Blank walls, reflections, and photos taken from one spot can prevent reconstruction.",
      );
    return { scene: best, components: models.length };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
