import type { TokenSource } from "../auth/service-token"
import type { ChartSource } from "./chart-source"
import type { ChartFilters, ChartId, Rows } from "./catalog"

/**
 * Reads charts from the registry's dashboard-api:
 *   GET <baseUrl>/api/v1/charts/<chartId>?<filters>  ->  JSON array of rows
 * The service may wrap the array as `{ data: [...] }`.
 *
 * The dashboard-api owns the registry database credentials; this process only
 * knows its URL. It is never exposed publicly. With `tokens`, every chart
 * request carries this dashboard's client-credentials token; a 401 drops the
 * token and retries once with a fresh one (revoked, or keys rotated).
 */
export class HttpChartSource implements ChartSource {
  readonly name = "dashboard-api"

  constructor(
    private readonly baseUrl: string,
    private readonly tokens?: TokenSource,
    private readonly timeoutMs = 15_000,
  ) {}

  async rows(chart: ChartId, filters: ChartFilters): Promise<Rows> {
    const query = new URLSearchParams(filters as Record<string, string>).toString()
    const url = `${this.baseUrl}/api/v1/charts/${encodeURIComponent(chart)}${query ? `?${query}` : ""}`
    let res = await this.get(url)
    if (res.status === 401 && this.tokens) {
      this.tokens.invalidate()
      res = await this.get(url)
    }
    if (!res.ok) throw new Error(`${chart} returned HTTP ${res.status}${hint(res.status, Boolean(this.tokens))}`)
    const body: unknown = await res.json()
    if (Array.isArray(body)) return body as Rows
    const data = (body as { data?: unknown } | null)?.data
    if (Array.isArray(data)) return data as Rows
    throw new Error(`${chart} returned no rows`)
  }

  /** /health needs no token: it only says the service and its database are up. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { cache: "no-store", signal: AbortSignal.timeout(3_000) })
      return res.ok
    } catch {
      return false
    }
  }

  private async get(url: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (this.tokens) headers.Authorization = `Bearer ${await this.tokens.token()}`
    return fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(this.timeoutMs) })
  }
}

/** What an authentication failure usually means, for the log. */
function hint(status: number, withToken: boolean): string {
  if (status === 401) {
    return withToken
      ? " (token rejected: does the dashboard-api trust the realm this dashboard gets tokens from? See its AUTH_IAM_URL)"
      : " (the dashboard-api requires a token: set DASHBOARD_API_AUTH=client-credentials)"
  }
  if (status === 403) return " (this dashboard's Keycloak client lacks the dashboard-api's role)"
  if (status === 503) return " (the dashboard-api cannot read its trusted issuers from IAM, or their signing keys)"
  return ""
}
