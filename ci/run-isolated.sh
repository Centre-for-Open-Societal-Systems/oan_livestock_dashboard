#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run_id="dashboard-ui-ci-$(date +%s)-$$-${RANDOM}"
container="$run_id-tests"
mkdir -p reports
cleanup() {
  local status=$?
  trap - EXIT
  docker cp "$container:/src/reports/." reports/ >/dev/null 2>&1 || true
  if [ "$(docker inspect -f '{{ index .Config.Labels "dashboard-ci-owner" }}' "$container" 2>/dev/null || true)" = "$run_id" ]; then
    docker rm -fv "$container" >/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT
docker build -f ci/test.Dockerfile -t "dashboard-ui-ci:$run_id" .
docker run --memory=2g --cpus=2 --name "$container" --label "dashboard-ci-owner=$run_id" "dashboard-ui-ci:$run_id"
docker build -f Dockerfile -t "dashboard-ui-image:$run_id" .
