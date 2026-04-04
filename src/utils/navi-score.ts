/** NAVI pillar tags aligned with assessment question metadata. */
export type NaviPillar = 'N' | 'A' | 'V' | 'I';

export function classifyNaviIndex(naviIndex: number): string {
  if (naviIndex >= 4.5) return 'Excellent (High Confidence)';
  if (naviIndex >= 3.8) return 'Strong (On Track)';
  if (naviIndex >= 3.0) return 'Moderate (At Risk)';
  if (naviIndex >= 2.0) return 'Weak (Stalled)';
  return 'Critical (Failing)';
}

export function computeNaviFromAnswers(
  answers: number[],
  pillars: (NaviPillar | '' | undefined | null)[],
): {
  n: number;
  a: number;
  v: number;
  i: number;
  naviIndex: number;
  classification: string;
} | null {
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
  const naviIndex = (n + a + v + i) / 4;
  return {
    n: Math.round(n * 100) / 100,
    a: Math.round(a * 100) / 100,
    v: Math.round(v * 100) / 100,
    i: Math.round(i * 100) / 100,
    naviIndex: Math.round(naviIndex * 100) / 100,
    classification: classifyNaviIndex(naviIndex),
  };
}
