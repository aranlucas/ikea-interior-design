import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRoomDrafts } from "./use-room-drafts";
import type { Room, Asset, GenerationJob } from "../lib/types";
import { api, json, compress, type Session, type View } from "../lib/studio-client";
export function useStudio() {
  const [session, setSession] = useState<Session>();
  const [all, setAll] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [modal, setModal] = useState<"room" | "reference" | "rename" | null>(null);
  const [sizeAsset, setSizeAsset] = useState<Asset | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  // Only the job this tab watched running may update the view or report an error.
  const watching = useRef<string | undefined>(undefined);
  const generating = starting || (job?.status === "running" && job.roomId === roomId);
  const [baseId, setBaseId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [designId, setDesignId] = useState("");
  const [view, setView] = useState<View>("design");
  const [split, setSplit] = useState(50);
  const [refine, setRefine] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const room = all.find((r) => r.id === roomId);
  const { notes, style, setNotes, setStyle, saveStatus } = useRoomDrafts(
    room,
    (id, notes, style) =>
      setAll((previous) => previous.map((r) => (r.id === id ? { ...r, notes, style } : r))),
    setError,
  );
  const photos = room?.assets.filter((a) => a.kind === "room") || [];
  const refs = room?.assets.filter((a) => a.kind !== "room") || [];
  const base = photos.find((a) => a.id === baseId) || photos[0];
  const design =
    room?.designs.find((d) => d.id === designId) ||
    room?.designs.find((d) => d.baseId === base?.id);
  const shown = design ? view : "photo";
  const active = shown === "photo" ? undefined : design;
  const before = design && photos.find((a) => a.id === design.baseId);
  const locked = busy || starting || job?.status === "running";
  const me = session?.user;
  const signed = !!me;
  useEffect(() => {
    api<Session>("/api/session")
      .then(async (s) => {
        setSession(s);
        if (s.user) {
          const rooms = await api<Room[]>("/api/rooms");
          setAll(rooms);
          if (rooms[0]) setRoomId(rooms[0].id);
        }
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setBaseId(room?.assets.find((a) => a.kind === "room")?.id || "");
    setSelected(room?.assets.filter((a) => a.kind !== "room").map((a) => a.id) || []);
    setDesignId("");
    setView("design");
    setRefine(false);
  }, [roomId]);
  useEffect(() => {
    if (!active) setRefine(false);
  }, [active?.id]);
  useEffect(() => {
    if (!signed) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<{ job: GenerationJob | null; room?: Room }>("/api/generate");
        if (cancelled) return;
        setJob(result.job);
        if (result.job?.status === "running") watching.current = result.job.id;
        else {
          if (!result.job || watching.current !== result.job.id) return;
          watching.current = undefined;
          if (result.room) {
            update(result.room);
            if (result.room.id === roomId) {
              setDesignId(result.job.designId || "");
              setView("design");
            }
          }
          if (result.job.status === "failed") setError(result.job.error || "Generation failed.");
          return;
        }
      } catch (error) {
        if (!cancelled)
          setError(error instanceof Error ? error.message : "Could not check generation.");
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 3000);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signed, roomId, job?.id]);
  function update(r: Room) {
    setAll((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
  }
  async function run(task: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  async function create(type: string) {
    await run(async () => {
      const r = await api<Room>("/api/rooms", json({ type }));
      update(r);
      setRoomId(r.id);
      setModal(null);
    });
  }
  async function upload(
    files: FileList | File[] | null,
    kind: Asset["kind"],
    name?: string,
    url?: string,
    dimensions?: string,
  ) {
    if (!files?.length || !room) return;
    const id = room.id;
    await run(async () => {
      for (const file of Array.from(files)) {
        const compressed = await compress(file);
        const data = new FormData();
        data.set("roomId", id);
        data.set("file", compressed);
        data.set("kind", kind);
        data.set("name", name || file.name.replace(/\.[^.]+$/, ""));
        if (url) data.set("url", url);
        if (dimensions) data.set("dimensions", dimensions);
        const r = await api<Room>("/api/rooms", { method: "PATCH", body: data });
        update(r);
        if (kind !== "room") setSelected((p) => [...p, r.assets[r.assets.length - 1].id]);
        else setBaseId((p) => p || r.assets.find((a) => a.kind === "room")?.id || "");
      }
      setModal(null);
    });
  }
  async function reference(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("file");
    const fields = [
      String(data.get("kind")) as Asset["kind"],
      String(data.get("name") || ""),
      String(data.get("url") || ""),
      String(data.get("dimensions") || ""),
    ] as const;
    if (file instanceof File && file.size) {
      await upload([file], ...fields);
      return;
    }
    await run(async () => {
      const r = await api<Room>(
        "/api/import",
        json({
          roomId: room?.id,
          url: data.get("url"),
          name: data.get("name"),
          kind: data.get("kind"),
          dimensions: data.get("dimensions"),
        }),
      );
      update(r);
      setSelected((p) => [...p, r.assets[r.assets.length - 1].id]);
      setModal(null);
    });
  }
  async function saveSize(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!room || !sizeAsset) return;
    const data = new FormData(e.currentTarget);
    await run(async () => {
      const r = await api<Room>("/api/rooms", {
        ...json({ roomId: room.id, assetId: sizeAsset.id, dimensions: data.get("dimensions") }),
        method: "PUT",
      });
      update(r);
      setSizeAsset(null);
    });
  }
  async function renameRoom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!room) return;
    const name = String(new FormData(e.currentTarget).get("name") || "").trim();
    await run(async () => {
      const result = await api<Room>("/api/rooms", {
        ...json({ roomId: room.id, name }),
        method: "PUT",
      });
      setAll((previous) =>
        previous.map((r) => (r.id === result.id ? { ...r, name: result.name } : r)),
      );
      setModal(null);
    });
  }
  async function deleteDesign(id: string) {
    if (!room || !window.confirm("Delete this design? This permanently deletes its image.")) return;
    await run(async () => {
      const result = await api<Room>("/api/rooms", {
        ...json({ roomId: room.id, designId: id }),
        method: "DELETE",
      });
      update(result);
      if (design?.id === id) {
        setDesignId("");
        setView("design");
      }
    });
  }
  async function deleteCurrentRoom() {
    if (
      !room ||
      !window.confirm(
        `Delete “${room.name}”? This permanently deletes its photos, references, and designs.`,
      )
    )
      return;
    const id = room.id;
    await run(async () => {
      await api<{ deletedRoomId: string }>("/api/rooms", {
        ...json({ roomId: id }),
        method: "DELETE",
      });
      const remaining = await api<Room[]>("/api/rooms");
      setAll(remaining);
      setRoomId(remaining[0]?.id || "");
      setModal(null);
    });
  }
  async function deleteAsset(asset: Asset) {
    if (!room) return;
    await run(async () => {
      const r = await api<Room>("/api/rooms", {
        ...json({ roomId: room.id, assetId: asset.id }),
        method: "DELETE",
      });
      update(r);
      setSelected((ids) => ids.filter((id) => id !== asset.id));
      if (asset.kind === "room") {
        setBaseId((id) =>
          id === asset.id ? r.assets.find((a) => a.kind === "room")?.id || "" : id,
        );
        setDesignId("");
        setView("design");
      }
    });
  }
  async function generate() {
    if (!room || !base) return;
    setStarting(true);
    setError("");
    try {
      const r = await api<{ jobId: string }>(
        "/api/generate",
        json({
          roomId: room.id,
          baseId: base.id,
          notes,
          style,
          assetIds: selected,
          previousDesignId: refine ? active?.id : undefined,
        }),
      );
      watching.current = r.jobId;
      setJob({
        id: r.jobId,
        owner: "",
        roomId: room.id,
        status: "running",
        error: null,
        designId: null,
        createdAt: "",
        updatedAt: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setStarting(false);
    }
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!locked) void upload(e.dataTransfer.files, "room");
  }

  return {
    session,
    setSession,
    all,
    setAll,
    roomId,
    setRoomId,
    modal,
    setModal,
    sizeAsset,
    setSizeAsset,
    error,
    setError,
    busy,
    setBusy,
    starting,
    setStarting,
    job,
    setJob,
    generating,
    baseId,
    setBaseId,
    selected,
    setSelected,
    notes,
    setNotes,
    style,
    setStyle,
    designId,
    setDesignId,
    view,
    setView,
    split,
    setSplit,
    refine,
    setRefine,
    dragging,
    setDragging,
    input,
    room,
    photos,
    refs,
    base,
    design,
    shown,
    active,
    before,
    locked,
    me,
    signed,
    update,
    run,
    create,
    upload,
    reference,
    saveStatus,
    renameRoom,
    deleteDesign,
    saveSize,
    deleteCurrentRoom,
    deleteAsset,
    generate,
    drop,
  };
}
export type StudioState = ReturnType<typeof useStudio>;
