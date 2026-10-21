// An access token for the dashboard-api, as this dashboard itself.
//
// With its authentication on, the dashboard-api accepts only tokens the
// registry's Keycloak issued to a client holding its role (by default
// `charts:read` on `livestock-registry-dashboard-api`). This server gets one with
// the client-credentials grant for its own Keycloak client (DASHBOARD_CLIENT_ID
// and DASHBOARD_CLIENT_SECRET), the client whose service account also
// registers the dashboard with IAM. No user is involved: chart rows are cached
// across users and refreshed in the background, when nobody is signed in.
//
// The token is reused until shortly before it expires, and concurrent callers
// share one request. Its endpoint is OIDC_TOKEN_URL or, by default, that of the
// realm IAM signs staff in with, discovered once. The dashboard-api trusts the
// realms of the same IAM (its AUTH_IAM_URL), so neither side configures a realm
// URL. Keycloak sets a token's `iss` from the URL it was requested at, so an
// explicit OIDC_TOKEN_URL must name a realm the dashboard-api trusts.
import { config } from "../config"
import { loginProviderId, startSignIn } from "./login-provider"

/** Refresh this long before expiry, so a token never lapses in flight. */
const EARLY_REFRESH_MS = 30_000

export interface TokenSource {
  token(): Promise<string>
  /** Forget the current token (the API rejected it); the next call fetches anew. */
  invalidate(): void
}

export class ClientCredentialsToken implements TokenSource {
  private current?: { value: string; expiresAt: number }
  private pending?: Promise<string>

  constructor(
    private readonly tokenUrl: () => Promise<string>,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  token(): Promise<string> {
    if (this.current && Date.now() < this.current.expiresAt) return Promise.resolve(this.current.value)
    this.pending ??= this.request().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  invalidate(): void {
    this.current = undefined
  }

  private async request(): Promise<string> {
    const url = await this.tokenUrl()
    // client_secret_basic: id and secret form-encoded, then Base64 (RFC 6749 2.3.1).
    const basic = Buffer.from(`${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret)}`).toString("base64")
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
      error?: string
      error_description?: string
    }
    if (!res.ok || !data.access_token) {
      const reason = data.error_description || data.error || ""
      throw new Error(`token endpoint ${url} answered HTTP ${res.status}${reason ? `: ${reason}` : ""}`)
    }
    const lifetimeMs = Math.max(0, Number(data.expires_in) || 60) * 1000
    // A short-lived token is still reused for half its life.
    const reuseMs = Math.max(lifetimeMs - EARLY_REFRESH_MS, lifetimeMs / 2)
    this.current = { value: data.access_token, expiresAt: Date.now() + reuseMs }
    return data.access_token
  }
}

/** The token endpoint of the realm behind the login provider (Keycloak URL layout). */
async function discoverTokenUrl(): Promise<string> {
  const authorization = new URL(await startSignIn(await loginProviderId(), `${config.publicUrl}/`))
  const match = authorization.pathname.match(/^(.*\/realms\/[^/]+)\/protocol\/openid-connect\/auth$/)
  if (!match) throw new Error(`IAM's sign-in does not lead to a Keycloak realm: ${authorization.origin}${authorization.pathname}`)
  return `${authorization.origin}${match[1]}/protocol/openid-connect/token`
}

const holder = globalThis as typeof globalThis & { __tokenUrl?: Promise<string> }

function tokenUrl(): Promise<string> {
  if (config.dashboardApiAuth.tokenUrl) return Promise.resolve(config.dashboardApiAuth.tokenUrl)
  holder.__tokenUrl ??= discoverTokenUrl().then(
    url => {
      console.log(`[charts] dashboard-api tokens from ${url}`)
      return url
    },
    error => {
      holder.__tokenUrl = undefined // retry on the next refresh
      throw error
    },
  )
  return holder.__tokenUrl
}

/** The dashboard-api's credentials for the configured mode; undefined for `none`. */
export function dashboardApiTokens(): TokenSource | undefined {
  switch (config.dashboardApiAuth.mode) {
    case "none":
      return undefined
    case "client-credentials":
      return new ClientCredentialsToken(tokenUrl, config.auth.clientId, config.dashboardApiAuth.clientSecret)
    default:
      throw new Error(`Unknown DASHBOARD_API_AUTH "${config.dashboardApiAuth.mode}" (none or client-credentials)`)
  }
}
