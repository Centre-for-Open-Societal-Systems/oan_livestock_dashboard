// Shared data shaping for the registry dashboard views.

import { useEffect, useMemo, useState } from "react"

export interface RegistryFilters {
  region: string
  zone: string
  woreda: string
  kebele: string
  recordState: string
}

export interface TrendPoint {
  period: string
  farmers: number
  totalArea: number
  ownedArea: number
  avgArea: number
}

export function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? 0))
  return Number.isFinite(parsed) ? parsed : 0
}

// Age bands as the GEN2 reporting view defines them (policy, set in the
// registry's reporting.yaml). farmersByAgeAndGender returns these codes.
export const AGE_BANDS = ["UNDER_25", "25_34", "35_49", "50_64", "65_PLUS", "UNKNOWN"] as const

const AGE_BAND_LABELS: Record<string, string> = {
  UNDER_25: "Under 25",
  "25_34": "25–34",
  "35_49": "35–49",
  "50_64": "50–64",
  "65_PLUS": "65+",
  UNKNOWN: "Unknown",
}

export function ageBandLabel(band: string): string {
  return AGE_BAND_LABELS[band] ?? band
}

// landTenureSplit returns the registry's land_ownership_type enum.
const TENURE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  TENANT: "Tenant",
  CROP_SHARE: "Crop share",
  UNKNOWN: "Unknown",
}

export function tenureLabel(value: unknown): string {
  const key = String(value || "UNKNOWN")
  return TENURE_LABELS[key] ?? key
}

// cropLandTenureSplit returns the registry's own label plus its lookup key
// (OWNERSHIP_TYPE_OWNER, …); colour by the key so relabelling cannot recolour.
export function ownershipKind(code: unknown): "Owner" | "Tenant" | "Crop share" | "Unknown" | null {
  const key = String(code || "UNKNOWN").toUpperCase().replace(/^OWNERSHIP_TYPE_/, "")
  if (key === "OWNER") return "Owner"
  if (key === "TENANT") return "Tenant"
  if (key.startsWith("CROP_SHAR")) return "Crop share"
  if (key === "UNKNOWN") return "Unknown"
  return null
}

// herdHealthSplit returns the livestock registry's health_status codes.
const HERD_HEALTH_LABELS: Record<string, string> = {
  HEALTHY: "Healthy",
  SICK: "Sick",
  QUARANTINED: "Quarantined",
  DECEASED: "Deceased",
  UNKNOWN: "Unknown",
}

export function herdHealthLabel(value: unknown): string {
  const key = String(value || "UNKNOWN").toUpperCase()
  return HERD_HEALTH_LABELS[key] ?? key
}

/** "2025-07" -> "Jul 2025" */
export function monthLabel(period: string): string {
  const [year, month] = String(period || "").split("-")
  const index = Number(month) - 1
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return names[index] ? `${names[index]} ${year}` : period
}

export function useRegistryTrend(rows: any[] | undefined): { series: TrendPoint[] } {
  const series = useMemo<TrendPoint[]>(() => {
    return (rows || [])
      .map((row: any) => {
        const farmers = toNumber(row.farmers)
        const totalArea = toNumber(row.total_area)
        return {
          period: String(row.period),
          farmers,
          totalArea,
          ownedArea: toNumber(row.owned_area),
          avgArea: farmers > 0 ? totalArea / farmers : 0,
        }
      })
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [rows])

  return { series }
}

/**
 * Derives a 12-point sparkline plus a period-over-period delta from a monthly
 * series. Cumulative metrics (stock, e.g. hectares registered to date) climb,
 * while rate metrics (e.g. average plot size) are plotted as-is.
 */
export function buildTrend(
  series: TrendPoint[],
  key: keyof Omit<TrendPoint, "period">,
  { cumulative = false }: { cumulative?: boolean } = {}
): { spark: number[]; delta?: { percent: number; note: string } } {
  if (series.length < 2) return { spark: [] }

  const values = series.map((point) => point[key])

  let spark: number[]
  if (cumulative) {
    let running = 0
    const cumulated = values.map((value) => (running += value))
    spark = cumulated.slice(-12)
  } else {
    spark = values.slice(-12)
  }

  const window = Math.min(12, Math.floor(series.length / 2))
  if (window < 1) return { spark }

  const recent = values.slice(-window)
  const previous = values.slice(-window * 2, -window)
  if (!previous.length) return { spark }

  const sum = (list: number[]) => list.reduce((acc, value) => acc + value, 0)
  const recentValue = cumulative ? sum(recent) : sum(recent) / recent.length
  const previousValue = cumulative ? sum(previous) : sum(previous) / previous.length

  if (previousValue === 0) return { spark }

  return {
    spark,
    delta: {
      percent: ((recentValue - previousValue) / previousValue) * 100,
      note: `vs previous ${window} months`,
    },
  }
}

// ---------------------------------------------------------------------------
// Geographic coverage
// ---------------------------------------------------------------------------

/** A woreda in the map boundaries, with its parent P-codes. */
export interface WoredaUnit {
  woreda: string
  zone: string
  region: string
}

let woredaUnitsRequest: Promise<WoredaUnit[]> | null = null

function loadWoredaUnits(): Promise<WoredaUnit[]> {
  woredaUnitsRequest ??= fetch("/api/maps/units")
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<WoredaUnit[]>
    })
    .catch(error => {
      woredaUnitsRequest = null // allow a retry on the next mount
      throw error
    })
  return woredaUnitsRequest
}

/** Every woreda the map can draw. Loaded once per page. */
export function useWoredaUnits(): WoredaUnit[] | null {
  const [units, setUnits] = useState<WoredaUnit[] | null>(null)
  useEffect(() => {
    let active = true
    loadWoredaUnits()
      .then(list => { if (active) setUnits(list) })
      .catch(() => { if (active) setUnits([]) })
    return () => { active = false }
  }, [])
  return units
}

const selected = (value: string | undefined) => (value && value !== "all" ? value.toUpperCase() : null)

/**
 * Woredas reached by the registry within the selected area.
 *
 * The denominator is the woredas of the map boundaries inside the current
 * region / zone / woreda filter; the numerator is those with at least one
 * farmer in `farmersByWoreda` (fetched with the same filters). Both come from
 * the same codes the map draws, so coverage and the map always agree.
 */
export function woredaCoverage(
  units: WoredaUnit[] | null,
  filters: Pick<RegistryFilters, "region" | "zone" | "woreda">,
  woredaRows: Array<Record<string, unknown>> | undefined
): { total: number; covered: number } {
  if (!units) return { total: 0, covered: 0 }
  const region = selected(filters.region)
  const zone = selected(filters.zone)
  const woreda = selected(filters.woreda)
  const inScope = units.filter(u =>
    woreda ? u.woreda === woreda : zone ? u.zone === zone : region ? u.region === region : true
  )
  const reached = new Set(
    (woredaRows || [])
      .filter(row => toNumber(row.farmers) > 0)
      .map(row => String(row.woreda_code || "").toUpperCase())
  )
  return { total: inScope.length, covered: inScope.filter(u => reached.has(u.woreda)).length }
}
