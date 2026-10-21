// Keycloak side of the dashboard, through the Keycloak admin REST API.
// Idempotent; run on every deploy before iam/register.mjs:
//   - the confidential client DASHBOARD_CLIENT_ID (= the IAM application
//     mnemonic) with a service account and no login flows of its own (users
//     sign in through IAM), its secret set to DASHBOARD_CLIENT_SECRET;
//   - its client role DASHBOARD_ROLE. IAM enables the staff-portal tile, and
//     the dashboard admits a user, only when the token carries it;
//   - that role for each existing user in GRANT_USERS (space separated);
//   - with DASHBOARD_API_CLIENT_ID set: the dashboard-api's client (no flows,
//     it only holds a role), its role DASHBOARD_API_ROLE, and that role for
//     this client's service account. The dashboard's client-credentials
//     tokens then name the dashboard-api in `aud` and carry the role, which
//     is what the dashboard-api checks (its AUTH_AUDIENCE and AUTH_ROLE).
//
// The Keycloak host and realm are discovered from the registry's IAM (see
// discover.mjs); KEYCLOAK_URL / KEYCLOAK_REALM override them.
//
// Environment:
//   IAM_URL, PUBLIC_URL, COOKIE_DOMAIN, LOGIN_PROVIDER_ID (optional)
//   KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD   master-realm admin
//   DASHBOARD_CLIENT_ID, DASHBOARD_CLIENT_SECRET, DASHBOARD_ROLE, GRANT_USERS
//   DASHBOARD_API_CLIENT_ID, DASHBOARD_API_ROLE (default charts:read)   optional
//   MAX_ATTEMPTS  retries per step, 5 s apart (default 40)
import { discoverSignIn } from "./discover.mjs"

const env = (name, fallback) => {
  const value = process.env[name]?.trim()
  if (value) return value
  if (fallback !== undefined) return fallback
  throw new Error(`${name} is not set`)
}
const clientId = env("DASHBOARD_CLIENT_ID")
const clientSecret = env("DASHBOARD_CLIENT_SECRET")
const role = env("DASHBOARD_ROLE", "Dashboard Viewer")
const grantUsers = env("GRANT_USERS", "").split(/\s+/).filter(Boolean)
const maxAttempts = Number(process.env.MAX_ATTEMPTS) || 40
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function retry(step, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= maxAttempts) throw new Error(`${step} failed: ${error.message}`)
      console.log(`  ${step} not ready (attempt ${attempt}): ${error.message}`)
      await sleep(5000)
    }
  }
}

let baseUrl = process.env.KEYCLOAK_URL?.trim().replace(/\/+$/, "")
let realm = process.env.KEYCLOAK_REALM?.trim()
if (!baseUrl || !realm) {
  const found = await retry("Keycloak discovery", () =>
    discoverSignIn({
      iamUrl: env("IAM_URL"),
      providerId: process.env.LOGIN_PROVIDER_ID?.trim(),
      cookieDomain: process.env.COOKIE_DOMAIN?.trim(),
      publicUrl: env("PUBLIC_URL"),
    }),
  )
  baseUrl ||= found.baseUrl
  realm ||= found.realm
  console.log(`Login provider ${found.providerId}: Keycloak ${found.baseUrl}, realm ${found.realm}`)
}

const token = await retry("admin login", async () => {
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: env("KEYCLOAK_ADMIN", "admin"),
      password: env("KEYCLOAK_ADMIN_PASSWORD"),
    }),
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new Error(`HTTP ${res.status} ${data.error_description || data.error || ""}`.trim())
  return data.access_token
})

const admin = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}`
async function api(method, path, body) {
  const res = await fetch(`${admin}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  if (res.status === 404 && method === "GET") return null
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 || res.status === 201 ? null : res.json()
}

const findClient = async id => (await api("GET", `/clients?clientId=${encodeURIComponent(id)}`))?.[0]

/** The client role `name` on the client with internal id `clientUuid`, created when missing. */
async function ensureRole(clientUuid, name, description) {
  const path = `/clients/${clientUuid}/roles/${encodeURIComponent(name)}`
  const existing = await api("GET", path)
  if (existing) return existing
  await api("POST", `/clients/${clientUuid}/roles`, { name, description })
  console.log(`Created role '${name}'`)
  return api("GET", path)
}

let client = await findClient(clientId)
if (!client) {
  await api("POST", "/clients", {
    clientId,
    enabled: true,
    publicClient: false,
    secret: clientSecret,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    description: "Registry dashboard: access role + IAM registration",
  })
  client = await findClient(clientId)
  console.log(`Created client ${clientId}`)
} else {
  // Keep the secret in step with the release's Secret.
  await api("PUT", `/clients/${client.id}`, { ...client, secret: clientSecret, serviceAccountsEnabled: true })
}

const roleRep = await ensureRole(client.id, role, "Can open the registry dashboard (aggregate figures only)")

for (const username of grantUsers) {
  const user = (await api("GET", `/users?username=${encodeURIComponent(username)}&exact=true`))?.[0]
  if (!user) {
    console.log(`User ${username} not found in realm ${realm}; skipped`)
    continue
  }
  await api("POST", `/users/${user.id}/role-mappings/clients/${client.id}`, [roleRep])
  console.log(`Granted '${role}' to ${username}`)
}

const apiClientId = process.env.DASHBOARD_API_CLIENT_ID?.trim()
if (apiClientId) {
  const apiRole = env("DASHBOARD_API_ROLE", "charts:read")
  let apiClient = await findClient(apiClientId)
  if (!apiClient) {
    await api("POST", "/clients", {
      clientId: apiClientId,
      enabled: true,
      publicClient: false,
      serviceAccountsEnabled: false,
      standardFlowEnabled: false,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      description: "Registry dashboard-api: holds the role its callers need",
    })
    apiClient = await findClient(apiClientId)
    console.log(`Created client ${apiClientId}`)
  }
  const apiRoleRep = await ensureRole(apiClient.id, apiRole, "May read the registry dashboard-api (aggregate chart rows)")
  const serviceAccount = await api("GET", `/clients/${client.id}/service-account-user`)
  await api("POST", `/users/${serviceAccount.id}/role-mappings/clients/${apiClient.id}`, [apiRoleRep])
  console.log(`Granted '${apiRole}' on ${apiClientId} to ${clientId}'s service account`)
}
console.log(`[${realm}] ${clientId}: role '${role}' ready`)
