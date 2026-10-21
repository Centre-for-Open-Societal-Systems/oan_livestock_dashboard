import type { ChartFilters, ChartId, Rows } from "./catalog"

/**
 * Produces the aggregate rows for one chart.
 *
 * This is the seam between the dashboard and its data. Today the only
 * implementation calls the registry's dashboard-api over HTTP
 * (http-chart-source.ts). Folding that service into this one later means
 * adding a second implementation that runs the same aggregate queries against
 * the registry's reporting views, and selecting it with CHART_SOURCE; nothing
 * above this interface changes. Implementations must return exactly the rows
 * the catalog promises, aggregates only (never per-person records).
 */
export interface ChartSource {
  /** Name used in logs. */
  readonly name: string
  rows(chart: ChartId, filters: ChartFilters): Promise<Rows>
  /** Cheap reachability check for /api/health. */
  ping(): Promise<boolean>
}
