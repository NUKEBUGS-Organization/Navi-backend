const WINDOW_MS = 60_000;
const PRUNE_THRESHOLD = 10_000;

/** Fixed-window, in-memory per-IP limiter for client error reports. */
export class ClientReportRateLimiter {
  private readonly windows = new Map<string, { start: number; used: number }>();

  constructor(private readonly limitPerMinute = 60) {}

  /** Returns how many of `count` reports may be recorded in the current window. */
  allow(ip: string, count: number, now = Date.now()): number {
    if (this.windows.size > PRUNE_THRESHOLD) this.prune(now);
    let w = this.windows.get(ip);
    if (!w || now - w.start >= WINDOW_MS) {
      w = { start: now, used: 0 };
      this.windows.set(ip, w);
    }
    const granted = Math.max(0, Math.min(count, this.limitPerMinute - w.used));
    w.used += granted;
    return granted;
  }

  private prune(now: number): void {
    for (const [ip, w] of this.windows) {
      if (now - w.start >= WINDOW_MS) this.windows.delete(ip);
    }
  }
}
