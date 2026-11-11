import { ClientReportRateLimiter } from './rate-limiter';

describe('ClientReportRateLimiter', () => {
  it('allows 60 per minute per ip, then resets', () => {
    const rl = new ClientReportRateLimiter(60);
    expect(rl.allow('1.1.1.1', 50, 0)).toBe(50);
    expect(rl.allow('1.1.1.1', 20, 1000)).toBe(10);
    expect(rl.allow('2.2.2.2', 20, 1000)).toBe(20);
    expect(rl.allow('1.1.1.1', 5, 61_000)).toBe(5);
  });
});
