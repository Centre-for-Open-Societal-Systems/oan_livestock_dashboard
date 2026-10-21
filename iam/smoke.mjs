// Runs from the application image as the owning registry's Helm smoke hook.
// Uses the same service identity/settings as the BFF; never requires a staff password.
import { fileURLToPath } from "node:url"
import { discoverSignIn } from "./discover.mjs"

export async function verifyCharts(env = process.env) {
  const required = name => {
    const value = env[name]?.trim()
    if (!value) throw new Error(`${name} is required for chart verification`)
    return value
  }
  const base = required("DASHBOARD_API_URL").replace(/\/+$/, "")
  const charts = required("DASHBOARD_SMOKE_CHARTS").split(",").map(value => value.trim()).filter(Boolean)
  const clientId = required("DASHBOARD_CLIENT_ID")
  const secret = required("DASHBOARD_CLIENT_SECRET")
  let tokenUrl = env.OIDC_TOKEN_URL?.trim()
  if (!tokenUrl) {
    const found = await discoverSignIn({ iamUrl: required("IAM_URL"), publicUrl: required("PUBLIC_URL"),
      cookieDomain: env.COOKIE_DOMAIN, providerId: env.LOGIN_PROVIDER_ID })
    tokenUrl = `${found.realmUrl}/protocol/openid-connect/token`
  }
  const response = await fetch(tokenUrl, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Service token request failed: HTTP ${response.status}`)
  const { access_token: token } = await response.json()
  if (typeof token !== "string" || !token) throw new Error("Service token response has no access token")
  const request = (chart, bearer) => fetch(`${base}/api/v1/charts/${encodeURIComponent(chart)}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, signal: AbortSignal.timeout(20000),
  })
  for (const [label, bearer] of [["anonymous", undefined], ["invalid-token", "invalid-smoke-token"]]) {
    const rejected = await request(charts[0], bearer)
    if (rejected.status !== 401) throw new Error(`${label} chart request must return 401; got ${rejected.status}`)
  }
  for (const chart of charts) {
    const result = await request(chart, token)
    if (!result.ok) throw new Error(`${chart}: authenticated request failed, HTTP ${result.status}`)
    const rows = await result.json()
    if (!Array.isArray(rows) && !Array.isArray(rows?.data)) throw new Error(`${chart}: expected aggregate rows`)
    console.log(`${chart}: authenticated rows verified`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyCharts().catch(error => { console.error(error.message); process.exitCode = 1 })
}
