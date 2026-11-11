import { computeFingerprint, normalizeMessage, topFrame } from './fingerprint';

describe('fingerprint', () => {
  it('collapses ids, uuids, emails, numbers and quoted values', () => {
    expect(
      normalizeMessage('Initiative 64b7f0c2e4b0a1a2b3c4d5e6 not found'),
    ).toBe('Initiative <id> not found');
    expect(
      normalizeMessage('Task 550e8400-e29b-41d4-a716-446655440000 missing'),
    ).toBe('Task <id> missing');
    expect(normalizeMessage('Limit 25 exceeded for "Acme"')).toBe(
      'Limit <n> exceeded for <str>',
    );
    expect(normalizeMessage('User a@b.co blocked')).toBe(
      'User <email> blocked',
    );
  });

  it('top frame skips node_modules and drops line/col', () => {
    const stack =
      'TypeError: x\n    at fn (/app/node_modules/lib/a.js:1:2)\n    at Svc.run (/app/dist/features/task/task.service.js:40:13)';
    expect(topFrame(stack)).toBe(
      'at Svc.run (/app/dist/features/task/task.service.js)',
    );
  });

  it('same problem with different ids gets one fingerprint; different routes differ', () => {
    const base = {
      source: 'server',
      kind: 'http_exception',
      name: 'NotFoundException',
      route: 'GET /initiatives/:id',
    } as const;
    const a = computeFingerprint({
      ...base,
      message: 'Initiative 64b7f0c2e4b0a1a2b3c4d5e6 not found',
    });
    const b = computeFingerprint({
      ...base,
      message: 'Initiative 64b7f0c2e4b0a1a2b3c4d5e7 not found',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(
      computeFingerprint({ ...base, route: 'GET /tasks/:id', message: 'x' }),
    ).not.toBe(computeFingerprint({ ...base, message: 'x' }));
  });

  it('top frame understands Firefox/Safari fn@url:l:c frames', () => {
    const ff =
      'handleClick@https://app.example.com/assets/index-abc123.js:12:345\n' +
      '@https://app.example.com/assets/vendor.js:1:2';
    expect(topFrame(ff)).toBe(
      'handleClick@https://app.example.com/assets/index-abc123.js',
    );
    expect(topFrame('@https://app.example.com/assets/index.js:3:4')).toBe(
      '@https://app.example.com/assets/index.js',
    );
    expect(topFrame('TypeError: no frames here')).toBeUndefined();
  });

  it('falls back to the top frame when route is empty', () => {
    const base = {
      source: 'client',
      kind: 'window_error',
      name: 'TypeError',
      message: 'x is undefined',
    } as const;
    const stackA = 'TypeError: x\n    at f (https://a/assets/index-AAA.js:1:2)';
    const stackB = 'TypeError: x\n    at f (https://a/assets/index-BBB.js:1:2)';
    expect(computeFingerprint({ ...base, route: '', stack: stackA })).toBe(
      computeFingerprint({ ...base, stack: stackA }),
    );
    expect(computeFingerprint({ ...base, route: '', stack: stackA })).not.toBe(
      computeFingerprint({ ...base, route: '', stack: stackB }),
    );
  });

  it('client errors with a page route group across deploys (bundle hashes)', () => {
    const base = {
      source: 'client',
      kind: 'window_error',
      name: 'TypeError',
      message: 'x is undefined',
      route: '/initiatives/:id',
    } as const;
    expect(
      computeFingerprint({
        ...base,
        stack: 'f@https://a/assets/index-AAA.js:1:2',
      }),
    ).toBe(
      computeFingerprint({
        ...base,
        stack: 'f@https://a/assets/index-BBB.js:9:9',
      }),
    );
  });
});
