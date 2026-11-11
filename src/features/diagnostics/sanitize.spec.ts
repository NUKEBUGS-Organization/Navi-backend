import { LIMITS } from './diagnostics.types';
import { maskEmails, redactUrl, truncate } from './sanitize';

describe('sanitize', () => {
  it('redacts sensitive query values on relative and absolute URLs', () => {
    expect(redactUrl('/auth/reset?token=abc&page=2')).toBe(
      '/auth/reset?token=[redacted]&page=2',
    );
    expect(
      redactUrl('https://app.changewithnavi.com/x?otp=1234&apiKey=z'),
    ).toBe('https://app.changewithnavi.com/x?otp=[redacted]&apiKey=[redacted]');
    expect(redactUrl('/plain/path')).toBe('/plain/path');
  });

  it('masks emails', () => {
    expect(maskEmails('No user jane.doe@acme.com found')).toBe(
      'No user <email> found',
    );
  });

  it('truncates and passes undefined through', () => {
    expect(truncate('a'.repeat(600), LIMITS.message)!.length).toBe(500);
    expect(truncate(undefined, 10)).toBeUndefined();
  });
});
