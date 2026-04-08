/** NAVI pillar tags aligned with assessment question metadata. */
export type NaviPillar = 'N' | 'A' | 'V' | 'I';

export function classifyNaviIndex(naviIndex: number): string {
  if (naviIndex >= 4.5) return 'Excellent (High Confidence)';
  if (naviIndex >= 3.8) return 'Strong (On Track)';
  if (naviIndex >= 3.0) return 'Moderate (At Risk)';
  if (naviIndex >= 2.0) return 'Weak (Stalled)';
  return 'Critical (Failing)';
}

/** Change-type weights (N, A, V, I) — sum to 1 before scope tweak. */
export function resolveNaviWeights(
  changeType?: string,
  opts?: { departmentCount?: number },
): { N: number; A: number; V: number; I: number } {
  const ct = (changeType ?? 'Other').toLowerCase();
  let n = 0.25;
  let a = 0.25;
  let v = 0.25;
  let i = 0.25;

  if (ct.includes('cultural')) {
    n = 0.3;
    a = 0.35;
    v = 0.2;
    i = 0.15;
  } else if (ct.includes('erp') || ct.includes('tech') || ct.includes('digital')) {
    n = 0.25;
    a = 0.2;
    v = 0.4;
    i = 0.15;
  } else if (ct.includes('department') && !ct.includes('full')) {
    n = 0.4;
    a = 0.25;
    v = 0.2;
    i = 0.15;
  } else if (ct.includes('full company') || ct.includes('merger')) {
    n = 0.25;
    a = 0.25;
    v = 0.25;
    i = 0.25;
  }

  const dc = opts?.departmentCount;
  if (dc === 0) n *= 1.1;
  else if (dc === 1) v *= 1.1;

  const sum = n + a + v + i;
  return { N: n / sum, A: a / sum, V: v / sum, I: i / sum };
}

export type NaviScoreResult = {
  n: number;
  a: number;
  v: number;
  i: number;
  /** Weighted NAVI index (change-type + scope when initiative context provided). */
  naviIndex: number;
  /** Simple average (N+A+V+I)/4 for alignment gap / reporting. */
  naviIndexSimple: number;
  classification: string;
  criticalPillars: NaviPillar[];
  strengthPillars: NaviPillar[];
};

export function computeNaviFromAnswers(
  answers: number[],
  pillars: (NaviPillar | '' | undefined | null)[],
  scoringContext?: { changeType?: string; departmentCount?: number },
): NaviScoreResult | null {
  if (!answers?.length || answers.length !== pillars.length) return null;
  const buckets: Record<NaviPillar, number[]> = { N: [], A: [], V: [], I: [] };
  for (let idx = 0; idx < answers.length; idx++) {
    const p = pillars[idx];
    const val = Number(answers[idx]);
    if (p !== 'N' && p !== 'A' && p !== 'V' && p !== 'I') continue;
    if (Number.isNaN(val) || val < 1 || val > 5) continue;
    buckets[p].push(val);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  const n = avg(buckets.N);
  const a = avg(buckets.A);
  const v = avg(buckets.V);
  const i = avg(buckets.I);
  if (buckets.N.length + buckets.A.length + buckets.V.length + buckets.I.length === 0) return null;

  const naviIndexSimple = (n + a + v + i) / 4;
  const w = resolveNaviWeights(scoringContext?.changeType, {
    departmentCount: scoringContext?.departmentCount,
  });
  const naviIndex = n * w.N + a * w.A + v * w.V + i * w.I;

  const criticalPillars: NaviPillar[] = [];
  const strengthPillars: NaviPillar[] = [];
  (['N', 'A', 'V', 'I'] as const).forEach((p) => {
    const arr = buckets[p];
    if (!arr.length) return;
    const x = avg(arr);
    if (x < 3.0) criticalPillars.push(p);
    if (x > 4.5) strengthPillars.push(p);
  });

  return {
    n: Math.round(n * 100) / 100,
    a: Math.round(a * 100) / 100,
    v: Math.round(v * 100) / 100,
    i: Math.round(i * 100) / 100,
    naviIndex: Math.round(naviIndex * 100) / 100,
    naviIndexSimple: Math.round(naviIndexSimple * 100) / 100,
    classification: classifyNaviIndex(naviIndex),
    criticalPillars,
    strengthPillars,
  };
}
