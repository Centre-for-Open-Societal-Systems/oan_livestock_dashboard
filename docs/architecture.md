# Architecture

The Livestock Registry dashboard is a self-contained service: a Next.js
application that serves the page and its own small API (a backend-for-frontend).
It shows aggregate figures only and never handles individual records.

```
 browser ── dashboard.<registry domain> ──► this service
                                             ├─ proxy.ts      session + role check (every request)
                                             ├─ /api/*        Elysia BFF: charts, filters, user
                                             └─ ChartSource   ─► livestock-registry-dashboard-api ─► reporting views
                                                  │                  (bearer token, optional)
 registry IAM ◄── session check (get_user_profile)┘
 Keycloak     ◄── client-credentials token for the dashboard-api (optional)
```

## Access

Login belongs to the registry's IAM (the staff portal API). After login IAM
sets its session cookies on the registry's cookie domain; the dashboard is
served under that domain, so the browser sends those cookies with every
request. `proxy.ts` runs before every page and API route and:

1. asks IAM whether the session is valid (`GET /auth/get_user_profile`), caching
   the answer per session for `SESSION_CACHE_SECONDS`;
2. requires the client role `DASHBOARD_ROLE` (default `Dashboard Viewer`) on
   the Keycloak client `DASHBOARD_CLIENT_ID` (default
   `livestock-registry-dashboard`).

No session sends the browser to IAM login (`/api/auth/login`), which returns it
to the page it asked for. A session without the role gets a 403 page. API calls
get 401 or 403 instead of a redirect.

The same client role drives the staff-portal tile: IAM shows a tile enabled
only to users whose token has a role on the client named like the tile's
application mnemonic. Granting `Dashboard Viewer` therefore both shows the tile
and opens the dashboard; revoking it does both too.

### Registration with IAM

`iam/payload.json` is the dashboard's catalog for IAM: the tile (mnemonic, URL,
icon) plus one permission, `dashboard:view`, and one role, `Dashboard Viewer`.
`node iam/register.mjs` (shipped in the image) upserts it. It authenticates
with the dashboard client's service account and is safe to run on every deploy.

Environment setup, done once per realm before registration:

- a confidential Keycloak client `livestock-registry-dashboard` with a service
  account (for registration);
- a client role `Dashboard Viewer` on it, assigned to the users who may see the
  dashboard.

## Data

Chart rows come through `ChartSource` (`server/data/chart-source.ts`):

| Source | Status | Reads |
| --- | --- | --- |
| `http` (`http-chart-source.ts`) | in use | the registry's dashboard-api, `GET /api/v1/charts/<id>` |

`server/data/catalog.ts` is the contract: the chart IDs, the filters each
accepts, and which charts feed the filter bar. Row column names must stay
identical whatever produces them.

Responses are cached in process for `DASHBOARD_CACHE_TTL_SECONDS` (default
15 min) with stale-while-revalidate: a refresh runs in the background and the
last good rows are served if it fails. The cache is warmed at startup
(`instrumentation.ts`).

### Authentication towards the dashboard-api

The dashboard-api is called by this server only, never by a browser, and as
this service rather than as a user: rows are shared across users and refreshed
in the background. Two modes (`DASHBOARD_API_AUTH`):

| Mode | Use when | What is sent |
| --- | --- | --- |
| `none` (default) | The dashboard-api is reachable only on the private network both run in (same cluster) | Nothing; the network keeps other callers out |
| `client-credentials` | Always recommended; required when the dashboard runs in another cluster or on another server | `Authorization: Bearer <token>` on every chart request |

With `client-credentials`, `server/auth/service-token.ts` gets a token from
Keycloak with the client-credentials grant for this dashboard's own client
(`DASHBOARD_CLIENT_ID` / `DASHBOARD_CLIENT_SECRET`, the client whose service
account also registers with IAM). The token is reused until 30 s before it
expires, concurrent refreshes share one request, and a `401` from the
dashboard-api drops it and retries once.

The dashboard-api accepts the token when it carries its client role (default
`charts:read` on the client `livestock-registry-dashboard-api`) and was issued by
an issuer it trusts. The IAM setup job creates that client and role and grants
the role to this dashboard's service account (`iam/keycloak-setup.mjs`), so
Keycloak adds both the audience and the role to the token by itself.

The token endpoint is `OIDC_TOKEN_URL`, or that of the realm IAM signs staff in
with, discovered once like the login provider. The dashboard-api, given the
same IAM (`AUTH_IAM_URL`), trusts every realm IAM's login providers sign staff
in with, so neither side configures a realm URL. Keycloak writes the URL a
token was requested at into its `iss`, so with an explicit `OIDC_TOKEN_URL` the
dashboard-api must trust that realm URL, host and port included.

`/health` of the dashboard-api needs no token, so `/api/health` here works the
same in both modes.

The UI/BFF holds no registry database credentials. Database access stays in the dashboard API.

## API

All routes except `/api/health` and `/api/auth/*` require a session with the
dashboard role.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | liveness, and whether the chart source answers |
| `GET /api/me` | signed-in user's name and header links |
| `GET /api/charts?charts=a,b&<filters>` | rows for several charts |
| `GET /api/filter-options` | regions (from the shared location catalog) and record statuses |
| `GET /api/locations?regionId=` / `zoneId=` / `woredaId=` | child units for the filter cascade (location catalog) |
| `GET /api/maps/<level>` | compressed boundaries for the map |
| `GET /api/auth/login?returnTo=` / `GET /api/auth/logout` | start login at IAM / sign out (IAM, or locally when the session has expired) |

Filters: `region`, `zone`, `woreda`, `kebele` (catalog codes: P-codes such as `ET04`, `ET0401`) and `recordState`.

Locations and map boundaries both come from Master Data's public catalogue
(`MASTER_DATA_URL`, `server/master-data.ts`): the OAN geography every registry
records, so filter codes, map features and chart rows share one id space. The
filters list every published unit; the map draws the units Master Data has a
polygon for, and coverage counts those. Both are held per process and fetched
again after `MASTER_DATA_CACHE_SECONDS`; a failed refresh keeps the last copy.

The dashboard serves one host, `PUBLIC_URL`: IAM's session cookies reach only
hosts under its cookie domain, so `proxy.ts` redirects any other host there
first (except `/api/health`, which probes call on the pod address).

## Exports

Image, PDF and CSV exports are built in the browser from what is on screen. CSV
contains the aggregate panels, never per-person records.
