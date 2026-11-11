# Error Diagnostics — Design

Date: 2026-11-11
Repos: `Navi-backend` (NestJS + MongoDB), `Navi-frontend` (React + Vite + Mantine)
Branch: `feature/error-diagnostics` in both repos (based on `security/remove-malware`)

## 1. Goal

Capture every error that happens in Navi — for every role (super admin, admin, manager,
employee) and on both the server and in the browser — and let the platform team review them
inside the app, grouped and filterable, so bugs are found from data rather than user reports.

### Decisions already made

| Question | Decision |
|---|---|
| Who sees the diagnostics page | **Super admin only**, across all organizations |
| Which errors | **Everything**: crashes (severity `error`) and 4xx rejections (severity `warning`). The page shows `error` by default with a toggle to include `warning` |
| Alerts | **None** in this version (page only). Email alerts via the existing Resend setup can come later |
| Hosting | **Built in**, stored in Navi's own MongoDB. No third-party error service |

### Out of scope

Alerts/notifications, per-organization admin views, performance monitoring, session replay,
source-map de-minification of frontend stacks, and storing request bodies.

## 2. Data model (backend, MongoDB)

### `ErrorGroup` collection (one document per distinct problem)

| Field | Type | Notes |
|---|---|---|
| `fingerprint` | string, unique index | See §4 |
| `source` | `'server' \| 'client'` | |
| `severity` | `'error' \| 'warning'` | |
| `kind` | string | `http_exception`, `unhandled_rejection`, `uncaught_exception`, `render`, `window_error`, `promise_rejection`, `network` |
| `name` | string | Error class name, e.g. `TypeError`, `NotFoundException` |
| `message` | string | Normalized message (max 500 chars) |
| `statusCode` | number? | Server HTTP errors only |
| `route` | string? | Server: `METHOD /route/:pattern`; client: page path pattern |
| `count` | number | Total occurrences |
| `affectedUserIds` | ObjectId[] | Distinct, capped at 500 entries |
| `affectedOrgIds` | ObjectId[] | Distinct, capped at 500 entries |
| `roles` | string[] | Distinct roles that hit it |
| `firstSeen` / `lastSeen` | Date | `lastSeen` indexed |
| `status` | `'open' \| 'resolved'` | Indexed |
| `resolvedAt` / `resolvedBy` | Date? / ObjectId? | |

### `ErrorEvent` collection (one document per occurrence)

| Field | Type | Notes |
|---|---|---|
| `groupId` | ObjectId, indexed | → `ErrorGroup` |
| `createdAt` | Date | **TTL index: 30 days** |
| `message`, `name` | string | Raw (sanitized, truncated) message |
| `stack` | string? | Truncated to 8 KB |
| `componentStack` | string? | React render errors only, truncated to 4 KB |
| `statusCode`, `method`, `path` | ? | Server: actual path with sensitive query values blanked |
| `pageUrl` | string? | Client: page where it happened (sanitized) |
| `userId`, `userRole`, `organizationId`, `userEmail` | ? | From the authenticated user when known |
| `userAgent`, `ip` | string? | |
| `appVersion` | string? | Optional build identifier |

