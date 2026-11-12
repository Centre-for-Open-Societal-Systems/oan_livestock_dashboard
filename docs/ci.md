# CI and deployment configuration contract

Local/CI validation is `bash ci/run-isolated.sh`; see [ci/README.md](../ci/README.md).
Existing IAM grant tests must pass along with lint, TypeScript, Next production
build and the root Docker build. JUnit results are published even on failure.
These checks do not establish live IAM, chart API or MDS acceptance.

The owning registry's managed chart values MUST supply all of:

| Setting | Required deployment behavior |
| --- | --- |
| AUTH_ENABLED | true: every viewer requires an IAM session and Dashboard Viewer role |
| DASHBOARD_API_AUTH | client-credentials: BFF chart calls use its service-account token |
| DASHBOARD_API_URL | Internal URL of this registry's dashboard API |
| IAM_URL | This registry's configured staff IAM endpoint |
| DASHBOARD_CLIENT_ID | Existing registry-owned dashboard client with the API charts:read role |
| DASHBOARD_CLIENT_SECRET | Mounted/injected managed Secret, never image or committed value |
| OIDC_TOKEN_URL | Optional only when IAM login-provider discovery supplies the trusted endpoint |
| MASTER_DATA_URL | Supported Master Data public catalogue base URL |

The API itself must require its trusted issuer, audience and charts:read role.
Do not set the UI's legacy local mode `none`, disable viewer authentication, or
weaken the API to make deployment pass. Authentication/session/service-token
source is preserved; deployment configuration must select the authenticated
path explicitly. Registry/Helm changes are owned separately by the lead.

Geography uses read-only public HTTP `/public/geography/units` pagination and
`/public/geography/levels/<level>/boundaries.geojson`, published by Master Data.
No direct database access or framework patch is introduced. Only units and
boundaries the catalogue publishes as public may be served. The MDS service must
include that supported public catalogue before enabling these map/filter paths.

Before promotion, verify anonymous/unprivileged denial, Viewer session access,
BFF client-credentials API access, region/zone/woreda filter cascade, boundary
availability and unknown/outage handling against the deployed configured MDS.
The curated feature's removal of bundled geography makes that live catalogue a
required dependency; a successful local build alone does not prove it exists.
