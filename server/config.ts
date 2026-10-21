// Server-side settings, read from the environment once per process.
// Everything that differs between environments lives here, so the rest of the
// code never reads process.env directly. See .env.example for the full list.

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value ? value : fallback
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) return fallback
  return !["0", "false", "no", "off"].includes(value)
}

const trimSlash = (value: string) => value.replace(/\/+$/, "")

export const config = {
  /**
   * Where chart rows come from. `http` reads the registry's dashboard-api.
   * See server/data/index.ts for how another source plugs in.
   */
  chartSource: optional("CHART_SOURCE", "http"),
  /** Base URL of the registry's dashboard-api (cluster-internal). */
  get dashboardApiUrl() {
    return trimSlash(required("DASHBOARD_API_URL"))
  },
  /** How long chart rows are served before a background refresh (min 60 s). */
  cacheTtlMs: Math.max(60, Number(process.env.DASHBOARD_CACHE_TTL_SECONDS) || 900) * 1000,

  /** How this server proves itself to the dashboard-api (server/auth/service-token.ts). */
  dashboardApiAuth: {
    /**
     * `none`: no credentials; the network alone keeps other callers out.
     * `client-credentials`: a Keycloak token of this dashboard's own client
     * (auth.clientId) on every chart request.
     */
    mode: optional("DASHBOARD_API_AUTH", "none"),
    /** Keycloak token endpoint; empty: that of the realm IAM signs staff in with. */
    tokenUrl: optional("OIDC_TOKEN_URL", ""),
    /** Secret of auth.clientId (the same client that registers the dashboard with IAM). */
    get clientSecret() {
      return required("DASHBOARD_CLIENT_SECRET")
    },
  },

  auth: {
    /** Off only for local UI work; every route is open when false. */
    enabled: flag("AUTH_ENABLED", true),
    /** The registry's IAM (staff portal API), browser-reachable. */
    get iamUrl() {
      return trimSlash(required("IAM_URL"))
    },
    /** IAM login provider; empty: discovered (server/auth/login-provider.ts). */
    loginProviderId: optional("LOGIN_PROVIDER_ID", ""),
    /** Keycloak client (= IAM application mnemonic) holding the access role. */
    clientId: optional("DASHBOARD_CLIENT_ID", "livestock-registry-dashboard"),
    /** Client role that grants access to this dashboard. */
    role: optional("DASHBOARD_ROLE", "Dashboard Viewer"),
    /** Domain IAM scopes its session cookies to; logout clears them there. */
    cookieDomain: optional("COOKIE_DOMAIN", ""),
    /**
     * Keycloak's end-session endpoint and IAM's client id. Used to end the
     * Keycloak session when IAM cannot (expired session); empty skips it.
     */
    oidcLogoutUrl: optional("OIDC_LOGOUT_URL", ""),
    oidcClientId: optional("OIDC_CLIENT_ID", ""),
    /** How long a validated session is trusted before IAM is asked again. */
    sessionTtlMs: Math.max(5, Number(process.env.SESSION_CACHE_SECONDS) || 60) * 1000,
  },

  /** Public origin of this dashboard, used to build login return URLs. */
  get publicUrl() {
    return trimSlash(required("PUBLIC_URL"))
  },
  /** Links shown in the header; empty hides the link. */
  staffPortalUrl: trimSlash(optional("STAFF_PORTAL_URL", "")),
  registryPortalUrl: trimSlash(optional("REGISTRY_PORTAL_URL", "")),
}