Occurrences expire after 30 days. Groups are kept (they're small) so history and counts survive.

## 3. Backend capture

New module: `src/features/diagnostics/`
(`diagnostics.module.ts`, `diagnostics.service.ts`, `diagnostics.controller.ts`,
`error-group.entity.ts`, `error-event.entity.ts`, `all-exceptions.filter.ts`, `sanitize.ts`,
`fingerprint.ts`, `dto/`). Registered in `AppModule`.

1. **Global exception filter** (`APP_FILTER`), extending Nest's `BaseExceptionFilter`:
   records the error, then calls `super.catch()` so **the HTTP response is exactly what it is
   today**. Severity: status ≥ 500 or a non-`HttpException` → `error`; 4xx → `warning`.
   User context comes from `request.user` (set by `JwtAuthGuard` when auth succeeded).
   The route pattern comes from `request.route?.path` so `/initiatives/123` and
   `/initiatives/456` group together.
2. **Process handlers** in `main.ts`: `unhandledRejection` and `uncaughtException` are recorded
   (`kind` accordingly, severity `error`). `uncaughtException` still logs and exits after the
   record attempt (bounded to 2 s) so behaviour on fatal crashes is unchanged.
3. **Fire-and-forget**: `DiagnosticsService.record()` never throws and is not awaited by the
   request path. If MongoDB is down, the failure is logged to the console and swallowed.
   Recording an error that came from the diagnostics module itself is skipped (no loops).

## 4. Grouping (fingerprint)

`sha1(source | kind | name | normalizedMessage | route-or-topFrame)` where
`normalizedMessage` replaces ObjectIds, UUIDs, emails, numbers and quoted values with
placeholders (e.g. `Initiative <id> not found`), and `topFrame` is the first stack frame
outside `node_modules` with line/column numbers removed. Upsert on fingerprint: `$inc count`,
`$set lastSeen`, `$addToSet` users/orgs/roles (capped). If the group is `resolved` and a new
occurrence arrives, it flips back to `open` (regression).

## 5. Privacy & safety

- Never store request bodies, passwords, tokens or the `Authorization` header.
- Query-string values whose keys match `token|password|secret|key|code|otp|auth` are replaced
  with `[redacted]`, both for server paths and client page URLs.
- Messages are truncated to 500 chars, stacks to 8 KB; emails inside messages are masked.
- Client reports are validated with class-validator DTOs; body size capped at 32 KB.

## 6. API

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /diagnostics/client-errors` | Optional (JWT decoded if present; works logged out) | Receive up to 20 frontend reports per call. In-memory rate limit: 60 reports/min per IP; excess dropped with `202` |
| `GET /diagnostics/summary` | Super admin | `{ errorsLast24h, warningsLast24h, openGroups, usersAffectedLast24h }` |
| `GET /diagnostics/groups` | Super admin | Query: `severity` (default `error`; `all` includes warnings), `source`, `status` (default `open`), `q` (search message/route), `page`, `limit` (≤100). Sorted by `lastSeen` desc |
| `GET /diagnostics/groups/:id` | Super admin | Group + 50 most recent events |
| `PATCH /diagnostics/groups/:id` | Super admin | `{ status: 'open' \| 'resolved' }` |

Guarded with the existing `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.SUPER_ADMIN)`.
Documented in Swagger like the other modules.

## 7. Frontend capture

New folder `src/diagnostics/`:

- `reporter.ts` — `reportError(error, context)`: builds a payload (name, message, stack,
  kind, page URL sanitized, user agent), dedupes identical reports within 10 s, queues them and
  flushes every 2 s (max 20 per batch) with plain `fetch` to `/diagnostics/client-errors`
  (not via `api` client, to avoid loops; failures are ignored). Flushes with
  `navigator.sendBeacon` on `pagehide`. Attaches the JWT if present so the server can link
  the user.
- `install.ts` — `installGlobalErrorHandlers()` called once from `main.tsx`: `window` `error`
  and `unhandledrejection` listeners.
- `ErrorBoundary.componentDidCatch` → `reportError(error, { kind: 'render', componentStack })`.
- `src/api/client.ts` — when `fetch` itself throws (API unreachable / CORS / offline),
  report `kind: 'network'` and rethrow as today. HTTP error responses are **not** reported from
  the browser because the server filter already records them (no duplicates).

## 8. Super-admin page

Route `/super-admin/diagnostics` (`ROUTES.SUPER_ADMIN_DIAGNOSTICS`), protected with
`allowedRoles={["super_admin"]}`, new sidebar item "Diagnostics" (`IconBug`) in
`SuperAdminLayout`. Page `src/roles/super-admin/pages/Diagnostics.tsx`, API wrapper
`src/api/diagnostics.ts`, types in `src/types/`.

- **Summary tiles**: errors (24h), warnings (24h), open issues, users affected (24h).
- **Filters**: Source (All / Backend / Frontend), Severity (Crashes only / Include 4xx),
  Status (Open / Resolved / All), search box. Filters are kept in the URL query.
- **Table** (paginated): message (+ name), source badge, severity badge, route/page,
  count, users, last seen (relative), status.
- **Detail drawer** on row click: full message, route, first/last seen, roles, affected
  user/org counts, Resolve/Reopen button, and a list of recent occurrences — each expandable
  to show stack (monospace, scrollable), component stack, user email + role, organization,
  page URL / request path, browser, time.
- Empty, loading and error states follow the existing Mantine patterns in the app.

## 9. Testing & verification

- **Unit (Jest, backend)**: fingerprint normalization (ids/numbers collapse into one group),
  sanitizer (redacts sensitive query keys, masks emails, truncates), exception filter
  (severity mapping, response unchanged, recording failure doesn't affect response),
  service upsert + regression reopen, rate limiter.
- **Build checks**: `npm run build` and `npm run lint` in both repos.
- **End to end (manual, local)**: MongoDB in Docker, backend + frontend running locally.
  Trigger: a backend 500, a 4xx (bad login), a frontend render crash, an unhandled promise
  rejection, and a network failure (backend stopped). Confirm each appears on the
  Diagnostics page with the right source, severity, user and grouping; resolve one and
  re-trigger it to confirm it reopens; confirm a non-super-admin gets 403 from the API and
  can't reach the page.
