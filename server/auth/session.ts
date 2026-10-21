// Who is asking, and may they see this dashboard?
//
// Login belongs to the registry's IAM (the staff portal API). After login IAM
// sets its session cookies on the registry's cookie domain, which this
// dashboard is served under, so the browser sends them here too. This module
// asks IAM whether they are still valid (GET /auth/get_user_profile, which also
// returns the user's Keycloak client roles) and checks for the dashboard role.
//
// Access is a Keycloak client role on the dashboard's own client
// (DASHBOARD_CLIENT_ID, also its IAM application mnemonic), so the same grant
// that enables the dashboard tile in the staff portal also opens the
// dashboard itself.
import { createHash } from "node:crypto"
import { LRUCache } from "lru-cache"
import { config } from "../config"

export const SESSION_COOKIES = ["X-Access-Token", "X-ID-Token", "X-Session-Id", "X-CSRF-Token"] as const

export interface SessionUser {
  name: string
  sub: string
  roles: string[]
}

export type SessionCheck =
  | { kind: "ok"; user: SessionUser }
  | { kind: "forbidden"; user: SessionUser }
  | { kind: "anonymous" }
  | { kind: "unavailable"; message: string }

type CookieReader = { get(name: string): { value: string } | undefined }

const cache = new LRUCache<string, SessionCheck>({ max: 2000, ttl: config.auth.sessionTtlMs })

/** Synthetic user when AUTH_ENABLED=false (local UI work only). */
const DEV_USER: SessionUser = { name: "Auth disabled", sub: "dev", roles: [config.auth.role] }

export async function checkSession(cookies: CookieReader): Promise<SessionCheck> {
  if (!config.auth.enabled) return { kind: "ok", user: DEV_USER }

  const access = cookies.get("X-Access-Token")?.value
  if (!access) return { kind: "anonymous" }

  const sessionId = cookies.get("X-Session-Id")?.value ?? ""
  const key = `${sessionId}:${createHash("sha256").update(access).digest("hex").slice(0, 32)}`
  const cached = cache.get(key)
  if (cached) return cached

  const cookieHeader = SESSION_COOKIES.flatMap(name => {
    const value = cookies.get(name)?.value
    return value ? [`${name}=${value}`] : []
  }).join("; ")

  let res: Response
  try {
    res = await fetch(`${config.auth.iamUrl}/auth/get_user_profile`, {
      headers: { Authorization: `Bearer ${access}`, Cookie: cookieHeader, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    })
  } catch (error) {
    return { kind: "unavailable", message: error instanceof Error ? error.message : String(error) }
  }

  // An expired or revoked session is not cached: the next request may carry
  // refreshed cookies.
  if (res.status === 401 || res.status === 403) return { kind: "anonymous" }
  if (!res.ok) return { kind: "unavailable", message: `IAM returned HTTP ${res.status}` }

  const profile = (await res.json()) as {
    name?: string
    sub?: string
    client_roles?: Record<string, string[]>
  }
  const roles = profile.client_roles?.[config.auth.clientId] ?? []
  const user: SessionUser = { name: profile.name || "Staff user", sub: profile.sub || "", roles }
  const result: SessionCheck = roles.includes(config.auth.role) ? { kind: "ok", user } : { kind: "forbidden", user }
  cache.set(key, result)
  return result
}

/** A same-origin path to return to after login; anything else falls back to "/". */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/"
  return value
}
