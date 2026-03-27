/** Minimal shapes for progress math (keeps task/adoption modules decoupled). */
export type TaskProgressInput = { progress?: number; adoptionMilestoneId?: unknown };
export type AdoptionProgressInput = { percentAdopted?: number; targetPercent?: number; milestone?: string };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function inferTargetPercent(a: AdoptionProgressInput): number {
  const raw = a.targetPercent;
  const explicit = raw == null ? null : clamp(raw, 0, 100);
  const milestoneText = String(a.milestone ?? '').trim();
  const m = milestoneText.match(/(\d+(?:\.\d+)?)/);
  const fromMilestone = m ? clamp(Number(m[1]), 0, 100) : null;

  // Backward-compat safety:
  // Some old records kept targetPercent at default 100 while milestone text carried values like "20".
  // In that case, prefer numeric milestone text (1..99).
  if (explicit === 100 && fromMilestone != null && fromMilestone > 0 && fromMilestone < 100) {
    return fromMilestone;
  }
  if (explicit != null) return explicit;
  if (fromMilestone != null) return fromMilestone;
  return 100;
}

/**
 * Initiative % complete on a 0–100 scale.
 *
 * - Each adoption milestone contributes `(percentAdopted/100) * targetPercent` toward the initiative.
 * - Tasks linked to a milestone affect initiative progress only via that milestone (not double-counted).
 * - If at least one adoption milestone exists, initiative progress is driven by adoption milestones only.
 *   (Unlinked tasks are ignored to prevent accidental inflation when a task was not mapped to a milestone.)
 * - If no milestones exist, progress falls back to average task progress.
 */
export function computeInitiativeProgressPercent(
  tasks: TaskProgressInput[],
  adoptions: AdoptionProgressInput[],
): number {
  const adoptionContribution = adoptions.reduce((sum, a) => {
    const achieved = clamp(a.percentAdopted ?? 0, 0, 100);
    const target = inferTargetPercent(a);
    return sum + (achieved / 100) * target;
  }, 0);
  if (adoptions.length > 0) {
    return Math.round(Math.min(100, adoptionContribution));
  }

  const taskAvg =
    tasks.length === 0
      ? 0
      : tasks.reduce((s, t) => s + clamp(t.progress ?? 0, 0, 100), 0) / tasks.length;
  return Math.round(taskAvg);
}
