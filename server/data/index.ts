// Cached access to chart rows, whatever the source.
//
// The rows come from reporting views refreshed on a schedule, so each
// chart+filter combination is fetched at most once per TTL (default 15 min);
// in between, and while a refresh is in flight or failing, the last good rows
// are served (stale-while-revalidate).
import { LRUCache } from "lru-cache"
import { dashboardApiTokens } from "../auth/service-token"
import { config } from "../config"
import { CHARTS, FILTER_NAMES, type ChartFilters, type ChartId, type Rows } from "./catalog"
import type { ChartSource } from "./chart-source"
import { HttpChartSource } from "./http-chart-source"

function createSource(): ChartSource {
  switch (config.chartSource) {
    case "http":
      return new HttpChartSource(config.dashboardApiUrl, dashboardApiTokens())
    // case "sql": a source that queries the reporting views directly, once the
    // dashboard-api is folded into this service.
    default:
      throw new Error(`Unknown CHART_SOURCE "${config.chartSource}"`)
  }
}

interface FetchContext {
  chart: ChartId
  filters: ChartFilters
}

function createCache(source: ChartSource) {
  return new LRUCache<string, Rows, FetchContext>({
    max: 1000,
    ttl: config.cacheTtlMs,
    // Serve stale rows while the refresh runs, and keep them if it fails.
    allowStale: true,
    noDeleteOnStaleGet: true,
    allowStaleOnFetchRejection: true,
    allowStaleOnFetchAbort: true,
    // Reads must not extend the TTL, or a popular key would never refresh.
    updateAgeOnGet: false,
    fetchMethod: async (_key, _stale, { context }) => {
      try {
        return await source.rows(context.chart, context.filters)
      } catch (error) {
        // Rethrown, never cached: a failure must not be served as data.
        console.warn(`[charts] ${source.name}/${context.chart} refresh failed:`, error instanceof Error ? error.message : error)
        throw error
      }
    },
  })
}

// Next bundles instrumentation.ts (which warms the cache) separately from the
// route handlers (which read it), so keep one instance per process.
const holder = globalThis as typeof globalThis & {
  __chartData?: { source: ChartSource; cache: ReturnType<typeof createCache> }
}

function state() {
  if (!holder.__chartData) {
    const source = createSource()
    holder.__chartData = { source, cache: createCache(source) }
  }
  return holder.__chartData
}

/** Only the filters the catalog declares, without "all"/empty, in a stable order. */
export function cleanFilters(input: Record<string, unknown>): ChartFilters {
  const filters: ChartFilters = {}
  for (const name of FILTER_NAMES) {
    const value = input[name]
    if (typeof value === "string" && value.trim() && value !== "all") filters[name] = value.trim()
  }
  return filters
}

export async function getChart(chart: ChartId, filters: ChartFilters, options: { forceRefresh?: boolean } = {}): Promise<Rows> {
  const key = `${chart}:${JSON.stringify(filters)}`
  const rows = await state().cache.fetch(key, {
    context: { chart, filters },
    forceRefresh: options.forceRefresh ?? false,
  })
  if (rows === undefined) throw new Error(`No data for ${chart}`)
  return rows
}

/** Refreshes the unfiltered view of every chart, which is what the page opens on. */
export async function warmCharts(): Promise<void> {
  const results = await Promise.allSettled(CHARTS.map(chart => getChart(chart, {}, { forceRefresh: true })))
  const failed = results.filter(r => r.status === "rejected").length
  if (failed > 0) console.warn(`[charts] warm-up: ${failed}/${CHARTS.length} charts failed; serving previous data where available`)
}

export const pingSource = () => state().source.ping()
