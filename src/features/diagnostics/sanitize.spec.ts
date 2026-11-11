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

  it('redacts keys by substring, decoded name, repeats and fragments', () => {
    expect(redactUrl('/a?pageCode=1&resetToken=2&client_secret=3&x=4')).toBe(
      '/a?pageCode=[redacted]&resetToken=[redacted]&client_secret=[redacted]&x=4',
    );
    expect(redactUrl('/a?to%6Ben=abc&page=2')).toBe(
      '/a?to%6Ben=[redacted]&page=2',
    );
    expect(redactUrl('/a?token=1&token=2&p=3')).toBe(
      '/a?token=[redacted]&token=[redacted]&p=3',
    );
    expect(redactUrl('/a?token=1#top')).toBe('/a?token=[redacted]#top');
    expect(redactUrl('/cb#access_token=abc&state=x')).toBe(
      '/cb#access_token=[redacted]&state=x',
    );
    expect(redactUrl('/docs#section-2')).toBe('/docs#section-2');
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
