import type { GenerationJob } from "./types";
import type { GenerationResult } from "./studio-queries";
import type { Room } from "./types";
// A terminal job discovered on load belongs to an earlier visit, not this tab.
export function observeJob(watching: string | undefined, job: GenerationJob | null) {
  if (job?.status === "running") return { watching: job.id, act: false };
  if (job && watching === job.id) return { watching: undefined, act: true };
  return { watching, act: false };
}

export async function applyWatchedJob(
  watching: { current: string | undefined },
  result: GenerationResult,
  actions: {
    update: (room: Room) => Promise<unknown>;
    currentRoom: () => string;
    showDesign: (id: string) => void;
    onError: (message: string) => void;
  },
) {
  const outcome = observeJob(watching.current, result.job);
  // Consume before awaiting: replayed effects/results must act at most once.
  watching.current = outcome.watching;
  if (!outcome.act || !result.job) return;
  if (result.room) {
    await actions.update(result.room);
    if (result.room.id === actions.currentRoom()) actions.showDesign(result.job.designId || "");
  }
  if (result.job.status === "failed") actions.onError(result.job.error || "Generation failed.");
}
