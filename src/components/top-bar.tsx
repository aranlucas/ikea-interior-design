import { ChevronDown, Pencil, LogOut, Plus, Trash2 } from "lucide-react";
import type { StudioState } from "../hooks/use-studio";
export function TopBar({ state }: { state: StudioState }) {
  const { all, roomId, setRoomId, setModal, busy, locked, me, signed, deleteCurrentRoom } = state;
  const room = state.room!;
  const session = state.session!;
  return (
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
      {room && (
        <button
          className="icon-button"
          disabled={busy}
          aria-label="Rename room"
          title="Rename room"
          onClick={() => setModal("rename")}
        >
          <Pencil size={15} />
        </button>
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
  );
}
