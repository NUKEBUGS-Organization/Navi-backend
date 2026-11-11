import { createHash } from 'crypto';
import { maskEmails } from './sanitize';
import { RecordErrorInput } from './diagnostics.types';

/** Collapses variable parts of a message so recurring errors group together. */
export function normalizeMessage(message: string): string {
  return maskEmails(message)
    .replace(/\b[0-9a-f]{24}\b/gi, '<id>')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '<id>',
    )
    .replace(/"[^"]*"|'[^']*'/g, '<str>')
    .replace(/\b\d+\b/g, '<n>');
}

/** First stack frame outside node_modules, without line/column numbers. */
export function topFrame(stack?: string): string | undefined {
  if (!stack) return undefined;
  const frame = stack
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ') && !line.includes('node_modules'));
  return frame?.replace(/:\d+:\d+(\)?)$/, '$1');
}

export function computeFingerprint(
  i: Pick<
    RecordErrorInput,
    'source' | 'kind' | 'name' | 'message' | 'route' | 'stack'
  >,
): string {
  const parts = [
    i.source,
    i.kind,
    i.name,
    normalizeMessage(i.message),
    i.route ?? topFrame(i.stack) ?? '',
  ];
  return createHash('sha1').update(parts.join('|')).digest('hex');
}
