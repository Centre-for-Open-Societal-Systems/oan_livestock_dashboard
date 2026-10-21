// The dashboard's own API (backend-for-frontend), mounted under /api by
// app/api/[[...slugs]]/route.ts. Every route except /health sits behind the
// session check in proxy.ts.
//
//   GET /api/health          liveness + whether the chart source answers
//   GET /api/me              the signed-in user (for the header)
//   GET /api/charts          ?charts=a,b,c&<filters>  rows for several charts
//   GET /api/filter-options  regions + record statuses for the filter bar
//   GET /api/locations       ?regionId= | ?zoneId= | ?woredaId=  child units
//
// Filter locations come from the shared location catalog (the farmer
// registry's Master Data catalog, see server/geo-catalog.ts), not from the map
// boundaries, which are older and miss units the registries record.
import { Elysia } from "elysia"
import { cookies } from "next/headers"
import { getGeoCatalog } from "./geo-catalog"
import { checkSession } from "./auth/session"
import { config } from "./config"
import { CHARTS, isChartId, RECORD_STATE_CHART } from "./data/catalog"
import { cleanFilters, getChart, pingSource } from "./data"

type ChartResult = { data: Record<string, unknown>[]; success: boolean; error: string | null }

const pickCode = (value: unknown) => {
  const v = typeof value === "string" ? value.trim().toUpperCase() : ""
  return v && v !== "ALL" ? v : null
}

export function createApp(prefix = "/api") {
  return new Elysia({ prefix })
    .get("/health", async () => {
      const source = await pingSource()
      return { status: source ? "ok" : "degraded", chartSource: source ? "reachable" : "unreachable" }
    })

    .get("/me", async ({ set }) => {
      const session = await checkSession(await cookies())
      if (session.kind !== "ok") {
        set.status = 401
        return { error: "Not signed in" }
      }
      return {
        name: session.user.name,
        links: { staffPortal: config.staffPortalUrl || null, registryPortal: config.registryPortalUrl || null },
      }
    })

    .get("/charts", async ({ query, set }) => {
      const requested = String(query.charts ?? "").split(",").map(s => s.trim()).filter(Boolean)
      const unknown = requested.filter(id => !isChartId(id))
      if (requested.length === 0 || unknown.length > 0) {
        set.status = 400
        return {
          success: false,
          error: requested.length === 0 ? "No charts requested" : `Unknown charts: ${unknown.join(", ")}`,
          available: CHARTS,
        }
      }

      const filters = cleanFilters(query as Record<string, unknown>)
      const results = await Promise.all(
        requested.map(async (id): Promise<[string, ChartResult]> => {
          try {
            return [id, { data: await getChart(id as (typeof CHARTS)[number], filters), success: true, error: null }]
          } catch (error) {
            return [id, { data: [], success: false, error: error instanceof Error ? error.message : "Unknown error" }]
          }
        }),
      )
      const failed = results.filter(([, r]) => !r.success).length
      return {
        success: true,
        data: Object.fromEntries(results),
        summary: { total: requested.length, successful: requested.length - failed, failed },
        filters,
      }
    })

    .get("/filter-options", async ({ set }) => {
      try {
        const [{ regions }, states] = await Promise.all([
          getGeoCatalog(),
          getChart(RECORD_STATE_CHART.id, {}).catch(error => {
            console.warn("[filter-options] record statuses unavailable:", error instanceof Error ? error.message : error)
            return []
          }),
        ])
        return {
          regions: regions.map(r => ({ id: r.id, code: r.id, name: r.name })),
          recordStatuses: states.map(r => ({
            status: String(r[RECORD_STATE_CHART.statusColumn]),
            count: Number(r[RECORD_STATE_CHART.countColumn]) || 0,
          })),
        }
      } catch (error) {
        console.error("[filter-options] failed:", error)
        set.status = 500
        return { error: "Failed to load filter options" }
      }
    })

    .get("/locations", async ({ query, set }) => {
      const region = pickCode(query.regionId)
      const zone = pickCode(query.zoneId)
      const woreda = pickCode(query.woredaId)
      try {
        const geo = await getGeoCatalog()
        if (region) return { zones: geo.children("zones", region) }
        if (zone) return { woredas: geo.children("woredas", zone) }
        if (woreda) return { kebeles: geo.children("kebeles", woreda) }
        set.status = 400
        return { error: "One of regionId, zoneId or woredaId is required" }
      } catch (error) {
        console.error("[locations] failed:", error)
        set.status = 500
        return { error: "Failed to load locations" }
      }
    })
}
