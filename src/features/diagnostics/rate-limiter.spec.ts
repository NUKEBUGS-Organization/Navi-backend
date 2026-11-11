import { ClientReportRateLimiter } from './rate-limiter';

describe('ClientReportRateLimiter', () => {
  it('allows 60 per minute per ip, then resets', () => {
    const rl = new ClientReportRateLimiter(60);
    expect(rl.allow('1.1.1.1', 50, 0)).toBe(50);
    expect(rl.allow('1.1.1.1', 20, 1000)).toBe(10);
    expect(rl.allow('2.2.2.2', 20, 1000)).toBe(20);
    expect(rl.allow('1.1.1.1', 5, 61_000)).toBe(5);
  });

  it('caps accepted reports across all ips at the global limit per minute', () => {
    const rl = new ClientReportRateLimiter(60);
    let accepted = 0;
    for (let i = 0; i < 20; i++) accepted += rl.allow(`10.0.0.${i}`, 60, 1000);
    expect(accepted).toBe(600);
    expect(rl.allow('10.0.1.1', 5, 2000)).toBe(0);
    // the global window resets after a minute
    expect(rl.allow('10.0.1.1', 5, 61_000)).toBe(5);
  });

  it('refuses new ips when the map is full, still serving known ips', () => {
    const rl = new ClientReportRateLimiter(60, 600, 3);
    expect(rl.allow('a', 1, 0)).toBe(1);
    expect(rl.allow('b', 1, 0)).toBe(1);
    expect(rl.allow('c', 1, 0)).toBe(1);
    expect(rl.allow('d', 1, 1000)).toBe(0);
    expect(rl.allow('a', 1, 1000)).toBe(1);
  });

  it('prunes expired ips at most once per window when full', () => {
    const rl = new ClientReportRateLimiter(60, 600, 2);
    rl.allow('a', 1, 0);
    rl.allow('b', 1, 0);
    // prune runs but nothing has expired yet
    expect(rl.allow('c', 1, 30_000)).toBe(0);
    // a and b have expired, but the last prune was under a window ago: no rescan
    expect(rl.allow('c', 1, 61_000)).toBe(0);
    // a window after the last prune, it runs again and frees room
    expect(rl.allow('c', 1, 90_000)).toBe(1);
    expect(rl.allow('d', 1, 90_000)).toBe(1);
  });
});
