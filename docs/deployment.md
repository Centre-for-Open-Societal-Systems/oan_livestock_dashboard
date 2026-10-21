# Deployment ownership

This repository contains the livestock dashboard application and its Dockerfile.
It has no deployment pipeline or Helm chart. The owning registry repository
builds and publishes this image, runs verification, and deploys it using
`helm/livestock-registry-dashboard`. That chart retains the existing component
release/resource names; no release adoption or second release is performed.

Configure image references, IAM URLs, cookie domain, ingress, Secret references,
client identity and role bootstrap exclusively in the registry Helm values.
No staff user receives access by default. Role assignments are IAM policy;
approved bootstrap grants, if needed, are registry environment configuration.

The registry chart runs `iam/keycloak-setup.mjs` and `iam/register.mjs`, followed
by `iam/smoke.mjs` using this image. Smoke checks reject anonymous API access
and require real chart responses using the BFF service-account credentials.
`/api/health` remains a lightweight public liveness endpoint.

Never put credentials in source or bake environment URLs into the image.
Use `.env.example` only for isolated local development. The production browser
gate requires an IAM session and the dashboard client role. The API requires
its own service-account token; browser tokens are never forwarded to it.

Deploy only after the registry pipeline's ownership, backup, hook-rehearsal and
environment checks pass. The registry's staging deployment guards remain in
force. Merging this repository does not deploy the dashboard.
