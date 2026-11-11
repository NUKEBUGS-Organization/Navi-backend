export type ErrorSource = 'server' | 'client';
export type ErrorSeverity = 'error' | 'warning';
export type ErrorKind =
  | 'http_exception'
  | 'unhandled_rejection'
  | 'uncaught_exception'
  | 'render'
  | 'window_error'
  | 'promise_rejection'
  | 'network';

export interface RecordErrorInput {
  source: ErrorSource;
  severity: ErrorSeverity;
  kind: ErrorKind;
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  statusCode?: number;
  method?: string;
  path?: string;
  route?: string;
  pageUrl?: string;
  user?: {
    id?: string;
    role?: string;
    organizationId?: string;
    email?: string;
  };
  userAgent?: string;
  ip?: string;
  appVersion?: string;
}

export const LIMITS = { message: 500, stack: 8192, componentStack: 4096 };
