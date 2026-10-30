import type { GenerationJob } from "./types";
// A terminal job discovered on load belongs to an earlier visit, not this tab.
export function observeJob(watching: string | undefined, job: GenerationJob | null) {
  if (job?.status === "running") return { watching: job.id, act: false };
  if (job && watching === job.id) return { watching: undefined, act: true };
  return { watching, act: false };
}
