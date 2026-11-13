# Dashboard UI checks

`bash ci/run-isolated.sh` runs locked npm installation, lint, TypeScript checks,
the existing IAM grant tests and a production Next.js build inside Node 24,
then builds the unchanged root Dockerfile. No UI/API server is started and no
live IAM, Master Data or registry endpoint is called. Test containers use unique
owner labels, a 2 GiB container limit and a 1536 MiB Node heap limit; cleanup removes only the container created by this invocation.
JUnit reports are retained under reports/ and ignored by Git/build contexts.

GitHub uses immutable action SHAs and equivalent checks; the thin Jenkinsfile
uses the existing vpn-agent2 Docker-capable agent pattern for validation only.
No live Jenkins job, deployment, credentials or image publication is configured.
The owning registry continues building from the root Dockerfile.

This branch carries only the reviewed single Master Data geography commit on
current COSS develop plus CI/documentation. It does not merge registry ancestry.
See docs/ci.md for deployment configuration and remaining live acceptance.
