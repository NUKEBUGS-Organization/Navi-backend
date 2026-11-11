# Error Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every server and browser error in Navi's MongoDB, grouped by cause, and show them to the super admin on a Diagnostics page.

**Architecture:** A new NestJS `diagnostics` feature module owns two Mongoose collections (`ErrorGroup`, `ErrorEvent`), a global exception filter, process-level crash handlers, a public client-report endpoint and super-admin read/resolve endpoints. The React app gets a small reporter (global listeners, ErrorBoundary hook, network failures in the API client) and a super-admin page.

**Tech Stack:** NestJS 11, Mongoose 9, class-validator, Jest/ts-jest (backend); React 19, Vite 8, Mantine 8, react-router 7, @tabler/icons-react (frontend).

**Spec:** `docs/superpowers/specs/2026-11-11-error-diagnostics-design.md` (Navi-backend repo)

**Repos / paths:** Backend tasks run in `Navi-backend/`, frontend tasks in `Navi-frontend/`. Both on branch `feature/error-diagnostics`. Backend unit tests live next to the code as `*.spec.ts` (Jest `rootDir: src`); run with `npx jest <path>`. Frontend has no test runner; it's verified with `npm run build`, `npm run lint` and Task 9.

**Commit identity:** this machine has no git identity; commit with
`git -c user.name=QaisarWaheed -c user.email=106738488+QaisarWaheed@users.noreply.github.com commit ...` and end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Global Constraints

- Viewers: super admin only (`UserRole.SUPER_ADMIN`, frontend role string `"super_admin"`).
- Severity: status ≥ 500 or non-`HttpException` → `'error'`; 4xx → `'warning'`. Page defaults to `error` only.
- Sources: `'server' | 'client'`. Kinds: `http_exception`, `unhandled_rejection`, `uncaught_exception`, `render`, `window_error`, `promise_rejection`, `network`.
- Truncation: message 500 chars, stack 8 KB (8192), componentStack 4 KB (4096).
- Redact query values whose key matches `/token|password|secret|key|code|otp|auth/i` → `[redacted]`. Mask emails in messages.
- Never store request bodies, passwords, tokens or the `Authorization` header.
- `ErrorEvent` TTL: 30 days on `createdAt`. Groups are kept.
- `affectedUserIds` / `affectedOrgIds` capped at 500 entries each.
- Client endpoint: ≤ 20 reports per call, body ≤ 32 KB, 60 reports/min per IP; excess dropped, still `202`.
- Recording never throws and never changes an HTTP response. Errors on `/diagnostics` routes are not recorded.
- No alerts, no third-party service, no new runtime dependencies.

## Review Focus

1. **MongoDB down or slow while an error is recorded** → the user still gets the exact original error response, promptly. (Task 3: filter test with a `record` that throws.)
2. **Frontend error loop** (a component that throws on every render, or an interval that throws) → reports are deduped (10 s) and rate-limited, never a flood. (Task 7 dedupe; Task 5 rate-limit test.)
3. **HTTP error rejected and not caught on the frontend** (`ApiError` objects `{message, status}`) → not reported again from the browser, since the server already recorded it. (Task 7 step.)
4. **Logged-out or expired-token user hits an error** (login page, expired session) → report still accepted and recorded without user info, never 401. (Task 5 test.)
5. **Oversized or junk client payload** (huge stack, 100 reports, missing fields) → truncated or rejected with 4xx, never 500, never stored oversized. (Task 5 tests.)

---

## File Structure

**Backend `src/features/diagnostics/`**
| File | Responsibility |
|---|---|
| `diagnostics.types.ts` | `ErrorSource`, `ErrorSeverity`, `ErrorKind`, `RecordErrorInput` |
| `sanitize.ts` | `redactUrl`, `maskEmails`, `truncate`, limits constants |
| `fingerprint.ts` | `normalizeMessage`, `topFrame`, `computeFingerprint` |
| `error-group.entity.ts` / `error-event.entity.ts` | Mongoose schemas + indexes |
| `diagnostics.service.ts` | `record`, `recordAsync`, queries, status change |
| `all-exceptions.filter.ts` | Global filter: record then delegate to `BaseExceptionFilter` |
| `process-handlers.ts` | `installProcessHandlers` |
| `rate-limiter.ts` | `ClientReportRateLimiter` |
| `dto/client-error.dto.ts`, `dto/list-groups.dto.ts`, `dto/update-group.dto.ts` | Validation |
| `diagnostics.controller.ts` | Routes (§6 of spec) |
| `diagnostics.module.ts` | Wiring + `APP_FILTER` |
Modified: `src/app.module.ts`, `src/main.ts`.

