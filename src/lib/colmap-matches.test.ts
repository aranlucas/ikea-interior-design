import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { importPhotoMatches } from "./colmap-matches.server";

it("adds normalized manual coordinates and preserves automatic matches in either image order", () => {
  const directory = mkdtempSync(join(tmpdir(), "roomform-matches-"));
  const path = join(directory, "features.db");
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "CREATE TABLE images(image_id INTEGER PRIMARY KEY,name TEXT,camera_id INTEGER); CREATE TABLE cameras(camera_id INTEGER PRIMARY KEY,width INTEGER,height INTEGER); CREATE TABLE keypoints(image_id INTEGER PRIMARY KEY,rows INTEGER,cols INTEGER,data BLOB); CREATE TABLE descriptors(image_id INTEGER PRIMARY KEY,rows INTEGER,cols INTEGER,data BLOB); CREATE TABLE matches(pair_id INTEGER PRIMARY KEY,rows INTEGER,data BLOB); CREATE TABLE two_view_geometries(pair_id INTEGER PRIMARY KEY);",
    );
    db.exec(
      "INSERT INTO cameras VALUES(1,800,600); INSERT INTO images VALUES(2,'a.jpeg',1),(1,'b.jpeg',1)",
    );
    for (const id of [1, 2]) {
      db.prepare("INSERT INTO keypoints VALUES(?,1,6,?)").run(id, Buffer.alloc(24));
      db.prepare("INSERT INTO descriptors VALUES(?,1,128,?)").run(id, Buffer.alloc(128));
    }
    const pairId = 2147483647 + 2;
    db.prepare("INSERT INTO matches VALUES(?,1,?)").run(pairId, Buffer.alloc(8));
    db.prepare("INSERT INTO two_view_geometries VALUES(?)").run(pairId);
    const { text, imageIds } = importPhotoMatches(path, {
      aId: "a",
      bId: "b",
      points: Array.from({ length: 12 }, (_, i) => ({ a: [i / 20, 0.25], b: [i / 20, 0.5] })),
    });
    expect(text).toContain("a.jpeg b.jpeg\n0 0\n1 1");
    expect(text).toContain("12 12");
    expect(imageIds).toEqual([2, 1]);
    const features = db.prepare("SELECT rows,data FROM keypoints WHERE image_id=2").get()!;
    expect(features.rows).toBe(13);
    const data = Buffer.from(features.data as Uint8Array);
    expect(data.readFloatLE(24 + 4)).toBe(150);
    expect(data.readFloatLE(48)).toBe(40);
    expect(db.prepare("SELECT COUNT(*) AS n FROM two_view_geometries").get()!.n).toBe(0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
