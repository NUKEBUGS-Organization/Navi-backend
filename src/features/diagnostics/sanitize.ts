const SENSITIVE_PARAM = /token|password|secret|key|code|otp|auth/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Redacts values of sensitive keys in a `k=v&k=v` string. */
function redactPairs(pairs: string): string {
  return pairs
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const name = pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // keep raw name
      }
      return SENSITIVE_PARAM.test(decoded) ? `${name}=[redacted]` : pair;
    })
    .join('&');
}

/**
 * Replaces the values of sensitive query parameters (and of a `k=v` shaped
 * fragment, e.g. OAuth `#access_token=...`) with `[redacted]`.
 */
export function redactUrl(url: string): string {
  const hashIndex = url.indexOf('#');
  const hash =
    hashIndex >= 0 ? `#${redactPairs(url.slice(hashIndex + 1))}` : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex < 0) return `${beforeHash}${hash}`;

  const base = beforeHash.slice(0, queryIndex);
  const query = redactPairs(beforeHash.slice(queryIndex + 1));
  return `${base}?${query}${hash}`;
}

export function maskEmails(text: string): string {
  return text.replace(EMAIL, '<email>');
}

export function truncate(
  text: string | undefined,
  max: number,
): string | undefined {
  if (text === undefined) return undefined;
  return text.length > max ? text.slice(0, max) : text;
}