**Frontend**
| File | Responsibility |
|---|---|
| `src/diagnostics/reporter.ts` | Queue, dedupe, flush, `reportError`, `flushNow` |
| `src/diagnostics/install.ts` | `installGlobalErrorHandlers` |
| `src/types/diagnostics.ts` | API response types |
| `src/api/diagnostics.ts` | `diagnosticsApi` |
| `src/roles/super-admin/pages/Diagnostics.tsx` | Page (+ `DiagnosticsDetailDrawer.tsx` beside it) |
Modified: `src/main.tsx`, `src/components/ErrorBoundary.tsx`, `src/api/client.ts`, `src/api/index.ts`, `src/types/index.ts`, `src/constants/routes.ts`, `src/routers/routes.tsx`, `src/roles/super-admin/layout/SuperAdminLayout.tsx`.

---

### Task 1: Sanitizing and fingerprinting (backend, pure functions)

**Files:**
- Create: `src/features/diagnostics/diagnostics.types.ts`, `src/features/diagnostics/sanitize.ts`, `src/features/diagnostics/fingerprint.ts`
- Test: `src/features/diagnostics/sanitize.spec.ts`, `src/features/diagnostics/fingerprint.spec.ts`

**Interfaces:**
- Produces:
  - `type ErrorSource = 'server' | 'client'`; `type ErrorSeverity = 'error' | 'warning'`; `type ErrorKind = 'http_exception' | 'unhandled_rejection' | 'uncaught_exception' | 'render' | 'window_error' | 'promise_rejection' | 'network'`
  - `interface RecordErrorInput { source; severity; kind; name: string; message: string; stack?: string; componentStack?: string; statusCode?: number; method?: string; path?: string; route?: string; pageUrl?: string; user?: { id?: string; role?: string; organizationId?: string; email?: string }; userAgent?: string; ip?: string; appVersion?: string }`
  - `const LIMITS = { message: 500, stack: 8192, componentStack: 4096 }`
  - `redactUrl(url: string): string`, `maskEmails(text: string): string`, `truncate(text: string | undefined, max: number): string | undefined`
  - `normalizeMessage(message: string): string`, `topFrame(stack?: string): string | undefined`, `computeFingerprint(i: Pick<RecordErrorInput, 'source' | 'kind' | 'name' | 'message' | 'route' | 'stack'>): string` (40-char sha1 hex)

- [ ] **Step 1: Write failing tests**

```ts
// sanitize.spec.ts
it('redacts sensitive query values on relative and absolute URLs', () => {
  expect(redactUrl('/auth/reset?token=abc&page=2')).toBe('/auth/reset?token=[redacted]&page=2');
  expect(redactUrl('https://app.changewithnavi.com/x?otp=1234&apiKey=z')).toBe('https://app.changewithnavi.com/x?otp=[redacted]&apiKey=[redacted]');
  expect(redactUrl('/plain/path')).toBe('/plain/path');
});
it('masks emails', () => {
  expect(maskEmails('No user jane.doe@acme.com found')).toBe('No user <email> found');
});
it('truncates and passes undefined through', () => {
  expect(truncate('a'.repeat(600), LIMITS.message)!.length).toBe(500);
  expect(truncate(undefined, 10)).toBeUndefined();
});

// fingerprint.spec.ts
it('collapses ids, uuids, emails, numbers and quoted values', () => {
  expect(normalizeMessage('Initiative 64b7f0c2e4b0a1a2b3c4d5e6 not found')).toBe('Initiative <id> not found');
  expect(normalizeMessage('Task 550e8400-e29b-41d4-a716-446655440000 missing')).toBe('Task <id> missing');
  expect(normalizeMessage('Limit 25 exceeded for "Acme"')).toBe('Limit <n> exceeded for <str>');
  expect(normalizeMessage('User a@b.co blocked')).toBe('User <email> blocked');
});
it('top frame skips node_modules and drops line/col', () => {
  const stack = 'TypeError: x\n    at fn (/app/node_modules/lib/a.js:1:2)\n    at Svc.run (/app/dist/features/task/task.service.js:40:13)';
  expect(topFrame(stack)).toBe('at Svc.run (/app/dist/features/task/task.service.js)');
});
it('same problem with different ids gets one fingerprint; different routes differ', () => {
  const base = { source: 'server', kind: 'http_exception', name: 'NotFoundException', route: 'GET /initiatives/:id' } as const;
  const a = computeFingerprint({ ...base, message: 'Initiative 64b7f0c2e4b0a1a2b3c4d5e6 not found' });
  const b = computeFingerprint({ ...base, message: 'Initiative 64b7f0c2e4b0a1a2b3c4d5e7 not found' });
  expect(a).toBe(b);
  expect(a).toMatch(/^[0-9a-f]{40}$/);
  expect(computeFingerprint({ ...base, route: 'GET /tasks/:id', message: 'x' })).not.toBe(computeFingerprint({ ...base, message: 'x' }));
});
```

