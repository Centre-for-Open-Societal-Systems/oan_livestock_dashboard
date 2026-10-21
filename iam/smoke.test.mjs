import assert from "node:assert/strict"
import { createServer } from "node:http"
import { test } from "node:test"
import { verifyCharts } from "./smoke.mjs"

test("chart verification rejects broken service auth even when health is open", async () => {
  let broken = false
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json")
    if (request.url === "/token") { response.end('{"access_token":"fixture-token"}'); return }
    if (request.url === "/health") { response.end('{"status":"ok"}'); return }
    if (request.headers.authorization !== "Bearer fixture-token" || broken) {
      response.writeHead(401).end('{"detail":"unauthorized"}'); return
    }
    response.end('[{"count":1}]')
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const env = { DASHBOARD_API_URL: base, DASHBOARD_SMOKE_CHARTS: "chartA,chartB", DASHBOARD_CLIENT_ID: "fixture",
    DASHBOARD_CLIENT_SECRET: "fixture-only", OIDC_TOKEN_URL: `${base}/token` }
  try {
    await verifyCharts(env)
    broken = true
    assert.equal((await fetch(`${base}/health`)).status, 200)
    await assert.rejects(verifyCharts(env), /authenticated request failed, HTTP 401/)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
