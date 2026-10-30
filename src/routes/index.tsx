import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, X } from "lucide-react";
import { useStudio } from "../hooks/use-studio";
import { RoomTypes } from "../components/studio-controls";
import { TopBar } from "../components/top-bar";
import { StudioStage } from "../components/studio-stage";
import { DesignPanel } from "../components/design-panel";
import { StudioDialogs } from "../components/studio-dialogs";
export const Route = createFileRoute("/")({ component: Studio });
function Studio() {
  const state = useStudio();
  const { session, error, setError, busy, room, signed, create } = state;
  return (
    <div className="app">
      <TopBar state={state} />

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
          <StudioStage state={state} />

          <DesignPanel state={state} />
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

      <StudioDialogs state={state} />
    </div>
  );
}
