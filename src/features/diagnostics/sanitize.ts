const SENSITIVE_PARAM =
  /^(token|access_?token|refresh_?token|id_?token|otp|code|password|passwd|pwd|secret|api_?key|key|auth|authorization|signature|sig)$/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Replaces the values of sensitive query parameters with `[redacted]`. */
export function redactUrl(url: string): string {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex < 0) return url;

  const base = beforeHash.slice(0, queryIndex);
  const query = beforeHash
    .slice(queryIndex + 1)
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
