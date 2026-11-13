# Livestock Registry Dashboard

Aggregate dashboard for the Livestock Registry: livestock keepers by region
(map with drill-down to kebele), species mix, herd health and registrations over
time. A standalone service, reached from the registry's staff portal as a tile
and open only to users with the **Dashboard Viewer** role.

See [docs/architecture.md](docs/architecture.md) for how access, data and IAM
registration work.
[docs/deployment.md](docs/deployment.md) covers the Helm chart, CI/CD and the
first deployment to an environment.

## Run

```bash
cp .env.example .env.local    # point it at a dashboard-api and an IAM
npm ci
npm run dev                   # http://localhost:3000
```

The dashboard needs:

- the registry's **dashboard-api** (`DASHBOARD_API_URL`), which serves the chart
  rows from the registry's reporting views;
- **Master Data** (`MASTER_DATA_URL`), whose public catalogue holds the OAN
  geography: the locations in the filters and the map boundaries;
- the registry's **IAM** (`IAM_URL`) for login and roles. For UI work without
  one, set `AUTH_ENABLED=false` (never in a deployment).

Container image:

```bash
docker build -t livestock-registry-dashboard .
docker run --env-file .env.local -p 3000:3000 livestock-registry-dashboard
```

Register the tile and role with IAM (idempotent), from the same image:

```bash
docker run --rm --env-file .env.local \
  -e IAM_REGISTER_URL=... -e TOKEN_URL=... -e DASHBOARD_CLIENT_SECRET=... \
  -e APP_DESCRIPTION="Livestock Dashboard" \
  livestock-registry-dashboard node iam/register.mjs
```

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Layout

| Path | What |
| --- | --- |
| `app/` | pages, the `/api` mount, map and auth routes |
| `components/livestock-dashboard.tsx` | the registry view |
| `components/dashboard-shell.tsx` | header and filter bar |
| `components/registry/`, `components/ethiopia-map.tsx` | panel kit, map, export |
| `server/data/` | chart catalog, `ChartSource` and the cache |
| `server/auth/session.ts`, `proxy.ts` | session and role check |
| `iam/` | IAM catalog and registration script |
| `server/master-data.ts`, `server/geo-catalog.ts`, `server/boundaries.ts` | geography from Master Data: filter catalog and map boundaries |
| Owning registry repository | image verification/build, Helm, environment configuration and deployment |

## Continuous validation

See [ci/README.md](ci/README.md) for Node 24 lint/type checks, IAM tests,
production builds and validation-only Jenkins/GitHub checks.
[docs/ci.md](docs/ci.md) specifies required client-credentials and Master Data
configuration. Publishing and deployment remain with the owning registry.
