import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { mutateRoom } from "./room-mutation";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("room mutation ordering", () => {
  it("serializes saves and other writes for one room while other rooms proceed", async () => {
    const client = new QueryClient();
    const gate = deferred();
    const calls: string[] = [];
    const first = mutateRoom(client, "a", async () => {
      calls.push("old");
      await gate.promise;
    });
    const next = mutateRoom(client, "a", async () => {
      calls.push("newest");
    });
    const rename = mutateRoom(client, "a", async () => {
      calls.push("rename");
    });
    await mutateRoom(client, "b", async () => {
      calls.push("other room");
    });
    expect(calls).toEqual(["old", "other room"]);
    gate.resolve();
    await Promise.all([first, next, rename]);
    expect(calls).toEqual(["old", "other room", "newest", "rename"]);
    client.clear();
  });
  it("rejects a failed write and continues queued saves", async () => {
    const client = new QueryClient();
    const gate = deferred();
    const first = mutateRoom(client, "a", () => gate.promise);
    const failure = expect(first).rejects.toThrow("Denied");
    let saved = "";
    const next = mutateRoom(client, "a", async () => {
      saved = "newest";
    });
    gate.reject(new Error("Denied"));
    await failure;
    await next;
    expect(saved).toBe("newest");
    client.clear();
  });
});
