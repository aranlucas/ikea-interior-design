import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Room } from "./types";
export const ownerPrefix = (sub: string) =>
  `users/${createHash("sha256").update(sub).digest("hex")}/`;
let database: DatabaseSync | undefined;
function db() {
  if (database) return database;
  const directory = process.env.DATA_DIR || ".data";
  mkdirSync(directory, { recursive: true });
  database = new DatabaseSync(resolve(directory, "roomform.sqlite"));
  database.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS objects (key TEXT PRIMARY KEY, data BLOB NOT NULL, content_type TEXT NOT NULL); CREATE TABLE IF NOT EXISTS generation_leases (owner TEXT PRIMARY KEY, expires INTEGER NOT NULL);",
  );
  return database;
}
export async function save(key: string, data: Uint8Array | string, contentType: string) {
  db()
    .prepare(
      "INSERT INTO objects (key,data,content_type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,content_type=excluded.content_type",
    )
    .run(key, Buffer.from(data), contentType);
}
export async function load(key: string): Promise<Uint8Array | null> {
  const row = db().prepare("SELECT data FROM objects WHERE key=?").get(key);
  return (row?.data as Uint8Array) || null;
}
export async function remove(key: string) {
  db().prepare("DELETE FROM objects WHERE key=?").run(key);
}
export async function rooms(sub: string): Promise<Room[]> {
  return readRooms(sub);
}
function readRooms(sub: string): Room[] {
  const row = db()
    .prepare("SELECT data FROM objects WHERE key=?")
    .get(`${ownerPrefix(sub)}rooms.json`);
  return row ? JSON.parse(Buffer.from(row.data as Uint8Array).toString()) : [];
}
export async function saveRooms(sub: string, data: Room[]) {
  await save(`${ownerPrefix(sub)}rooms.json`, JSON.stringify(data), "application/json");
}
export async function mutateRooms<T>(sub: string, mutate: (all: Room[]) => T): Promise<T> {
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const all = readRooms(sub);
    const result = mutate(all);
    connection
      .prepare(
        "INSERT INTO objects (key,data,content_type) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      )
      .run(`${ownerPrefix(sub)}rooms.json`, Buffer.from(JSON.stringify(all)), "application/json");
    connection.exec("COMMIT");
    return result;
  } catch (e) {
    connection.exec("ROLLBACK");
    throw e;
  }
}
export function claimGeneration(sub: string) {
  const now = Date.now();
  return (
    db()
      .prepare(
        "INSERT INTO generation_leases (owner,expires) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET expires=excluded.expires WHERE generation_leases.expires < ?",
      )
      .run(sub, now + 300_000, now).changes > 0
  );
}
export function releaseGeneration(sub: string) {
  db().prepare("DELETE FROM generation_leases WHERE owner=?").run(sub);
}
export async function deleteRoom(sub: string, roomId: string) {
  return mutateRooms(sub, (all) => {
    const index = all.findIndex((room) => room.id === roomId);
    if (index < 0) return false;
    const lease = db().prepare("SELECT expires FROM generation_leases WHERE owner=?").get(sub);
    if (lease && Number(lease.expires) > Date.now())
      throw new Response("Wait for your design to finish before deleting a room.", { status: 409 });
    const prefix = `${ownerPrefix(sub)}${roomId}/`;
    db().prepare("DELETE FROM objects WHERE substr(key,1,?)=?").run(prefix.length, prefix);
    all.splice(index, 1);
    return true;
  });
}
