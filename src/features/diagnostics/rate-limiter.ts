const WINDOW_MS = 60_000;

/**
 * Fixed-window, in-memory limiter for client error reports: a per-IP limit plus a
 * global backstop across all IPs. The per-IP map is hard-capped; when it is full,
 * expired entries are pruned at most once per window and reports from new IPs are
 * refused (counted as rate-limited) until room frees up.
 */
export class ClientReportRateLimiter {
  private readonly windows = new Map<string, { start: number; used: number }>();
  private readonly global = { start: -Infinity, used: 0 };
  private lastPrune = -Infinity;

  constructor(
    private readonly limitPerMinute = 60,
    private readonly globalLimitPerMinute = 600,
    private readonly maxTrackedIps = 10_000,
  ) {}

  /** Returns how many of `count` reports may be recorded in the current window. */
  allow(ip: string, count: number, now = Date.now()): number {
    let w = this.windows.get(ip);
    if (!w) {
      if (this.windows.size >= this.maxTrackedIps) {
        if (now - this.lastPrune >= WINDOW_MS) {
          this.lastPrune = now;
          this.prune(now);
        }
        if (this.windows.size >= this.maxTrackedIps) return 0;
      }
      w = { start: now, used: 0 };
      this.windows.set(ip, w);
    } else if (now - w.start >= WINDOW_MS) {
      w.start = now;
      w.used = 0;
    }

    if (now - this.global.start >= WINDOW_MS) {
      this.global.start = now;
      this.global.used = 0;
    }

    const granted = Math.max(
      0,
      Math.min(
        count,
        this.limitPerMinute - w.used,
        this.globalLimitPerMinute - this.global.used,
      ),
    );
    w.used += granted;
    this.global.used += granted;
    return granted;
  }

  private prune(now: number): void {
    for (const [ip, w] of this.windows) {
      if (now - w.start >= WINDOW_MS) this.windows.delete(ip);
    }
  }
}
