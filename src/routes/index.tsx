import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  LogOut,
  MoveHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { assetUrl, type Room, type User, type Asset, type GenerationJob } from "../lib/types";
export const Route = createFileRoute("/")({ component: Studio });
type Session = {
  user: User | null;
  local: boolean;
  authConfigured: boolean;
  generationConfigured: boolean;
};
type View = "photo" | "design" | "compare";
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  if (!r.ok) {
    const text = await r.text();
    try {
      throw new Error(JSON.parse(text).error || text);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(text);
      throw e;
    }
  }
  return r.json();
}
const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const styles = [
  "Warm minimalism",
  "Scandinavian",
  "Japandi",
  "Mid-century modern",
  "Organic modern",
  "Eclectic",
];
const roomTypes = ["Living room", "Bedroom", "Dining room", "Home office", "Kitchen", "Other"];
const accept = "image/jpeg,image/png,image/webp";

function Studio() {
  const [session, setSession] = useState<Session>();
  const [all, setAll] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [modal, setModal] = useState<"room" | "reference" | null>(null);
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
  const [notes, setNotes] = useState("");
  const [style, setStyle] = useState(styles[0]);
  const [designId, setDesignId] = useState("");
  const [view, setView] = useState<View>("design");
  const [split, setSplit] = useState(50);
  const [refine, setRefine] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const room = all.find((r) => r.id === roomId);
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
    setNotes(room?.notes || "");
    setStyle(room?.style || styles[0]);
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

  return (
    <div className="app">
      <header className="topbar">
        <a className="logo" href="/">
          <span className="logo-mark" aria-hidden />
          Roomform
        </a>
        {signed && all.length > 0 && (
          <div className="room-picker">
            <select aria-label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {all.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        )}
        {signed && all.length > 0 && (
          <button className="button ghost" disabled={busy} onClick={() => setModal("room")}>
            <Plus size={15} />
            <span className="hide-sm">New room</span>
          </button>
        )}
        <div className="topbar-end">
          {room && (
            <button
              className="icon-button"
              disabled={locked}
              aria-label={`Delete room ${room.name}`}
              title="Delete room"
              onClick={() => void deleteCurrentRoom()}
            >
              <Trash2 size={16} />
            </button>
          )}
          {me && (
            <a
              className="avatar"
              href="https://auth.aranlucas.workers.dev/account"
              title={session?.local ? "Local workspace" : me.name}
            >
              {me.name.slice(0, 1).toUpperCase() || "?"}
            </a>
          )}
          {signed && !session?.local && (
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                location.reload();
              }}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>

      {!session ? (
        <main className="center">
          <LoaderCircle className="spin muted" size={20} aria-label="Loading" />
        </main>
      ) : !signed ? (
        <main className="center">
          <div className="card">
            <h1>Sign in</h1>
            <p className="muted">Use your account to open your rooms.</p>
            <a
              className="button primary block"
              href={
                session.authConfigured
                  ? "/api/auth/login"
                  : "https://auth.aranlucas.workers.dev/account"
              }
            >
              Continue
            </a>
            {!session.authConfigured && (
              <p className="hint">
                Sign-in isn’t configured. Register this app’s OIDC client with the auth service.
              </p>
            )}
          </div>
        </main>
      ) : !room ? (
        <main className="center">
          <div className="card">
            <h1>New room</h1>
            <RoomTypes busy={busy} onPick={(type) => void create(type)} />
          </div>
        </main>
      ) : (
        <main className="workspace">
          <section className="stage">
            <div className="stage-bar">
              {design ? (
                <div className="segmented" role="group" aria-label="View">
                  {(["photo", "design", "compare"] as const).map((v) => (
                    <button
                      key={v}
                      aria-pressed={shown === v}
                      disabled={v === "compare" && !before}
                      onClick={() => setView(v)}
                    >
                      {v === "photo" ? "Photo" : v === "design" ? "Design" : "Compare"}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="muted small">
                  {photos.length
                    ? `${photos.length} photo${photos.length > 1 ? "s" : ""}`
                    : "No photos yet"}
                </span>
              )}
              {active && (
                <a
                  className="icon-button"
                  href={assetUrl(active.key)}
                  download={`${room.name}-roomform.png`}
                  aria-label="Download design"
                  title="Download"
                >
                  <Download size={16} />
                </a>
              )}
            </div>
            <div
              className={`canvas${dragging ? " dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              {shown === "compare" && design && before ? (
                <>
                  <img src={assetUrl(before.key)} alt="Original photo" />
                  <div className="after" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
                    <img src={assetUrl(design.key)} alt="Design" />
                  </div>
                  <div className="split-line" style={{ left: `${split}%` }}>
                    <span>
                      <MoveHorizontal size={16} />
                    </span>
                  </div>
                  <input
                    className="split-input"
                    type="range"
                    min="0"
                    max="100"
                    value={split}
                    aria-label="Compare original and design"
                    onChange={(e) => setSplit(Number(e.target.value))}
                  />
                  <span className="tag left">Before</span>
                  <span className="tag right">After</span>
                </>
              ) : active ? (
                <img src={assetUrl(active.key)} alt="Design" />
              ) : base ? (
                <img src={assetUrl(base.key)} alt={base.name} />
              ) : (
                <div className="dropzone">
                  <ImagePlus size={28} strokeWidth={1.5} />
                  <p>Drop room photos here</p>
                  <button
                    className="button"
                    disabled={locked}
                    onClick={() => input.current?.click()}
                  >
                    Choose photos
                  </button>
                  <small className="muted">JPG, PNG or WebP</small>
                </div>
              )}
              {generating && (
                <div className="overlay">
                  <LoaderCircle className="spin" size={22} />
                  <p>Generating…</p>
                  <small>This can take a few minutes.</small>
                </div>
              )}
            </div>
            <div className="strips">
              <Strip label="Photos">
                {photos.map((a) => (
                  <div className="thumb-wrap" key={a.id}>
                    <button
                      className="thumb"
                      aria-pressed={
                        (shown === "photo" && base?.id === a.id) ||
                        (shown !== "photo" && !!design && design.baseId === a.id)
                      }
                      disabled={locked}
                      aria-label={`Show ${a.name}`}
                      onClick={() => {
                        setBaseId(a.id);
                        setDesignId("");
                        setView("photo");
                      }}
                    >
                      <img src={assetUrl(a.key)} alt="" />
                    </button>
                    <button
                      className="thumb-delete"
                      aria-label={`Delete photo ${a.name}`}
                      title="Delete photo"
                      disabled={locked}
                      onClick={() => void deleteAsset(a)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  className="thumb add"
                  disabled={locked}
                  aria-label="Add photos"
                  title="Add photos"
                  onClick={() => input.current?.click()}
                >
                  <Plus size={18} />
                </button>
              </Strip>
              {room.designs.length > 0 && (
                <Strip label="Designs">
                  {room.designs.map((d, i) => (
                    <button
                      key={d.id}
                      className="thumb"
                      aria-pressed={active?.id === d.id}
                      disabled={generating}
                      aria-label={`Show design ${room.designs.length - i}`}
                      title={new Date(d.createdAt).toLocaleString()}
                      onClick={() => {
                        setDesignId(d.id);
                        setBaseId(d.baseId);
                        setView("design");
                      }}
                    >
                      <img src={assetUrl(d.key)} alt="" />
                    </button>
                  ))}
                </Strip>
              )}
              <input
                hidden
                ref={input}
                type="file"
                accept={accept}
                multiple
                onChange={(e) => {
                  void upload(e.target.files, "room");
                  e.target.value = "";
                }}
              />
            </div>
          </section>

          <aside className="panel">
            <div className="panel-body">
              <label className="field">
                <span>Style</span>
                <div className="select">
                  <select value={style} onChange={(e) => setStyle(e.target.value)}>
                    {styles.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </label>
              <label className="field">
                <span>Brief</span>
                <textarea
                  value={notes}
                  maxLength={4000}
                  rows={5}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Keep the floors. Linen sofa by the window, oak side table."
                />
              </label>
              <div className="field">
                <div className="field-head">
                  <span>
                    References
                    {refs.length > 0 && (
                      <em>
                        {selected.length}/{refs.length}
                      </em>
                    )}
                  </span>
                  <button
                    className="link-button"
                    disabled={locked}
                    onClick={() => setModal("reference")}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
                {refs.length ? (
                  <ul className="refs">
                    {refs.map((a) => {
                      const on = selected.includes(a.id);
                      return (
                        <li key={a.id} className={on ? "ref on" : "ref"}>
                          <button
                            className="ref-toggle"
                            aria-pressed={on}
                            aria-label={`${on ? "Exclude" : "Include"} ${a.name}`}
                            onClick={() =>
                              setSelected((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))
                            }
                          >
                            <img src={assetUrl(a.key)} alt="" />
                            <span className="check">
                              {on && <Check size={11} strokeWidth={3} />}
                            </span>
                          </button>
                          <div className="ref-text">
                            <strong title={a.name}>{a.name}</strong>
                            <span>
                              {a.kind === "product" ? "Product" : "Inspiration"} ·{" "}
                              <button
                                className="link-button"
                                disabled={locked}
                                onClick={() => setSizeAsset(a)}
                              >
                                {a.dimensions ||
                                  (a.availableSizes?.length ? "Choose size" : "Add size")}
                              </button>
                            </span>
                          </div>
                          {a.url && (
                            <a
                              className="icon-button sm"
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${a.name} source`}
                              title="Open source"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                          <button
                            className="icon-button sm"
                            disabled={locked}
                            aria-label={`Remove ${a.name}`}
                            title="Remove"
                            onClick={() => void deleteAsset(a)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <button
                    className="ref-empty"
                    disabled={locked}
                    onClick={() => setModal("reference")}
                  >
                    Add furniture or inspiration by link or image
                  </button>
                )}
              </div>
            </div>
            <div className="panel-foot">
              {active && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={refine}
                    onChange={(e) => setRefine(e.target.checked)}
                  />{" "}
                  Refine this design
                </label>
              )}
              <button
                className="button primary block"
                disabled={!base || locked || !session.generationConfigured}
                onClick={() => void generate()}
              >
                {generating ? (
                  <>
                    <LoaderCircle size={16} className="spin" /> Generating…
                  </>
                ) : refine ? (
                  "Refine"
                ) : (
                  "Generate"
                )}
              </button>
              {!session.generationConfigured ? (
                <p className="hint">Image generation isn’t configured on this server.</p>
              ) : (
                !base && <p className="hint">Add a room photo to generate.</p>
              )}
            </div>
          </aside>
        </main>
      )}

      {error && (
        <div role="alert" className="toast">
          <span>{error}</span>
          <button className="icon-button sm" aria-label="Dismiss" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {modal === "room" && (
        <Dialog title="New room" busy={busy} onClose={() => setModal(null)}>
          <RoomTypes busy={busy} onPick={(type) => void create(type)} />
        </Dialog>
      )}
      {modal === "reference" && (
        <Dialog title="Add reference" busy={busy} onClose={() => setModal(null)}>
          <ReferenceForm busy={busy} onSubmit={reference} />
        </Dialog>
      )}
      {sizeAsset && (
        <Dialog title="Product size" busy={busy} onClose={() => setSizeAsset(null)}>
          <form className="form" onSubmit={saveSize}>
            <p className="muted small">{sizeAsset.name}</p>
            <label className="field">
              <span>Dimensions</span>
              <input
                name="dimensions"
                maxLength={200}
                autoFocus
                defaultValue={sizeAsset.dimensions || ""}
                placeholder="e.g. 200 × 90 × 80 cm"
              />
            </label>
            {!!sizeAsset.availableSizes?.length && (
              <div className="chips" aria-label="Sizes listed on the product page">
                {sizeAsset.availableSizes.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={(e) => {
                      const field = e.currentTarget.form?.elements.namedItem("dimensions");
                      if (field instanceof HTMLInputElement) field.value = value;
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
            <p className="hint">Include units. Used as scale guidance.</p>
            <button className="button primary block" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function Strip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="strip">
      <span className="strip-label">{label}</span>
      <div className="strip-items">{children}</div>
    </div>
  );
}

function RoomTypes({ busy, onPick }: { busy: boolean; onPick: (type: string) => void }) {
  return (
    <div className="room-types">
      {roomTypes.map((type) => (
        <button key={type} className="button" disabled={busy} onClick={() => onPick(type)}>
          {type}
        </button>
      ))}
    </div>
  );
}

function ReferenceForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [source, setSource] = useState<"link" | "file">("link");
  const [file, setFile] = useState("");
  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="segmented full" role="group" aria-label="Source">
        <button type="button" aria-pressed={source === "link"} onClick={() => setSource("link")}>
          Link
        </button>
        <button type="button" aria-pressed={source === "file"} onClick={() => setSource("file")}>
          Image
        </button>
      </div>
      {source === "link" ? (
        <label className="field">
          <span>Product link</span>
          <input name="url" type="url" required autoFocus placeholder="https://www.ikea.com/…" />
        </label>
      ) : (
        <label className="file">
          <ImagePlus size={18} />
          <span>{file || "Choose an image"}</span>
          <input
            type="file"
            name="file"
            required
            accept={accept}
            onChange={(e) => setFile(e.target.files?.[0]?.name || "")}
          />
        </label>
      )}
      <label className="field">
        <span>
          Name <em>optional</em>
        </span>
        <input
          name="name"
          maxLength={120}
          placeholder={source === "link" ? "From the page" : "From the file name"}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Use as</span>
          <div className="select">
            <select name="kind">
              <option value="product">Product</option>
              <option value="inspiration">Inspiration</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        <label className="field">
          <span>
            Size <em>optional</em>
          </span>
          <input name="dimensions" maxLength={200} placeholder="200 × 90 cm" />
        </label>
      </div>
      {source === "link" && (
        <p className="hint">Public product pages only. If a site blocks import, use an image.</p>
      )}
      <button className="button primary block" disabled={busy}>
        {busy ? "Adding…" : "Add reference"}
      </button>
    </form>
  );
}

function Dialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-button sm" aria-label="Close" disabled={busy} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

async function compress(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 25_000_000) throw new Error("Choose a photo smaller than 25 MB.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not prepare photo."))),
      "image/jpeg",
      0.88,
    ),
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpeg", { type: "image/jpeg" });
}
