#!/usr/bin/env bash
set -euo pipefail
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
mkdir -p reports
npm run lint
npm run typecheck
# Same meaningful IAM grant tests as npm test, with console and JUnit output.
node --test --test-isolation=none \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=junit --test-reporter-destination=reports/iam.xml iam/*.test.mjs
npm run build
