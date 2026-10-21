"use client"

// Loads several charts in one request to /api/charts and re-loads when the
// filters change. Successful responses are cached in memory per chart set +
// filters, so going back to a previous filter is instant.
import { useEffect, useState } from "react"

// Chart rows are free-form aggregates whose columns each view knows by name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChartRow = Record<string, any>

export interface ChartGroupResult {
  data: Record<string, ChartRow[]>
  errors: Array<{ chart: string; error: string | null }>
}

const cache = new Map<string, ChartGroupResult>()

interface Loaded {
  key: string
  data: ChartGroupResult | null
  error: string | null
}

export function useChartGroupData(chartNames: string[], filters: Record<string, string | undefined>) {
  const chartKey = chartNames.join(",")
  const cleaned = Object.fromEntries(
    Object.entries(filters || {}).filter(([, value]) => value && value !== "all"),
  ) as Record<string, string>
  const filterKey = JSON.stringify(cleaned)
  const cacheKey = `${chartKey}:${filterKey}`

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const cached = cache.get(cacheKey)

  useEffect(() => {
    if (cache.has(cacheKey)) return
    let cancelled = false
    const params = new URLSearchParams({ charts: chartKey, ...(JSON.parse(filterKey) as Record<string, string>) })

    fetch(`/api/charts?${params.toString()}`)
      .then(async response => {
        if (response.status === 401) {
          // Session ended while the page was open: go through login again. A full
          // navigation on purpose: /api/auth/login is a route handler that
          // redirects to IAM, not a page the router could render.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = await response.json()
        const result: ChartGroupResult = { data: {}, errors: [] }
        for (const name of chartKey.split(",")) {
          const entry = body.data?.[name]
          result.data[name] = entry?.data || []
          if (!entry?.success) result.errors.push({ chart: name, error: entry?.error || "Unknown error" })
        }
        if (result.errors.length === 0) cache.set(cacheKey, result)
        if (!cancelled) setLoaded({ key: cacheKey, data: result, error: null })
      })
      .catch(err => {
        if (!cancelled) setLoaded({ key: cacheKey, data: null, error: err instanceof Error ? err.message : "Unknown error" })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, chartKey, filterKey])

  const current = loaded?.key === cacheKey ? loaded : null
  return {
    data: cached ?? current?.data ?? null,
    loading: !cached && !current,
    error: current?.error ?? null,
  }
}