- [ ] **Step 2: Run** `npx jest src/features/diagnostics` → FAIL (modules not found).
- [ ] **Step 3: Implement** the three files. Order in `normalizeMessage`: emails → ObjectIds (`/\b[0-9a-f]{24}\b/gi`) → UUIDs → quoted strings (`"…"`, `'…'`) → numbers (`/\b\d+\b/g`). `computeFingerprint` uses `crypto.createHash('sha1')` over `[source, kind, name, normalizeMessage(message), route ?? topFrame(stack) ?? ''].join('|')`. `redactUrl` parses with `new URL(url, 'http://x')` and rebuilds a relative result when the input was relative; on parse failure return the input with a regex-based redaction.
- [ ] **Step 4: Run** `npx jest src/features/diagnostics` → PASS.
- [ ] **Step 5: Commit** `feat(diagnostics): sanitizing and fingerprinting helpers`.

---

### Task 2: Schemas and `DiagnosticsService.record`

**Files:**
- Create: `error-group.entity.ts`, `error-event.entity.ts`, `diagnostics.service.ts`, `diagnostics.module.ts` (in `src/features/diagnostics/`)
- Modify: `src/app.module.ts` (import `DiagnosticsModule`)
- Test: `src/features/diagnostics/diagnostics.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 types and helpers.
- Produces:
  - Mongoose model names `'ErrorGroup'`, `'ErrorEvent'`; schemas `ErrorGroupSchema`, `ErrorEventSchema` with fields exactly as spec §2. Indexes: `ErrorGroup.fingerprint` unique, `ErrorGroup.lastSeen`, `ErrorGroup.status`; `ErrorEvent.groupId`; `ErrorEvent.createdAt` with `expires: 60 * 60 * 24 * 30`.
  - `DiagnosticsService.recordAsync(input: RecordErrorInput): Promise<void>` — never rejects.
  - `DiagnosticsService.record(input: RecordErrorInput): void` — calls `recordAsync` without awaiting.
  - `DiagnosticsModule` exports `DiagnosticsService`; imports `AuthModule` (for `JwtService`/`AuthService` in Task 5).

- [ ] **Step 1: Write failing tests** (models mocked with `getModelToken('ErrorGroup')` / `getModelToken('ErrorEvent')` via `Test.createTestingModule`):

```ts
it('upserts the group by fingerprint and inserts a truncated, sanitized event', async () => {
  await service.recordAsync({ source: 'server', severity: 'error', kind: 'http_exception', name: 'TypeError',
    message: 'boom for a@b.co', stack: 's'.repeat(10000), path: '/x?token=t', route: 'GET /x',
    user: { id: '64b7f0c2e4b0a1a2b3c4d5e6', role: 'admin', organizationId: '64b7f0c2e4b0a1a2b3c4d5e7' } });
  const [filter, update, opts] = groupModel.findOneAndUpdate.mock.calls[0];
  expect(filter).toEqual({ fingerprint: expect.stringMatching(/^[0-9a-f]{40}$/) });
  expect(update.$inc).toEqual({ count: 1 });
  expect(update.$setOnInsert.firstSeen).toBeInstanceOf(Date);
  expect(opts).toMatchObject({ upsert: true, new: true });
  const event = eventModel.create.mock.calls[0][0];
  expect(event.message).toBe('boom for <email>');
  expect(event.stack.length).toBe(8192);
  expect(event.path).toBe('/x?token=[redacted]');
});
it('reopens a resolved group when the error comes back', async () => {
  groupModel.findOneAndUpdate.mockResolvedValue({ _id: gid, status: 'resolved' });
  await service.recordAsync(sampleInput);
  expect(groupModel.updateOne).toHaveBeenCalledWith({ _id: gid }, { $set: { status: 'open' }, $unset: { resolvedAt: 1, resolvedBy: 1 } });
});
it('never rejects when the database fails', async () => {
  groupModel.findOneAndUpdate.mockRejectedValue(new Error('mongo down'));
  await expect(service.recordAsync(sampleInput)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run** `npx jest src/features/diagnostics/diagnostics.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** Group update: `$inc count`, `$set { lastSeen, severity, message (normalized, truncated), statusCode, route }`, `$setOnInsert { firstSeen, source, kind, name, status: 'open' }`, `$addToSet` for `roles`. Then, if the input has a user/org id and the returned group's `affectedUserIds` / `affectedOrgIds` has fewer than 500 entries, run a second `updateOne({ _id }, { $addToSet: { affectedUserIds: id } })` (same for org). The cap may overshoot by a few under concurrency, which is fine. Event `create` with sanitized fields (`maskEmails`+`truncate` on message, `truncate` on stacks, `redactUrl` on `path`/`pageUrl`). Wrap everything in `try/catch` → `Logger.warn`. Add `DiagnosticsModule` with `MongooseModule.forFeature` for both schemas and register it in `AppModule.imports`.
- [ ] **Step 4: Run** the spec → PASS; `npm run build` → succeeds.
- [ ] **Step 5: Commit** `feat(diagnostics): error store and record service`.

---

### Task 3: Global exception filter

**Files:**
- Create: `src/features/diagnostics/all-exceptions.filter.ts`
- Modify: `diagnostics.module.ts` (add `{ provide: APP_FILTER, useClass: AllExceptionsFilter }`)
- Test: `src/features/diagnostics/all-exceptions.filter.spec.ts`

**Interfaces:**
- Consumes: `DiagnosticsService.record`, `RecordErrorInput`.
- Produces: `class AllExceptionsFilter extends BaseExceptionFilter` with `constructor(adapterHost: HttpAdapterHost, diagnostics: DiagnosticsService)` calling `super(adapterHost.httpAdapter)`; `catch(exception: unknown, host: ArgumentsHost): void`.

- [ ] **Step 1: Write failing tests** (stub `BaseExceptionFilter.prototype.catch` with `jest.spyOn` to assert delegation; build `host` with `switchToHttp().getRequest()`):

```ts
it('records 5xx/non-HTTP errors as error and delegates', () => {
  filter.catch(new Error('db exploded'), hostFor({ method: 'GET', url: '/tasks/1', route: { path: '/tasks/:id' }, user: adminUser, headers: { 'user-agent': 'UA' } }));
  expect(diagnostics.record).toHaveBeenCalledWith(expect.objectContaining({ source: 'server', severity: 'error', kind: 'http_exception', statusCode: 500, route: 'GET /tasks/:id', path: '/tasks/1', name: 'Error', user: expect.objectContaining({ role: 'admin' }) }));
  expect(superCatch).toHaveBeenCalled();
});
it('records 4xx as warning', () => {
  filter.catch(new NotFoundException('Initiative x not found'), hostFor({ method: 'GET', url: '/initiatives/x' }));
  expect(diagnostics.record).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning', statusCode: 404 }));
});
it('skips /diagnostics routes', () => {
  filter.catch(new Error('x'), hostFor({ method: 'POST', url: '/diagnostics/client-errors' }));
  expect(diagnostics.record).not.toHaveBeenCalled();
  expect(superCatch).toHaveBeenCalled();
});
it('still delegates when recording throws', () => {
  diagnostics.record.mockImplementation(() => { throw new Error('boom'); });
  expect(() => filter.catch(new Error('x'), hostFor({ method: 'GET', url: '/a' }))).not.toThrow();
  expect(superCatch).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Non-HTTP contexts (`host.getType() !== 'http'`) just delegate. User fields from `request.user` (`_id`, `role`, `organizationId`, `email`, stringified). `ip` from `request.ip`. Never read `request.body` or `Authorization`.
- [ ] **Step 4: Run** → PASS; `npm run build` → succeeds.
- [ ] **Step 5: Commit** `feat(diagnostics): record every failed request via global filter`.

---

### Task 4: Process-level crash handlers

**Files:**
- Create: `src/features/diagnostics/process-handlers.ts`
- Modify: `src/main.ts` (after `NestFactory.create`: `installProcessHandlers(app.get(DiagnosticsService))`)
- Test: `src/features/diagnostics/process-handlers.spec.ts`

**Interfaces:**
- Consumes: `DiagnosticsService.record`, `recordAsync`.
- Produces: `installProcessHandlers(diagnostics: DiagnosticsService, proc: Pick<NodeJS.Process, 'on' | 'exit'> = process, timeoutMs = 2000): void`.

- [ ] **Step 1: Write failing tests** (fake `proc` that captures handlers; `jest.useFakeTimers()` for the timeout case):

```ts
it('records unhandled rejections without exiting', () => {
  handlers.unhandledRejection(new Error('async boom'));
  expect(diagnostics.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unhandled_rejection', severity: 'error', source: 'server', message: 'async boom' }));
  expect(proc.exit).not.toHaveBeenCalled();
});
it('records uncaught exceptions then exits with 1', async () => {
  await handlers.uncaughtException(new Error('fatal'));
  expect(diagnostics.recordAsync).toHaveBeenCalledWith(expect.objectContaining({ kind: 'uncaught_exception' }));
  expect(proc.exit).toHaveBeenCalledWith(1);
});
it('exits after the timeout even if recording hangs', async () => {
  diagnostics.recordAsync.mockReturnValue(new Promise(() => {}));
  const p = handlers.uncaughtException(new Error('fatal'));
  jest.advanceTimersByTime(2000);
  await p;
  expect(proc.exit).toHaveBeenCalledWith(1);
});
it('handles non-Error rejection reasons', () => {
  handlers.unhandledRejection('just a string');
  expect(diagnostics.record).toHaveBeenCalledWith(expect.objectContaining({ name: 'NonError', message: 'just a string' }));
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (log with `Logger.error` in both handlers). **Step 4: Run** → PASS; `npm run build` OK.
- [ ] **Step 5: Commit** `feat(diagnostics): capture crashes outside requests`.

---

### Task 5: Client report endpoint

**Files:**
- Create: `rate-limiter.ts`, `dto/client-error.dto.ts`, `diagnostics.controller.ts` (in `src/features/diagnostics/`)
- Modify: `diagnostics.module.ts` (register controller)
- Test: `rate-limiter.spec.ts`, `diagnostics.controller.spec.ts`

**Interfaces:**
- Consumes: `DiagnosticsService.record`, `JwtService.verify<{ sub: string }>()` and `AuthService.findOne(id)` from `AuthModule`.
- Produces:
  - `class ClientReportRateLimiter { constructor(limitPerMinute = 60); allow(ip: string, count: number, now = Date.now()): number }` — returns how many of `count` may be recorded in the current 60 s window.
  - `ClientErrorReportDto`: `kind` `@IsIn(['render','window_error','promise_rejection','network'])`; `name` string ≤ 200; `message` string ≤ 5000; `stack?` ≤ 50000; `componentStack?` ≤ 20000; `pageUrl` string ≤ 2000; `appVersion?` ≤ 100. `ClientErrorBatchDto { reports: ClientErrorReportDto[] }` with `@ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ClientErrorReportDto)`.
  - `POST /diagnostics/client-errors` → `202 { accepted: number }`. Controller class `@Controller('diagnostics')`, `@ApiTags('diagnostics')`.

- [ ] **Step 1: Write failing tests**

```ts
// rate-limiter.spec.ts
it('allows 60 per minute per ip, then resets', () => {
  const rl = new ClientReportRateLimiter(60);
  expect(rl.allow('1.1.1.1', 50, 0)).toBe(50);
  expect(rl.allow('1.1.1.1', 20, 1000)).toBe(10);
  expect(rl.allow('2.2.2.2', 20, 1000)).toBe(20);
  expect(rl.allow('1.1.1.1', 5, 61_000)).toBe(5);
});

// diagnostics.controller.spec.ts
it('records client reports as source client / severity error with user from a valid token', async () => {
  jwt.verify.mockReturnValue({ sub: uid }); auth.findOne.mockResolvedValue({ _id: uid, role: 'employee', organizationId: oid, email: 'e@x.co' });
  const res = await controller.clientErrors(batch(2), reqWith({ authorization: 'Bearer good' }));
  expect(res).toEqual({ accepted: 2 });
  expect(diagnostics.record).toHaveBeenCalledWith(expect.objectContaining({ source: 'client', severity: 'error', kind: 'render', user: expect.objectContaining({ role: 'employee' }) }));
});
it('accepts reports with an expired/invalid token or none, without user', async () => {
  jwt.verify.mockImplementation(() => { throw new Error('jwt expired'); });
  await expect(controller.clientErrors(batch(1), reqWith({ authorization: 'Bearer bad' }))).resolves.toEqual({ accepted: 1 });
  expect(diagnostics.record.mock.calls[0][0].user).toBeUndefined();
});
it('drops reports over the rate limit but still answers', async () => {
  for (let i = 0; i < 3; i++) await controller.clientErrors(batch(20), reqWith({}));
  const res = await controller.clientErrors(batch(20), reqWith({}));
  expect(res.accepted).toBe(0);
  expect(diagnostics.record).toHaveBeenCalledTimes(60);
});
it('rejects bodies over 32 KB with 413', async () => {
  await expect(controller.clientErrors(batch(1, { stack: 'x'.repeat(40_000) }), reqWith({}))).rejects.toBeInstanceOf(PayloadTooLargeException);
});
it('validation: 21 reports or unknown kind fail DTO validation', async () => {
  expect(await validate(plainToInstance(ClientErrorBatchDto, { reports: Array(21).fill(validReport) }))).not.toHaveLength(0);
  expect(await validate(plainToInstance(ClientErrorBatchDto, { reports: [{ ...validReport, kind: 'nope' }] }))).not.toHaveLength(0);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Size check: `JSON.stringify(body).length > 32 * 1024` → `PayloadTooLargeException`. The limiter is a module-level singleton provider. Token → user lookup is skipped when there's no `Bearer` header; any failure means "no user". Truncation/sanitizing happens in `record` (Task 2).
- [ ] **Step 4: Run** → PASS; `npm run build` OK.
- [ ] **Step 5: Commit** `feat(diagnostics): endpoint for browser error reports`.

---

### Task 6: Super-admin query and resolve endpoints

**Files:**
- Create: `dto/list-groups.dto.ts`, `dto/update-group.dto.ts`
- Modify: `diagnostics.service.ts`, `diagnostics.controller.ts`
- Test: extend `diagnostics.service.spec.ts`, `diagnostics.controller.spec.ts`

**Interfaces:**
- Produces (service):
  - `getSummary(now = new Date()): Promise<{ errorsLast24h: number; warningsLast24h: number; openGroups: number; usersAffectedLast24h: number }>` — counts from `ErrorEvent` since `now - 24h` (`distinct('userId')` for users) and `ErrorGroup.countDocuments({ status: 'open' })`.
  - `listGroups(q: ListGroupsQueryDto): Promise<{ items: ErrorGroupView[]; total: number; page: number; limit: number }>` where `ErrorGroupView` is the group minus `affectedUserIds/affectedOrgIds` plus `usersAffected: number`, `orgsAffected: number`.
  - `getGroup(id: string): Promise<{ group: ErrorGroupView; events: ErrorEvent[] }>` (50 newest events) — `NotFoundException` for unknown or invalid id.
  - `setStatus(id: string, status: 'open' | 'resolved', userId: string): Promise<ErrorGroupView>`.
- `ListGroupsQueryDto`: `severity?: 'error' | 'all'` (default `'error'`), `source?: 'server' | 'client'`, `status?: 'open' | 'resolved' | 'all'` (default `'open'`), `q?: string` (≤ 200, regex-escaped, case-insensitive match on `message` or `route`), `page?` ≥ 1 (default 1), `limit?` 1–100 (default 25). Sorted `lastSeen: -1`.
- Routes (all `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.SUPER_ADMIN)`): `GET /diagnostics/summary`, `GET /diagnostics/groups`, `GET /diagnostics/groups/:id`, `PATCH /diagnostics/groups/:id` with `{ status }`.

- [ ] **Step 1: Write failing tests**: service builds filter `{ severity: 'error', status: 'open' }` for defaults and `{}` for `severity=all&status=all`; `q='a.b('` is escaped; `getGroup('not-an-id')` → `NotFoundException`; `setStatus(id,'resolved',uid)` sets `resolvedAt`/`resolvedBy`, `'open'` unsets them; controller metadata — `Reflect.getMetadata(ROLES_KEY, DiagnosticsController.prototype.listGroups)` equals `[UserRole.SUPER_ADMIN]` for all four admin handlers and is undefined for `clientErrors`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npx jest` (whole suite) → PASS; `npm run build` and `npm run lint` OK.
- [ ] **Step 5: Commit** `feat(diagnostics): super-admin endpoints to browse and resolve errors`.

---

### Task 7: Frontend capture

**Files:**
- Create: `src/diagnostics/reporter.ts`, `src/diagnostics/install.ts`
- Modify: `src/main.tsx`, `src/components/ErrorBoundary.tsx`, `src/api/client.ts`

**Interfaces:**
- Consumes: `POST /diagnostics/client-errors` (Task 5), `API_BASE`, `getAuthToken` from `@/constants`.
- Produces:
  - `type ClientErrorKind = 'render' | 'window_error' | 'promise_rejection' | 'network'`
  - `reportError(error: unknown, context: { kind: ClientErrorKind; componentStack?: string }): void`
  - `flushNow(useBeacon?: boolean): void`
  - `installGlobalErrorHandlers(): void` (idempotent)

- [ ] **Step 1: Implement `reporter.ts`.** Normalize `error` → `{ name, message, stack }` (non-Error values: name `NonError`, message `String(value)` capped at 500). Dedupe key `kind|name|message` ignored for 10 000 ms. Queue capped at 50 (drop oldest). Flush every 2 000 ms, up to 20 per request, with plain `fetch(`${API_BASE}/diagnostics/client-errors`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : undefined } })` — on network failure put the batch back at the front of the queue (still capped at 50) so reports survive a short outage; on HTTP error drop it. `pageUrl` = `location.pathname + location.search` with sensitive query values redacted (same key regex as the spec). `flushNow(true)` uses `navigator.sendBeacon` with a `Blob` of type `application/json` (no auth header; the server records without user).
- [ ] **Step 2: Implement `install.ts`.** `window` `error` → `reportError(event.error ?? event.message, { kind: 'window_error' })`, ignoring messages starting with `ResizeObserver loop` and events with no `error` and no message. `unhandledrejection` → `promise_rejection`, **except** when `reason` is a plain object with a numeric `status` (an `ApiError` the server already recorded). `pagehide` → `flushNow(true)`. Call it in `main.tsx` before `createRoot`.
- [ ] **Step 3: Hook ErrorBoundary.** In `componentDidCatch`, keep the `console.error` and add `reportError(error, { kind: 'render', componentStack: info.componentStack ?? undefined })`.
- [ ] **Step 4: Hook the API client.** Add `async function fetchOrReport(url: string, init: RequestInit): Promise<Response>` in `client.ts` that awaits `fetch`, and on a thrown error calls `reportError(err, { kind: 'network' })` and rethrows the same error. Use it in `request`, `postFormData` and `getBlob`. HTTP error responses stay unreported.
- [ ] **Step 5: Verify** `npm run build` and `npm run lint` → no new errors (compare lint error count with `git stash` baseline if the repo already has lint errors).
- [ ] **Step 6: Commit** `feat(diagnostics): report browser crashes and network failures`.

---

### Task 8: Super-admin Diagnostics page

**Files:**
- Create: `src/types/diagnostics.ts`, `src/api/diagnostics.ts`, `src/roles/super-admin/pages/Diagnostics.tsx`, `src/roles/super-admin/pages/DiagnosticsDetailDrawer.tsx`
- Modify: `src/types/index.ts`, `src/api/index.ts` (follow existing export style), `src/constants/routes.ts` (`SUPER_ADMIN_DIAGNOSTICS: "/super-admin/diagnostics"`), `src/routers/routes.tsx` (route with `ProtectedRoute allowedRoles={["super_admin"]}`), `src/roles/super-admin/layout/SuperAdminLayout.tsx` (nav item `{ icon: IconBug, label: "Diagnostics", path: ROUTES.SUPER_ADMIN_DIAGNOSTICS }` after Organizations)

**Interfaces:**
- Consumes: Task 6 routes and shapes.
- Produces: `diagnosticsApi.getSummary(): Promise<DiagnosticsSummary>`, `listGroups(params: ListGroupsParams): Promise<ErrorGroupPage>`, `getGroup(id: string): Promise<ErrorGroupDetail>`, `setStatus(id: string, status: 'open' | 'resolved'): Promise<ErrorGroup>` — all via the existing `api` helper. Types mirror Task 6 (`ErrorGroup` includes `usersAffected`, `orgsAffected`; `ErrorEvent` per spec §2, dates as ISO strings).

- [ ] **Step 1: Types + API wrapper.** Build query strings with `URLSearchParams`, omitting empty values.
- [ ] **Step 2: Page.** Inside the super-admin layout used by the other super-admin pages. Four summary tiles (Errors 24h, Warnings 24h, Open issues, Users affected 24h). Filters: `SegmentedControl` Source (All/Backend/Frontend), `SegmentedControl` Severity (Crashes only/Include 4xx), `SegmentedControl` Status (Open/Resolved/All), `TextInput` search (debounced 300 ms) — all mirrored in the URL via `useSearchParams`. Table columns: Message (+ name, dimmed), Source badge, Severity badge (red error / yellow warning), Route or page, Count, Users, Last seen (dayjs relative, already a dependency), Status. `Pagination` at 25 per page. Loading `Loader`, empty state "No errors match these filters", load error shown in an `Alert`.
- [ ] **Step 3: Detail drawer.** Opens on row click; fetches `getGroup`. Header: message, name, status badge, Resolve/Reopen button (calls `setStatus`, then refreshes drawer, table and tiles). Facts: route/page, first and last seen, count, roles, users and orgs affected. Occurrences list (`Accordion`): time, user email + role, organization id, path or page URL, browser (user agent), status code; expanded shows `stack` and `componentStack` in a scrollable `Code block`.
- [ ] **Step 4: Verify** `npm run build` and `npm run lint` → no new errors.
- [ ] **Step 5: Commit** `feat(diagnostics): super-admin diagnostics page`.

---

### Task 9: End-to-end verification (local)

No code changes unless a defect is found (fix it in the owning task's files, with a test where the backend is involved).

- [ ] **Step 1: Start MongoDB:** `docker run -d --name navi-diag-mongo -p 27017:27017 mongo:7`.
- [ ] **Step 2: Start backend** with `MONGODB_URI=mongodb://127.0.0.1:27017/navi`, `JWT_SECRET=local-test-secret` and whatever `seedSuperAdmins()` in `auth.service.ts` reads to create a super admin (use local test values only, recorded in the backend `.env.example` if a new variable is needed). Run `npm rebuild bcrypt` first, since dependencies were installed with `--ignore-scripts`. Start frontend with `VITE_API_URL` pointing at the local backend.
- [ ] **Step 3: Trigger and confirm each source** on `/super-admin/diagnostics` (browser pane):
  - Backend 4xx: wrong password on login → appears only with "Include 4xx", severity warning, route `POST /auth/login` (or the actual login route).
  - Backend 500: call an endpoint with a malformed id (e.g. `GET /initiatives/not-an-id` with a valid token); if it returns 4xx, instead confirm 5xx handling via Task 3 tests and note it.
  - Frontend window error: in the browser, `setTimeout(() => { throw new Error('diag window test') })` → frontend, window_error, with user.
  - Unhandled rejection: `Promise.reject(new Error('diag promise test'))` → promise_rejection.
  - Render crash: temporarily make one page component throw (do not commit), load it → render, with component stack. Revert.
  - Network failure: stop the backend, click something that calls the API, start the backend → network error appears within a few seconds.
- [ ] **Step 4: Grouping and regression:** trigger the same error twice → one row, count 2. Resolve it, trigger again → back to Open.
- [ ] **Step 5: Access control:** log in as an admin/employee → `/super-admin/diagnostics` redirects away, and `GET /diagnostics/groups` with their token returns 403.
- [ ] **Step 6: Clean up:** `docker rm -f navi-diag-mongo`; confirm `git status` is clean apart from intended commits in both repos.
